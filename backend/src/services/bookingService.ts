import prisma from '../db/prisma.js';
import { BookingStatus, Role } from '@prisma/client';
import { BookingConflictPolicy } from '../domain/bookingConflictPolicy.js';
import { kitLock } from '../utils/kitLock.js';
import {
  ValidationError,
  BookingConflictError,
  NotFoundError,
  ForbiddenError,
  InvalidStateError,
} from '../middleware/errorHandler.js';
import { AuthenticatedUser, normalizeRole } from '../middleware/auth.js';
import { io } from '../server.js';

export interface CreateBookingParams {
  kitId: string;
  clubId: string;
  userId: string;
  start: Date;
  end: Date;
  clock?: Date;
}

export interface CancelBookingParams {
  bookingId: string;
  actorUser: AuthenticatedUser;
  clock?: Date;
}

export interface AvailabilityResult {
  available: boolean;
  conflictingBookings: {
    id: string;
    start: Date;
    end: Date;
    status: BookingStatus;
  }[];
}

export class BookingService {
  /**
   * Check slot availability considering existing non-cancelled bookings
   * and the mandatory 15-minute buffer.
   */
  static async checkAvailability(
    kitId: string,
    start: Date,
    end: Date,
    clock: Date = new Date()
  ): Promise<AvailabilityResult> {
    try {
      BookingConflictPolicy.validateInterval(start, end, clock);
    } catch (err: any) {
      throw new ValidationError(err.message);
    }

    // Verify Kit exists
    const kit = await prisma.kit.findUnique({
      where: { id: kitId },
    });
    if (!kit) {
      throw new NotFoundError(`Kit with id ${kitId} not found`);
    }

    const activeBookings = await prisma.booking.findMany({
      where: {
        kitId,
        status: { not: BookingStatus.CANCELLED },
      },
      select: {
        id: true,
        start: true,
        end: true,
        status: true,
      },
    });

    const conflicts = BookingConflictPolicy.findConflicts(
      { start, end },
      activeBookings
    );

    return {
      available: conflicts.length === 0,
      conflictingBookings: conflicts,
    };
  }

  /**
   * Concurrency-safe booking creation using per-kit async lock and database transactions.
   */
  static async createBooking(params: CreateBookingParams) {
    const { kitId, clubId, userId, start, end, clock = new Date() } = params;

    try {
      BookingConflictPolicy.validateInterval(start, end, clock);
    } catch (err: any) {
      throw new ValidationError(err.message);
    }

    // Serialize concurrent reservations for the kit
    return await kitLock.acquire(kitId, async () => {
      return await prisma.$transaction(async (tx) => {
        // 1. Verify Kit exists
        const kit = await tx.kit.findUnique({
          where: { id: kitId },
          include: { items: true },
        });
        if (!kit) {
          throw new NotFoundError(`Kit with id ${kitId} not found`);
        }

        // 2. Verify Club exists
        const club = await tx.club.findUnique({
          where: { id: clubId },
        });
        if (!club) {
          throw new NotFoundError(`Club with id ${clubId} not found`);
        }

        // 3. Atomically query all existing non-cancelled bookings
        const existingBookings = await tx.booking.findMany({
          where: {
            kitId,
            status: { not: BookingStatus.CANCELLED },
          },
          select: {
            id: true,
            start: true,
            end: true,
            status: true,
          },
        });

        // 4. Validate conflicts against the 15-minute buffer
        const conflicts = BookingConflictPolicy.findConflicts(
          { start, end },
          existingBookings
        );

        if (conflicts.length > 0) {
          throw new BookingConflictError(
            'The requested booking slot conflicts with an existing reservation or the 15-minute buffer'
          );
        }

        // 5. Check if any kit items are currently missing or damaged to assess initial risk
        const missingOrDamagedItems = kit.items.filter(
          (item) => item.state === 'MISSING' || item.state === 'DAMAGED'
        );

        const initialStatus =
          missingOrDamagedItems.length > 0
            ? BookingStatus.AT_RISK
            : BookingStatus.RESERVED;

        const initialRiskReasons =
          missingOrDamagedItems.length > 0
            ? JSON.stringify(missingOrDamagedItems.map((i) => i.id))
            : '[]';

        // 6. Create Booking
        const newBooking = await tx.booking.create({
          data: {
            kitId,
            clubId,
            userId,
            start,
            end,
            status: initialStatus,
            riskReasons: initialRiskReasons,
          },
          include: {
            club: true,
            kit: true,
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        // 7. Record Audit Log
        await tx.auditLog.create({
          data: {
            actorId: userId,
            actorRole: 'CLUB_MEMBER', // public booking creation is always by a club member (USER)
            action: 'CREATE_BOOKING',
            entityType: 'BOOKING',
            entityId: newBooking.id,
            details: JSON.stringify({
              clubId,
              kitId,
              start: start.toISOString(),
              end: end.toISOString(),
              status: initialStatus,
            }),
          },
        });

        return newBooking;
      });
    }).then((createdBooking) => {
      // Emit real-time event outside the database transaction
      try {
        io.emit('booking_created', {
          bookingId: createdBooking.id,
          clubId: createdBooking.clubId,
          start: createdBooking.start,
          end: createdBooking.end,
          status: createdBooking.status,
        });
      } catch (_e) {
        // Socket emission failure should not abort successful creation
      }
      return createdBooking;
    });
  }

  /**
   * Cancel an upcoming reservation before checkout.
   */
  static async cancelBooking(params: CancelBookingParams) {
    const { bookingId, actorUser } = params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { club: true },
    });

    if (!booking) {
      throw new NotFoundError(`Booking with id ${bookingId} not found`);
    }

    // Role check: Only the owning club or coordinators (ADMIN) can cancel
    if (
      normalizeRole(actorUser.role) !== 'ADMIN' &&
      actorUser.clubId !== booking.clubId
    ) {
      throw new ForbiddenError(
        'You are not authorized to cancel reservations belonging to another club'
      );
    }

    // State machine check:
    // Only RESERVED or AT_RISK can be cancelled.
    // Checked out bookings cannot be cancelled (return is mandatory).
    if (booking.status === BookingStatus.CHECKED_OUT) {
      throw new InvalidStateError(
        'Cannot cancel a booking that has already been checked out; physical equipment return is required'
      );
    }

    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.CANCELLED
    ) {
      throw new InvalidStateError(
        `Cannot cancel booking in ${booking.status} state`
      );
    }

    if (
      booking.status !== BookingStatus.RESERVED &&
      booking.status !== BookingStatus.AT_RISK
    ) {
      throw new InvalidStateError(
        `Cannot cancel booking with current status: ${booking.status}`
      );
    }

    return await kitLock.acquire(booking.kitId, async () => {
      return await prisma.$transaction(async (tx) => {
        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CANCELLED,
          },
          include: {
            club: true,
            kit: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actorUser.id,
            actorRole: actorUser.role,
            action: 'CANCEL_BOOKING',
            entityType: 'BOOKING',
            entityId: bookingId,
            details: JSON.stringify({
              previousStatus: booking.status,
              cancelledByRole: actorUser.role,
            }),
          },
        });

        return updatedBooking;
      });
    }).then((cancelledBooking) => {
      try {
        io.emit('booking_cancelled', {
          bookingId: cancelledBooking.id,
          clubId: cancelledBooking.clubId,
          start: cancelledBooking.start,
          end: cancelledBooking.end,
        });
      } catch (_e) {
        // Socket emission non-blocking
      }
      return cancelledBooking;
    });
  }

  /**
   * List bookings with optional filtering.
   */
  static async listBookings(filters: {
    kitId?: string;
    clubId?: string;
    status?: BookingStatus;
  }) {
    const where: any = {};
    if (filters.kitId) where.kitId = filters.kitId;
    if (filters.clubId) where.clubId = filters.clubId;
    if (filters.status) where.status = filters.status;

    return await prisma.booking.findMany({
      where,
      include: {
        club: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { start: 'asc' },
    });
  }

  /**
   * Get single booking details.
   */
  static async getBookingById(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        club: true,
        kit: {
          include: { items: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        handover: true,
        inspections: true,
        warnings: true,
      },
    });

    if (!booking) {
      throw new NotFoundError(`Booking ${bookingId} not found`);
    }

    return booking;
  }
}
