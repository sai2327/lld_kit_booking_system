import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { seedDatabase } from '../src/prisma/seed.js';
import {
  BookingStatus,
  ItemType,
  KitItemState,
  ItemCondition,
  InspectionResult,
  DisruptionStatus,
  Role,
} from '@prisma/client';
import { EquipmentService } from '../src/services/equipmentService.js';

describe('Milestone 4: Equipment Workflows & Disruption Management', () => {
  let kitId: string;
  let coordinatorToken: string;
  let roboticsToken: string;
  let dramaToken: string;
  let roboticsClubId: string;
  let dramaClubId: string;
  let roboticsUserId: string;
  let dramaUserId: string;

  const refreshState = async () => {
    const seed = await seedDatabase();
    kitId = seed.kit.id;
    roboticsClubId = seed.club1.id;
    dramaClubId = seed.club2.id;
    roboticsUserId = seed.userClub1.id;
    dramaUserId = seed.userClub2.id;

    const coordLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'coordinator@campus.edu', password: 'Coordinator123!' });
    coordinatorToken = coordLogin.body.token;

    const roboticsLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'robotics_lead@campus.edu', password: 'ClubPass123!' });
    roboticsToken = roboticsLogin.body.token;

    const dramaLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'drama_lead@campus.edu', password: 'ClubPass123!' });
    dramaToken = dramaLogin.body.token;
  };

  beforeAll(async () => {
    await refreshState();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('AT-07: Coordinator Checkout & Whole-Kit Guards', () => {
    it('blocks checkout if any item observation is damaged or missing', async () => {
      // 1. Create a currently active booking for Robotics (start in past, end in future)
      const now = new Date();
      const start = new Date(now.getTime() - 60 * 1000);
      const end = new Date(now.getTime() + 3600 * 1000);

      const booking = await prisma.booking.create({
        data: {
          kitId,
          clubId: roboticsClubId,
          userId: roboticsUserId,
          start,
          end,
          status: BookingStatus.RESERVED,
        },
      });

      const kitItems = await prisma.kitItem.findMany({ where: { kitId } });
      const mic = kitItems.find((i) => i.type === ItemType.MIC)!;
      const camera = kitItems.find((i) => i.type === ItemType.CAMERA)!;
      const tripod = kitItems.find((i) => i.type === ItemType.TRIPOD)!;

      // Attempt checkout with damaged mic
      const checkoutRes = await request(app)
        .post('/api/equipment/checkout')
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          bookingId: booking.id,
          itemConditions: {
            [camera.id]: ItemCondition.USABLE,
            [mic.id]: ItemCondition.DAMAGED,
            [tripod.id]: ItemCondition.USABLE,
          },
        });

      expect(checkoutRes.status).toBe(422);
      expect(checkoutRes.body.code).toBe('KitNotReadyError');

      // Attempt checkout omitting tripod
      const incompleteRes = await request(app)
        .post('/api/equipment/checkout')
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          bookingId: booking.id,
          itemConditions: {
            [camera.id]: ItemCondition.USABLE,
            [mic.id]: ItemCondition.USABLE,
          },
        });

      expect(incompleteRes.status).toBe(422);
      expect(incompleteRes.body.code).toBe('KitNotReadyError');
    });

    it('rejects checkout attempted by non-coordinator club member (403)', async () => {
      const now = new Date();
      const booking = await prisma.booking.create({
        data: {
          kitId,
          clubId: roboticsClubId,
          userId: roboticsUserId,
          start: new Date(now.getTime() - 60 * 1000),
          end: new Date(now.getTime() + 3600 * 1000),
          status: BookingStatus.RESERVED,
        },
      });

      const kitItems = await prisma.kitItem.findMany({ where: { kitId } });
      const itemConditions = Object.fromEntries(kitItems.map((i) => [i.id, ItemCondition.USABLE]));

      const res = await request(app)
        .post('/api/equipment/checkout')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({ bookingId: booking.id, itemConditions });

      expect(res.status).toBe(403);
    });

    it('successfully checks out kit when all three items are present and usable', async () => {
      const now = new Date();
      const booking = await prisma.booking.create({
        data: {
          kitId,
          clubId: roboticsClubId,
          userId: roboticsUserId,
          start: new Date(now.getTime() - 60 * 1000),
          end: new Date(now.getTime() + 3600 * 1000),
          status: BookingStatus.RESERVED,
        },
      });

      const kitItems = await prisma.kitItem.findMany({ where: { kitId } });
      const itemConditions = Object.fromEntries(kitItems.map((i) => [i.id, ItemCondition.USABLE]));

      const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });

      const checkoutResult = await EquipmentService.checkoutBooking({
        bookingId: booking.id,
        coordinatorId: coordinator.id,
        itemConditions,
        clock: now,
      });

      expect(checkoutResult.booking.status).toBe(BookingStatus.CHECKED_OUT);
      expect(checkoutResult.handover.checkoutAt).toBeDefined();

      // Verify all kit items are in CHECKED_OUT state in DB
      const updatedItems = await prisma.kitItem.findMany({ where: { kitId } });
      for (const item of updatedItems) {
        expect(item.state).toBe(KitItemState.CHECKED_OUT);
      }
    });
  });

  describe('AT-08 & AT-09: Partial Return, Inspection, and Disruption Detection', () => {
    let checkedOutBookingId: string;
    let upcomingBookingBId: string;
    let tripodItem: any;
    let cameraItem: any;
    let micItem: any;
    let disruptionId: string;

    beforeAll(async () => {
      await refreshState();

      const items = await prisma.kitItem.findMany({ where: { kitId } });
      cameraItem = items.find((i) => i.type === ItemType.CAMERA)!;
      micItem = items.find((i) => i.type === ItemType.MIC)!;
      tripodItem = items.find((i) => i.type === ItemType.TRIPOD)!;

      // 1. Create Booking A (14:00 - 15:00) for Robotics
      const t1 = new Date('2026-11-10T14:00:00.000Z');
      const t2 = new Date('2026-11-10T15:00:00.000Z');
      const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });

      const bookingA = await prisma.booking.create({
        data: {
          kitId,
          clubId: roboticsClubId,
          userId: roboticsUserId,
          start: t1,
          end: t2,
          status: BookingStatus.RESERVED,
        },
      });
      checkedOutBookingId = bookingA.id;

      // Check out Booking A
      await EquipmentService.checkoutBooking({
        bookingId: bookingA.id,
        coordinatorId: coordinator.id,
        itemConditions: {
          [cameraItem.id]: ItemCondition.USABLE,
          [micItem.id]: ItemCondition.USABLE,
          [tripodItem.id]: ItemCondition.USABLE,
        },
        clock: new Date('2026-11-10T14:05:00.000Z'),
      });

      // 2. Create upcoming Booking B (15:15 - 16:30) for Drama Society
      const t3 = new Date('2026-11-10T15:15:00.000Z');
      const t4 = new Date('2026-11-10T16:30:00.000Z');
      const bookingB = await prisma.booking.create({
        data: {
          kitId,
          clubId: dramaClubId,
          userId: dramaUserId,
          start: t3,
          end: t4,
          status: BookingStatus.RESERVED,
        },
      });
      upcomingBookingBId = bookingB.id;
    });

    it('AT-08: records partial return (Camera & Mic returned PASS, Tripod MISSING)', async () => {
      const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });

      const returnRes = await EquipmentService.returnAndInspect({
        bookingId: checkedOutBookingId,
        coordinatorId: coordinator.id,
        observations: {
          [cameraItem.id]: {
            returned: true,
            condition: ItemCondition.USABLE,
            result: InspectionResult.PASS,
            note: 'Camera body and lens pristine',
          },
          [micItem.id]: {
            returned: true,
            condition: ItemCondition.USABLE,
            result: InspectionResult.PASS,
            note: 'Both transmitters and receiver intact',
          },
          [tripodItem.id]: {
            returned: false,
            condition: ItemCondition.MISSING,
            result: InspectionResult.MISSING,
            note: 'Club left tripod at event hall',
          },
        },
        clock: new Date('2026-11-10T15:00:00.000Z'),
      });

      expect(returnRes.booking.status).toBe(BookingStatus.COMPLETED);
      expect(returnRes.missingOrDamagedCount).toBe(1);

      // Verify item states:
      const cam = await prisma.kitItem.findUniqueOrThrow({ where: { id: cameraItem.id } });
      const mic = await prisma.kitItem.findUniqueOrThrow({ where: { id: micItem.id } });
      const tri = await prisma.kitItem.findUniqueOrThrow({ where: { id: tripodItem.id } });

      expect(cam.state).toBe(KitItemState.AVAILABLE);
      expect(mic.state).toBe(KitItemState.AVAILABLE);
      expect(tri.state).toBe(KitItemState.MISSING);
    });

    it('AT-09: detects disruption, marks upcoming Booking B AT_RISK, and persists warning & notification', async () => {
      // Verify Booking B has been transitioned to AT_RISK
      const bookingB = await prisma.booking.findUniqueOrThrow({
        where: { id: upcomingBookingBId },
      });
      expect(bookingB.status).toBe(BookingStatus.AT_RISK);
      expect(bookingB.riskReasons).toContain(tripodItem.id);

      // Verify Disruption record exists
      const disruption = await prisma.disruption.findFirst({
        where: {
          sourceBookingId: checkedOutBookingId,
          affectedBookingId: upcomingBookingBId,
        },
        include: { warnings: true },
      });
      expect(disruption).not.toBeNull();
      expect(disruption?.status).toBe(DisruptionStatus.OPEN);
      disruptionId = disruption!.id;

      // Verify Warning record exists
      expect(disruption?.warnings.length).toBe(1);
      const warning = disruption!.warnings[0];
      expect(warning.recipientClubId).toBe(dramaClubId);

      // Verify persistent notifications exist for Drama Society
      const notifs = await prisma.notification.findMany({
        where: { clubId: dramaClubId, bookingId: upcomingBookingBId },
      });
      expect(notifs.length).toBeGreaterThan(0);
      expect(notifs[0].title).toContain('At Risk');
    });

    it('AT-10: disconnected recipient fetches persisted notifications on reconnect', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${dramaToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const atRiskNotif = res.body.find((n: any) => n.bookingId === upcomingBookingBId);
      expect(atRiskNotif).toBeDefined();
      expect(atRiskNotif.isRead).toBe(false);

      // Mark notification as read
      const markRes = await request(app)
        .put(`/api/notifications/${atRiskNotif.id}/read`)
        .set('Authorization', `Bearer ${dramaToken}`);
      expect(markRes.status).toBe(200);
      expect(markRes.body.isRead).toBe(true);
    });

    it('blocks checkout of Booking B while tripod is still missing', async () => {
      const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });

      await expect(
        EquipmentService.checkoutBooking({
          bookingId: upcomingBookingBId,
          coordinatorId: coordinator.id,
          itemConditions: {
            [cameraItem.id]: ItemCondition.USABLE,
            [micItem.id]: ItemCondition.USABLE,
            [tripodItem.id]: ItemCondition.USABLE,
          },
          clock: new Date('2026-11-10T15:20:00.000Z'),
        })
      ).rejects.toThrow('Missing available TRIPOD');
    });

    describe('AT-11: Equipment Recovery & Replacement Workflows', () => {
      it('recovery fails to restore availability if inspection reports damage', async () => {
        const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });

        // Recover tripod, but inspection reports DAMAGED
        const result = await EquipmentService.recoverItem({
          disruptionId,
          itemId: tripodItem.id,
          coordinatorId: coordinator.id,
          inspectionResult: InspectionResult.DAMAGED,
          note: 'Leg clamp cracked during transport',
          clock: new Date('2026-11-10T15:22:00.000Z'),
        });

        expect(result.item.state).toBe(KitItemState.DAMAGED);
        expect(result.isKitFullyReady).toBe(false);
        expect(result.disruption.status).toBe(DisruptionStatus.OPEN);

        // Booking B still AT_RISK
        const bookingB = await prisma.booking.findUniqueOrThrow({
          where: { id: upcomingBookingBId },
        });
        expect(bookingB.status).toBe(BookingStatus.AT_RISK);
      });

      it('replacement unit passes inspection, restoring kit and transitioning Booking B back to RESERVED', async () => {
        const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });

        // Replace damaged tripod with new unit
        const replaceResult = await EquipmentService.replaceItem({
          disruptionId,
          oldItemId: tripodItem.id,
          coordinatorId: coordinator.id,
          serialNumber: 'TRI-MANFROTTO-REPLACE-02',
          conditionNote: 'Brand new replacement tripod in box',
          initialInspectionResult: InspectionResult.PASS,
          clock: new Date('2026-11-10T15:25:00.000Z'),
        });

        // Old item is REPLACED
        expect(replaceResult.oldItem.state).toBe(KitItemState.REPLACED);

        // New item is AVAILABLE
        expect(replaceResult.newItem.state).toBe(KitItemState.AVAILABLE);
        expect(replaceResult.isKitFullyReady).toBe(true);
        expect(replaceResult.disruption.status).toBe(DisruptionStatus.RESOLVED);

        // Booking B restored from AT_RISK to RESERVED
        const bookingB = await prisma.booking.findUniqueOrThrow({
          where: { id: upcomingBookingBId },
        });
        expect(bookingB.status).toBe(BookingStatus.RESERVED);
        expect(bookingB.riskReasons).toBe('[]');
      });

      it('now allows checkout of Booking B after verified restoration', async () => {
        const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });
        const allItems = await prisma.kitItem.findMany({ where: { kitId } });

        const activeCam = allItems.find((i) => i.type === ItemType.CAMERA && i.state === KitItemState.AVAILABLE)!;
        const activeMic = allItems.find((i) => i.type === ItemType.MIC && i.state === KitItemState.AVAILABLE)!;
        const activeTri = allItems.find((i) => i.type === ItemType.TRIPOD && i.state === KitItemState.AVAILABLE)!;

        const res = await EquipmentService.checkoutBooking({
          bookingId: upcomingBookingBId,
          coordinatorId: coordinator.id,
          itemConditions: {
            [activeCam.id]: ItemCondition.USABLE,
            [activeMic.id]: ItemCondition.USABLE,
            [activeTri.id]: ItemCondition.USABLE,
          },
          clock: new Date('2026-11-10T15:26:00.000Z'),
        });

        expect(res.booking.status).toBe(BookingStatus.CHECKED_OUT);
      });
    });
  });

  describe('Invalid State Transitions & Edge Cases', () => {
    it('cannot checkout a booking outside its scheduled interval', async () => {
      const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });
      const items = await prisma.kitItem.findMany({ where: { kitId } });
      const availableItems = items.filter((i) => i.state === KitItemState.AVAILABLE);
      const user = await prisma.user.findFirstOrThrow({ where: { role: Role.CLUB_MEMBER } });

      const b = await prisma.booking.create({
        data: {
          kitId,
          clubId: user.clubId!,
          userId: user.id,
          start: new Date('2026-12-01T10:00:00.000Z'),
          end: new Date('2026-12-01T12:00:00.000Z'),
          status: BookingStatus.RESERVED,
        },
      });

      // Checkout before start
      await expect(
        EquipmentService.checkoutBooking({
          bookingId: b.id,
          coordinatorId: coordinator.id,
          itemConditions: Object.fromEntries(availableItems.map((i) => [i.id, ItemCondition.USABLE])),
          clock: new Date('2026-12-01T09:50:00.000Z'),
        })
      ).rejects.toThrow('Cannot check out before scheduled booking start time');

      // Checkout after end
      await expect(
        EquipmentService.checkoutBooking({
          bookingId: b.id,
          coordinatorId: coordinator.id,
          itemConditions: Object.fromEntries(availableItems.map((i) => [i.id, ItemCondition.USABLE])),
          clock: new Date('2026-12-01T12:05:00.000Z'),
        })
      ).rejects.toThrow('Cannot check out after scheduled booking end time');
    });

    it('cannot return a booking that is not in CHECKED_OUT status', async () => {
      const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coordinator@campus.edu' } });
      const user = await prisma.user.findFirstOrThrow({ where: { role: Role.CLUB_MEMBER } });

      const b = await prisma.booking.create({
        data: {
          kitId,
          clubId: user.clubId!,
          userId: user.id,
          start: new Date('2026-12-02T10:00:00.000Z'),
          end: new Date('2026-12-02T12:00:00.000Z'),
          status: BookingStatus.RESERVED,
        },
      });

      await expect(
        EquipmentService.returnAndInspect({
          bookingId: b.id,
          coordinatorId: coordinator.id,
          observations: {},
        })
      ).rejects.toThrow('Cannot return booking with status RESERVED. Expected CHECKED_OUT.');
    });

    it('cannot cancel a booking after checkout has already completed', async () => {
      const b = await prisma.booking.findFirstOrThrow({
        where: { status: BookingStatus.CHECKED_OUT },
      });

      const res = await request(app)
        .post(`/api/bookings/${b.id}/cancel`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('InvalidStateError');
    });
  });
});
