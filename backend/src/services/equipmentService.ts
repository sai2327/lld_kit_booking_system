import prisma from '../db/prisma.js';
import {
  BookingStatus,
  KitItemState,
  ItemType,
  ItemCondition,
  InspectionResult,
  DisruptionStatus,
  WarningStatus,
  Role,
} from '@prisma/client';
import { kitLock } from '../utils/kitLock.js';
import {
  NotFoundError,
  InvalidStateError,
  KitNotReadyError,
  ValidationError,
} from '../middleware/errorHandler.js';
import { NotificationService } from './notificationService.js';
import { io } from '../server.js';

export const REQUIRED_ITEM_TYPES = [
  ItemType.CAMERA,
  ItemType.MIC,
  ItemType.TRIPOD,
];

export interface CheckoutParams {
  bookingId: string;
  coordinatorId: string;
  itemConditions: Record<string, ItemCondition>; // itemId -> condition
  clock?: Date;
}

export interface ReturnAndInspectParams {
  bookingId: string;
  coordinatorId: string;
  observations: Record<
    string,
    {
      returned: boolean;
      condition: ItemCondition;
      result: InspectionResult;
      note?: string;
    }
  >;
  clock?: Date;
}

export interface RecoverItemParams {
  disruptionId: string;
  itemId: string;
  coordinatorId: string;
  inspectionResult: InspectionResult;
  note?: string;
  clock?: Date;
}

export interface ReplaceItemParams {
  disruptionId: string;
  oldItemId: string;
  coordinatorId: string;
  serialNumber: string;
  conditionNote?: string;
  initialInspectionResult: InspectionResult;
  clock?: Date;
}

export class EquipmentService {
  /**
   * Coordinator checks out the kit to a club.
   * Requires that all 3 required types (CAMERA, MIC, TRIPOD) are present,
   * in AVAILABLE state, and observed USABLE.
   */
  static async checkoutBooking(params: CheckoutParams) {
    const { bookingId, coordinatorId, itemConditions, clock = new Date() } = params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        kit: { include: { items: true } },
        club: true,
      },
    });

    if (!booking) {
      throw new NotFoundError(`Booking ${bookingId} not found`);
    }

    // State machine check: Must be RESERVED or AT_RISK
    if (
      booking.status !== BookingStatus.RESERVED &&
      booking.status !== BookingStatus.AT_RISK
    ) {
      throw new InvalidStateError(
        `Cannot check out booking with status ${booking.status}. Expected RESERVED or AT_RISK.`
      );
    }

    // Interval check: Must occur within [start, end)
    const nowMs = clock.getTime();
    if (nowMs < booking.start.getTime()) {
      throw new InvalidStateError(
        'Cannot check out before scheduled booking start time'
      );
    }
    if (nowMs >= booking.end.getTime()) {
      throw new InvalidStateError(
        'Cannot check out after scheduled booking end time'
      );
    }

    // Verify Kit completeness: must have CAMERA, MIC, TRIPOD
    const kit = booking.kit;
    const itemsByType = new Map<ItemType, typeof kit.items[0]>();
    for (const item of kit.items) {
      if (item.state === KitItemState.AVAILABLE) {
        itemsByType.set(item.type, item);
      }
    }

    for (const reqType of REQUIRED_ITEM_TYPES) {
      if (!itemsByType.has(reqType)) {
        throw new KitNotReadyError(
          `Kit incomplete: Missing available ${reqType}. Equipment cannot be handed over.`
        );
      }
    }

    // Verify coordinator observations: each required item must be present and USABLE
    const observedItemIds = Object.keys(itemConditions || {});
    if (observedItemIds.length !== 3) {
      throw new KitNotReadyError(
        'Checkout verification must record condition for all 3 required items'
      );
    }

    for (const reqType of REQUIRED_ITEM_TYPES) {
      const activeItem = itemsByType.get(reqType)!;
      const condition = itemConditions[activeItem.id];
      if (!condition || condition !== ItemCondition.USABLE) {
        throw new KitNotReadyError(
          `Item ${activeItem.serialNumber} (${activeItem.type}) is not verified usable (condition: ${condition || 'missing'})`
        );
      }
    }

    return await kitLock.acquire(kit.id, async () => {
      return await prisma.$transaction(async (tx) => {
        // Mark all 3 items CHECKED_OUT
        const itemIdsToCheckout = Array.from(itemsByType.values()).map((i) => i.id);
        await tx.kitItem.updateMany({
          where: { id: { in: itemIdsToCheckout } },
          data: { state: KitItemState.CHECKED_OUT },
        });

        // Create HandoverRecord
        const handover = await tx.handoverRecord.create({
          data: {
            bookingId: booking.id,
            coordinatorId,
            checkoutAt: clock,
            checkoutItems: JSON.stringify(itemConditions),
          },
        });

        // Update Booking
        const updatedBooking = await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.CHECKED_OUT,
            checkedOutAt: clock,
            riskReasons: '[]',
          },
        });

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: coordinatorId,
            actorRole: Role.COORDINATOR,
            action: 'CHECKOUT_KIT',
            entityType: 'BOOKING',
            entityId: booking.id,
            details: JSON.stringify({
              items: itemIdsToCheckout,
              itemConditions,
            }),
          },
        });

        return { handover, booking: updatedBooking };
      });
    }).then((result) => {
      try {
        io.emit('equipment_checked_out', {
          bookingId: result.booking.id,
          clubId: result.booking.clubId,
          checkoutAt: result.handover.checkoutAt,
        });
      } catch (_e) {}
      return result;
    });
  }

  /**
   * Coordinator records item-by-item return and inspection outcomes.
   * If any item is missing or damaged, automatically detects disruption and warns next booking.
   */
  static async returnAndInspect(params: ReturnAndInspectParams) {
    const { bookingId, coordinatorId, observations, clock = new Date() } = params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        kit: { include: { items: true } },
        club: true,
        handover: true,
      },
    });

    if (!booking) {
      throw new NotFoundError(`Booking ${bookingId} not found`);
    }

    if (booking.status !== BookingStatus.CHECKED_OUT) {
      throw new InvalidStateError(
        `Cannot return booking with status ${booking.status}. Expected CHECKED_OUT.`
      );
    }

    const kit = booking.kit;
    const checkedOutItems = kit.items.filter(
      (item) => item.state === KitItemState.CHECKED_OUT
    );

    return await kitLock.acquire(kit.id, async () => {
      return await prisma.$transaction(async (tx) => {
        const itemInspectionResults: Record<string, InspectionResult> = {};
        const missingOrDamagedItemIds: string[] = [];

        for (const item of checkedOutItems) {
          const obs = observations[item.id];
          let finalState: KitItemState;
          let finalResult: InspectionResult;

          if (!obs || obs.returned === false || obs.condition === ItemCondition.MISSING) {
            finalState = KitItemState.MISSING;
            finalResult = InspectionResult.MISSING;
            missingOrDamagedItemIds.push(item.id);
          } else {
            finalResult = obs.result;
            if (obs.result === InspectionResult.PASS) {
              finalState = KitItemState.AVAILABLE;
            } else if (obs.result === InspectionResult.DAMAGED) {
              finalState = KitItemState.DAMAGED;
              missingOrDamagedItemIds.push(item.id);
            } else {
              finalState = KitItemState.MISSING;
              missingOrDamagedItemIds.push(item.id);
            }
          }

          itemInspectionResults[item.id] = finalResult;

          // Update KitItem
          await tx.kitItem.update({
            where: { id: item.id },
            data: {
              state: finalState,
              conditionNote: obs?.note || null,
            },
          });

          // Create InspectionRecord
          await tx.inspectionRecord.create({
            data: {
              bookingId: booking.id,
              itemId: item.id,
              coordinatorId,
              inspectedAt: clock,
              result: finalResult,
              notes: obs?.note || null,
            },
          });
        }

        // Update HandoverRecord with return timestamp and items
        await tx.handoverRecord.update({
          where: { bookingId: booking.id },
          data: {
            returnAt: clock,
            returnItems: JSON.stringify(observations),
          },
        });

        // Complete source booking (evidence recorded)
        const completedBooking = await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.COMPLETED,
            returnedAt: clock,
          },
        });

        // Disruption Detection & Notification (R4)
        let disruption = null;
        let warning = null;

        if (missingOrDamagedItemIds.length > 0) {
          // Find earliest next non-cancelled booking
          const nextBooking = await tx.booking.findFirst({
            where: {
              kitId: kit.id,
              status: { in: [BookingStatus.RESERVED, BookingStatus.AT_RISK] },
              start: { gte: clock },
            },
            orderBy: { start: 'asc' },
            include: { club: true },
          });

          if (nextBooking) {
            // Create Disruption
            disruption = await tx.disruption.create({
              data: {
                sourceBookingId: booking.id,
                affectedBookingId: nextBooking.id,
                affectedItemIds: JSON.stringify(missingOrDamagedItemIds),
                status: DisruptionStatus.OPEN,
              },
            });

            // Transition affected booking to AT_RISK
            await tx.booking.update({
              where: { id: nextBooking.id },
              data: {
                status: BookingStatus.AT_RISK,
                riskReasons: JSON.stringify(missingOrDamagedItemIds),
              },
            });

            const affectedItems = kit.items.filter((i) =>
              missingOrDamagedItemIds.includes(i.id)
            );
            const itemNames = affectedItems.map((i) => `${i.type} (${i.serialNumber})`).join(', ');

            // Create Warning
            warning = await tx.warning.create({
              data: {
                bookingId: nextBooking.id,
                disruptionId: disruption.id,
                recipientClubId: nextBooking.clubId,
                status: WarningStatus.DELIVERED,
                message: `Equipment unavailable from prior booking: ${itemNames}. Your upcoming booking is at risk.`,
                deliveredAt: clock,
              },
            });

            // Create Persistent Notifications
            await tx.notification.create({
              data: {
                clubId: nextBooking.clubId,
                bookingId: nextBooking.id,
                title: 'Upcoming Booking At Risk',
                message: `Equipment (${itemNames}) was returned damaged or missing from a prior session. Coordinators are resolving the disruption.`,
              },
            });

            await tx.notification.create({
              data: {
                title: 'Equipment Disruption Detected',
                message: `Booking ${nextBooking.id} for ${nextBooking.club.name} is now AT_RISK due to: ${itemNames}.`,
              },
            });
          }
        }

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: coordinatorId,
            actorRole: Role.COORDINATOR,
            action: 'RETURN_AND_INSPECT',
            entityType: 'BOOKING',
            entityId: booking.id,
            details: JSON.stringify({
              observations,
              missingOrDamagedItemIds,
              disruptionCreated: disruption ? disruption.id : null,
            }),
          },
        });

        return {
          booking: completedBooking,
          disruption,
          warning,
          missingOrDamagedCount: missingOrDamagedItemIds.length,
        };
      });
    }).then((res) => {
      try {
        io.emit('equipment_returned', {
          bookingId: res.booking.id,
          status: res.booking.status,
          hasDisruption: !!res.disruption,
        });
      } catch (_e) {}
      return res;
    });
  }

  /**
   * Coordinator records recovery of a missing item and inspects it.
   */
  static async recoverItem(params: RecoverItemParams) {
    const { disruptionId, itemId, coordinatorId, inspectionResult, note, clock = new Date() } = params;

    const disruption = await prisma.disruption.findUnique({
      where: { id: disruptionId },
      include: {
        affectedBooking: {
          include: {
            kit: { include: { items: true } },
            club: true,
          },
        },
      },
    });

    if (!disruption) {
      throw new NotFoundError(`Disruption ${disruptionId} not found`);
    }

    if (disruption.status !== DisruptionStatus.OPEN) {
      throw new InvalidStateError(
        `Disruption is not open (current status: ${disruption.status})`
      );
    }

    const affectedItemIds: string[] = JSON.parse(disruption.affectedItemIds || '[]');
    if (!affectedItemIds.includes(itemId)) {
      throw new ValidationError(
        `Item ${itemId} does not belong to disruption ${disruptionId}`
      );
    }

    const item = await prisma.kitItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError(`Item ${itemId} not found`);
    }

    if (item.state !== KitItemState.MISSING) {
      throw new InvalidStateError(
        `Item ${item.serialNumber} is not in MISSING state (current: ${item.state})`
      );
    }

    return await kitLock.acquire(item.kitId, async () => {
      return await prisma.$transaction(async (tx) => {
        // Recover item -> Inspection outcome determines state
        let nextState: KitItemState;
        if (inspectionResult === InspectionResult.PASS) {
          nextState = KitItemState.AVAILABLE;
        } else if (inspectionResult === InspectionResult.DAMAGED) {
          nextState = KitItemState.DAMAGED;
        } else {
          nextState = KitItemState.MISSING;
        }

        const updatedItem = await tx.kitItem.update({
          where: { id: itemId },
          data: {
            state: nextState,
            conditionNote: note || item.conditionNote,
          },
        });

        // Record inspection evidence
        await tx.inspectionRecord.create({
          data: {
            bookingId: disruption.sourceBookingId,
            itemId,
            coordinatorId,
            inspectedAt: clock,
            result: inspectionResult,
            notes: note ? `Recovery inspection: ${note}` : 'Recovery inspection',
          },
        });

        // Check if all 3 required types in the kit are now AVAILABLE
        const allKitItems = await tx.kitItem.findMany({
          where: { kitId: item.kitId },
        });

        const availableTypes = new Set<ItemType>();
        for (const kItem of allKitItems) {
          if (kItem.state === KitItemState.AVAILABLE) {
            availableTypes.add(kItem.type);
          }
        }

        const isKitFullyReady = REQUIRED_ITEM_TYPES.every((t) => availableTypes.has(t));

        let updatedDisruption = disruption;
        if (isKitFullyReady) {
          // Resolve disruption
          updatedDisruption = await tx.disruption.update({
            where: { id: disruptionId },
            data: {
              status: DisruptionStatus.RESOLVED,
              resolvedAt: clock,
            },
            include: {
              affectedBooking: {
                include: { kit: { include: { items: true } }, club: true },
              },
            },
          });

          // Restore affected booking from AT_RISK to RESERVED
          await tx.booking.update({
            where: { id: disruption.affectedBookingId },
            data: {
              status: BookingStatus.RESERVED,
              riskReasons: '[]',
            },
          });

          // Notification that kit is restored
          await tx.notification.create({
            data: {
              clubId: disruption.affectedBooking.clubId,
              bookingId: disruption.affectedBookingId,
              title: 'Kit Restored — Booking Confirmed',
              message: `Missing item (${item.type}) has been recovered and verified. Your kit is fully ready for handover.`,
            },
          });
        }

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: coordinatorId,
            actorRole: Role.COORDINATOR,
            action: 'RECOVER_ITEM',
            entityType: 'KIT_ITEM',
            entityId: itemId,
            details: JSON.stringify({
              disruptionId,
              inspectionResult,
              isKitFullyReady,
            }),
          },
        });

        return { item: updatedItem, disruption: updatedDisruption, isKitFullyReady };
      });
    });
  }

  /**
   * Coordinator records replacement equipment for a missing/damaged item.
   * Old item transitions to REPLACED.
   * New item must be of same type and pass inspection before kit is ready.
   */
  static async replaceItem(params: ReplaceItemParams) {
    const {
      disruptionId,
      oldItemId,
      coordinatorId,
      serialNumber,
      conditionNote,
      initialInspectionResult,
      clock = new Date(),
    } = params;

    const disruption = await prisma.disruption.findUnique({
      where: { id: disruptionId },
      include: {
        affectedBooking: {
          include: {
            kit: { include: { items: true } },
            club: true,
          },
        },
      },
    });

    if (!disruption) {
      throw new NotFoundError(`Disruption ${disruptionId} not found`);
    }

    if (disruption.status !== DisruptionStatus.OPEN) {
      throw new InvalidStateError(
        `Disruption is not open (current status: ${disruption.status})`
      );
    }

    const oldItem = await prisma.kitItem.findUnique({
      where: { id: oldItemId },
    });

    if (!oldItem) {
      throw new NotFoundError(`Old item ${oldItemId} not found`);
    }

    if (oldItem.state !== KitItemState.MISSING && oldItem.state !== KitItemState.DAMAGED) {
      throw new InvalidStateError(
        `Item ${oldItem.serialNumber} must be MISSING or DAMAGED to be replaced (current: ${oldItem.state})`
      );
    }

    return await kitLock.acquire(oldItem.kitId, async () => {
      return await prisma.$transaction(async (tx) => {
        // 1. Old item enters terminal active state REPLACED
        const updatedOldItem = await tx.kitItem.update({
          where: { id: oldItemId },
          data: { state: KitItemState.REPLACED },
        });

        // 2. Create new KitItem with same type
        let newState: KitItemState;
        if (initialInspectionResult === InspectionResult.PASS) {
          newState = KitItemState.AVAILABLE;
        } else if (initialInspectionResult === InspectionResult.DAMAGED) {
          newState = KitItemState.DAMAGED;
        } else {
          newState = KitItemState.RETURNED_PENDING_INSPECTION;
        }

        const newItem = await tx.kitItem.create({
          data: {
            kitId: oldItem.kitId,
            type: oldItem.type,
            serialNumber,
            state: newState,
            conditionNote: conditionNote || 'Replacement unit',
          },
        });

        // 3. Record inspection evidence for the replacement
        await tx.inspectionRecord.create({
          data: {
            bookingId: disruption.sourceBookingId,
            itemId: newItem.id,
            coordinatorId,
            inspectedAt: clock,
            result: initialInspectionResult,
            notes: `Replacement equipment inspection for ${oldItem.serialNumber}`,
          },
        });

        // 4. Recalculate kit readiness
        const allItems = await tx.kitItem.findMany({
          where: { kitId: oldItem.kitId },
        });

        const availableTypes = new Set<ItemType>();
        for (const it of allItems) {
          if (it.state === KitItemState.AVAILABLE) {
            availableTypes.add(it.type);
          }
        }

        const isKitFullyReady = REQUIRED_ITEM_TYPES.every((t) => availableTypes.has(t));

        let updatedDisruption = disruption;
        if (isKitFullyReady) {
          updatedDisruption = await tx.disruption.update({
            where: { id: disruptionId },
            data: {
              status: DisruptionStatus.RESOLVED,
              resolvedAt: clock,
            },
            include: {
              affectedBooking: {
                include: { kit: { include: { items: true } }, club: true },
              },
            },
          });

          // Transition affected booking to RESERVED
          await tx.booking.update({
            where: { id: disruption.affectedBookingId },
            data: {
              status: BookingStatus.RESERVED,
              riskReasons: '[]',
            },
          });

          await tx.notification.create({
            data: {
              clubId: disruption.affectedBooking.clubId,
              bookingId: disruption.affectedBookingId,
              title: 'Replacement Added — Booking Confirmed',
              message: `A replacement ${oldItem.type} (${newItem.serialNumber}) has been added and verified. Kit is ready for handover.`,
            },
          });
        }

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: coordinatorId,
            actorRole: Role.COORDINATOR,
            action: 'REPLACE_ITEM',
            entityType: 'KIT_ITEM',
            entityId: newItem.id,
            details: JSON.stringify({
              disruptionId,
              replacedItemId: oldItemId,
              replacementSerialNumber: serialNumber,
              initialInspectionResult,
              isKitFullyReady,
            }),
          },
        });

        return {
          oldItem: updatedOldItem,
          newItem,
          disruption: updatedDisruption,
          isKitFullyReady,
        };
      });
    });
  }

  /**
   * Get the single shared event kit and its status.
   */
  static async getSharedKit() {
    const kit = await prisma.kit.findFirst();
    if (!kit) {
      throw new NotFoundError('Shared event kit not found in database');
    }
    return await this.getKitStatus(kit.id);
  }

  /**
   * Get full equipment status for the kit, including items and open disruptions.
   */
  static async getKitStatus(kitId: string) {
    const kit = await prisma.kit.findUnique({
      where: { id: kitId },
      include: {
        items: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!kit) {
      throw new NotFoundError(`Kit ${kitId} not found`);
    }

    const openDisruptions = await prisma.disruption.findMany({
      where: {
        status: DisruptionStatus.OPEN,
        affectedBooking: { kitId },
      },
      include: {
        affectedBooking: {
          include: { club: true },
        },
      },
    });

    // Check if kit is currently ready
    const availableTypes = new Set<ItemType>();
    for (const item of kit.items) {
      if (item.state === KitItemState.AVAILABLE) {
        availableTypes.add(item.type);
      }
    }
    const isReadyForHandover = REQUIRED_ITEM_TYPES.every((t) => availableTypes.has(t));

    return {
      kit,
      isReadyForHandover,
      openDisruptions,
    };
  }

  /**
   * List all disruptions.
   */
  static async listDisruptions() {
    return await prisma.disruption.findMany({
      include: {
        sourceBooking: { include: { club: true } },
        affectedBooking: { include: { club: true } },
        warnings: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
