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

describe('Milestone 6: End-to-End User Journeys (Journeys 1 to 13)', () => {
  let kitId: string;
  let coordinatorToken: string;
  let roboticsToken: string;
  let dramaToken: string;
  let roboticsClubId: string;
  let dramaClubId: string;
  let coordinatorId: string;

  beforeAll(async () => {
    const seed = await seedDatabase();
    kitId = seed.kit.id;
    roboticsClubId = seed.club1.id;
    dramaClubId = seed.club2.id;
    coordinatorId = seed.coordinator.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Journey 1: Club member signs in
  it('Journey 1: Club member signs in and receives JWT with club details', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'robotics_lead@campus.edu', password: 'ClubPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe(Role.CLUB_MEMBER);
    expect(res.body.user.club.code).toBe('ROBOTICS');
    roboticsToken = res.body.token;

    // Drama member also logs in
    const dramaRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'drama_lead@campus.edu', password: 'ClubPass123!' });
    dramaToken = dramaRes.body.token;
  });

  let roboticsBookingId: string;
  const startA = new Date(Date.now() + 24 * 3600 * 1000); // T + 24h
  const endA = new Date(Date.now() + 26 * 3600 * 1000);   // T + 26h

  // Journey 2: Member checks availability and creates a valid reservation
  it('Journey 2: Member checks availability (free) and creates a valid reservation', async () => {
    // Check availability
    const availRes = await request(app)
      .get('/api/bookings/availability')
      .set('Authorization', `Bearer ${roboticsToken}`)
      .query({
        kitId,
        start: startA.toISOString(),
        end: endA.toISOString(),
      });

    expect(availRes.status).toBe(200);
    expect(availRes.body.available).toBe(true);
    expect(availRes.body.conflictingBookings).toHaveLength(0);

    // Create reservation
    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${roboticsToken}`)
      .send({
        kitId,
        start: startA.toISOString(),
        end: endA.toISOString(),
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.status).toBe(BookingStatus.RESERVED);
    expect(bookRes.body.clubId).toBe(roboticsClubId);
    roboticsBookingId = bookRes.body.id;
  });

  // Journey 3: Conflicting reservation is rejected with a useful message
  it('Journey 3: Conflicting reservation is rejected with 409 and descriptive error message', async () => {
    // Attempt overlapping slot by Drama Society
    const overlapStart = new Date(startA.getTime() + 30 * 60 * 1000).toISOString();
    const overlapEnd = new Date(endA.getTime() + 30 * 60 * 1000).toISOString();

    const conflictRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${dramaToken}`)
      .send({
        kitId,
        start: overlapStart,
        end: overlapEnd,
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.code).toBe('BookingConflictError');
    expect(conflictRes.body.error).toContain('15-minute buffer');
  });

  // Journey 4: Member views and cancels an eligible booking
  it('Journey 4: Member views bookings and cancels an eligible booking', async () => {
    // Create temporary booking to cancel
    const tStart = new Date(Date.now() + 40 * 3600 * 1000).toISOString();
    const tEnd = new Date(Date.now() + 42 * 3600 * 1000).toISOString();

    const tempBooking = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${roboticsToken}`)
      .send({ kitId, start: tStart, end: tEnd });
    expect(tempBooking.status).toBe(201);
    const tempId = tempBooking.body.id;

    // View club bookings
    const listRes = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${roboticsToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((b: any) => b.id === tempId)).toBe(true);

    // Cancel booking
    const cancelRes = await request(app)
      .post(`/api/bookings/${tempId}/cancel`)
      .set('Authorization', `Bearer ${roboticsToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.booking.status).toBe(BookingStatus.CANCELLED);
  });

  // Journey 5: Coordinator signs in
  it('Journey 5: Coordinator signs in and accesses coordinator-level operations', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'coordinator@campus.edu', password: 'Coordinator123!' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(Role.COORDINATOR);
    coordinatorToken = res.body.token;
  });

  // Prepare active booking for checkout
  let activeBookingId: string;
  let upcomingAtRiskBookingId: string;
  let tripodId: string;
  let cameraId: string;
  let micId: string;

  it('Setup: Prepares active session and subsequent upcoming session', async () => {
    const items = await prisma.kitItem.findMany({ where: { kitId } });
    cameraId = items.find((i) => i.type === ItemType.CAMERA)!.id;
    micId = items.find((i) => i.type === ItemType.MIC)!.id;
    tripodId = items.find((i) => i.type === ItemType.TRIPOD)!.id;

    // Active session for Robotics: start in past, end in future
    const now = new Date();
    const activeBooking = await prisma.booking.create({
      data: {
        kitId,
        clubId: roboticsClubId,
        userId: (await prisma.user.findFirstOrThrow({ where: { clubId: roboticsClubId } })).id,
        start: new Date(now.getTime() - 30 * 60 * 1000),
        end: new Date(now.getTime() + 60 * 60 * 1000),
        status: BookingStatus.RESERVED,
      },
    });
    activeBookingId = activeBooking.id;

    // Upcoming session for Drama: starts after activeBooking ends + 15 min
    const upcomingStart = new Date(activeBooking.end.getTime() + 15 * 60 * 1000);
    const upcomingEnd = new Date(upcomingStart.getTime() + 60 * 60 * 1000);
    const upcomingBooking = await prisma.booking.create({
      data: {
        kitId,
        clubId: dramaClubId,
        userId: (await prisma.user.findFirstOrThrow({ where: { clubId: dramaClubId } })).id,
        start: upcomingStart,
        end: upcomingEnd,
        status: BookingStatus.RESERVED,
      },
    });
    upcomingAtRiskBookingId = upcomingBooking.id;
  });

  // Journey 6: Coordinator checks out the complete kit
  it('Journey 6: Coordinator checks out the complete kit verifying all three items USABLE', async () => {
    const res = await request(app)
      .post('/api/equipment/checkout')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        bookingId: activeBookingId,
        itemConditions: {
          [cameraId]: ItemCondition.USABLE,
          [micId]: ItemCondition.USABLE,
          [tripodId]: ItemCondition.USABLE,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe(BookingStatus.CHECKED_OUT);
    expect(res.body.handover.checkoutAt).toBeDefined();

    // Verify all items in CHECKED_OUT state
    const kitItems = await prisma.kitItem.findMany({ where: { kitId } });
    for (const item of kitItems) {
      expect(item.state).toBe(KitItemState.CHECKED_OUT);
    }
  });

  let disruptionId: string;

  // Journey 7 & 8: Partial return, inspection, disruption detection, and persistent notification
  it('Journey 7 & 8: Coordinator records partial return (Tripod missing), triggering Disruption and Warning', async () => {
    const res = await request(app)
      .post('/api/equipment/return')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        bookingId: activeBookingId,
        observations: {
          [cameraId]: {
            returned: true,
            condition: ItemCondition.USABLE,
            result: InspectionResult.PASS,
            note: 'Camera lens inspected and clear',
          },
          [micId]: {
            returned: true,
            condition: ItemCondition.USABLE,
            result: InspectionResult.PASS,
            note: 'Microphones charged and tested',
          },
          [tripodId]: {
            returned: false,
            condition: ItemCondition.MISSING,
            result: InspectionResult.MISSING,
            note: 'Tripod was not returned by team',
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe(BookingStatus.COMPLETED);
    expect(res.body.disruption).not.toBeNull();
    disruptionId = res.body.disruption.id;

    // Verify upcoming booking transitioned to AT_RISK
    const upcoming = await prisma.booking.findUniqueOrThrow({
      where: { id: upcomingAtRiskBookingId },
    });
    expect(upcoming.status).toBe(BookingStatus.AT_RISK);
    expect(upcoming.riskReasons).toContain(tripodId);

    // Verify Warning was created
    const warning = await prisma.warning.findFirst({
      where: { disruptionId },
    });
    expect(warning).not.toBeNull();
    expect(warning?.recipientClubId).toBe(dramaClubId);
  });

  // Journey 9 & 10: Recovery / Replacement requiring inspection before becoming usable
  it('Journey 9 & 10: Coordinator records replacement tripod requiring PASS inspection', async () => {
    // 1. First verify checkout of upcoming booking is blocked while tripod is missing
    const upcomingB = await prisma.booking.findUniqueOrThrow({ where: { id: upcomingAtRiskBookingId } });
    await expect(
      EquipmentService.checkoutBooking({
        bookingId: upcomingAtRiskBookingId,
        coordinatorId,
        itemConditions: {
          [cameraId]: ItemCondition.USABLE,
          [micId]: ItemCondition.USABLE,
          [tripodId]: ItemCondition.USABLE,
        },
        clock: new Date(upcomingB.start.getTime() + 60 * 1000),
      })
    ).rejects.toThrow('Missing available TRIPOD');

    // 2. Coordinator registers replacement tripod that PASSES inspection
    const replaceRes = await request(app)
      .post('/api/equipment/replace')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        disruptionId,
        oldItemId: tripodId,
        serialNumber: 'TRI-MANFROTTO-E2E-09',
        conditionNote: 'Brand new replacement tripod unit',
        initialInspectionResult: InspectionResult.PASS,
      });

    expect(replaceRes.status).toBe(200);
    expect(replaceRes.body.oldItem.state).toBe(KitItemState.REPLACED);
    expect(replaceRes.body.newItem.state).toBe(KitItemState.AVAILABLE);
    expect(replaceRes.body.isKitFullyReady).toBe(true);
    expect(replaceRes.body.disruption.status).toBe(DisruptionStatus.RESOLVED);
  });

  // Journey 11: Affected booking returns to RESERVED state
  it('Journey 11: Affected booking returns from AT_RISK to RESERVED after verified restoration', async () => {
    const restoredBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: upcomingAtRiskBookingId },
    });
    expect(restoredBooking.status).toBe(BookingStatus.RESERVED);
    expect(restoredBooking.riskReasons).toBe('[]');
  });

  // Journey 12 & 13: Offline reconnection and persistent notification retrieval
  it('Journey 12 & 13: Disconnected recipient fetches all persisted notifications upon reconnecting', async () => {
    // Drama Society lead fetches notifications
    const notifRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${dramaToken}`);

    expect(notifRes.status).toBe(200);
    expect(Array.isArray(notifRes.body)).toBe(true);
    expect(notifRes.body.length).toBeGreaterThan(0);

    // Find the disruption notification
    const atRiskNotif = notifRes.body.find((n: any) => n.bookingId === upcomingAtRiskBookingId);
    expect(atRiskNotif).toBeDefined();

    // Mark as read
    const readRes = await request(app)
      .put(`/api/notifications/${atRiskNotif.id}/read`)
      .set('Authorization', `Bearer ${dramaToken}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.isRead).toBe(true);
  });
});
