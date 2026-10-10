import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { seedDatabase } from '../src/prisma/seed.js';
import { BookingConflictPolicy, INSPECTION_BUFFER_MS } from '../src/domain/bookingConflictPolicy.js';
import { BookingStatus, Role } from '@prisma/client';

describe('Milestone 3: Booking Engine & Conflict Prevention', () => {
  let kitId: string;
  let coordinatorToken: string;
  let roboticsToken: string;
  let dramaToken: string;
  let roboticsClubId: string;
  let dramaClubId: string;

  beforeAll(async () => {
    const seed = await seedDatabase();
    kitId = seed.kit.id;
    roboticsClubId = seed.club1.id;
    dramaClubId = seed.club2.id;

    // Log in all three accounts to obtain tokens
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // Unit Tests: Pure Domain BookingConflictPolicy
  // -------------------------------------------------------------
  describe('Unit Tests: BookingConflictPolicy Math & Interval Rules', () => {
    const baseTime = new Date('2026-11-01T10:00:00.000Z');

    it('validates start strictly before end', () => {
      expect(() => {
        BookingConflictPolicy.validateInterval(
          new Date('2026-11-01T12:00:00.000Z'),
          new Date('2026-11-01T11:00:00.000Z'),
          baseTime
        );
      }).toThrow('Booking start time must be strictly before end time');

      expect(() => {
        BookingConflictPolicy.validateInterval(
          new Date('2026-11-01T12:00:00.000Z'),
          new Date('2026-11-01T12:00:00.000Z'),
          baseTime
        );
      }).toThrow('Booking start time must be strictly before end time');
    });

    it('rejects past bookings relative to current clock', () => {
      expect(() => {
        BookingConflictPolicy.validateInterval(
          new Date('2026-11-01T09:00:00.000Z'),
          new Date('2026-11-01T11:00:00.000Z'),
          baseTime
        );
      }).toThrow('Booking start time must be in the future');
    });

    it('detects direct interval overlap', () => {
      const existing = {
        id: 'b1',
        start: new Date('2026-11-01T14:00:00.000Z'),
        end: new Date('2026-11-01T16:00:00.000Z'),
        status: BookingStatus.RESERVED,
      };

      // Candidate entirely inside existing
      const candidateInside = {
        start: new Date('2026-11-01T14:30:00.000Z'),
        end: new Date('2026-11-01T15:30:00.000Z'),
      };
      expect(BookingConflictPolicy.conflicts(candidateInside, existing)).toBe(true);

      // Candidate overlapping start
      const candidateOverStart = {
        start: new Date('2026-11-01T13:00:00.000Z'),
        end: new Date('2026-11-01T14:30:00.000Z'),
      };
      expect(BookingConflictPolicy.conflicts(candidateOverStart, existing)).toBe(true);
    });

    it('AT-03: accepts exact 15-minute gap (boundary inclusive)', () => {
      // Existing: 14:00 to 15:00
      const existing = {
        id: 'b1',
        start: new Date('2026-11-01T14:00:00.000Z'),
        end: new Date('2026-11-01T15:00:00.000Z'),
        status: BookingStatus.RESERVED,
      };

      // Candidate starts at 15:15:00 (exactly 15 min after existing end)
      const candidate = {
        start: new Date('2026-11-01T15:15:00.000Z'),
        end: new Date('2026-11-01T16:15:00.000Z'),
      };

      expect(BookingConflictPolicy.conflicts(candidate, existing)).toBe(false);
    });

    it('AT-04: rejects gap shorter than 15 minutes (e.g. 14 min 59 sec)', () => {
      const existing = {
        id: 'b1',
        start: new Date('2026-11-01T14:00:00.000Z'),
        end: new Date('2026-11-01T15:00:00.000Z'),
        status: BookingStatus.RESERVED,
      };

      // Candidate starts at 15:14:59 (14 min 59 sec after 15:00)
      const candidate = {
        start: new Date('2026-11-01T15:14:59.000Z'),
        end: new Date('2026-11-01T16:14:59.000Z'),
      };

      expect(BookingConflictPolicy.conflicts(candidate, existing)).toBe(true);
    });

    it('ignores cancelled bookings during conflict check', () => {
      const existingCancelled = {
        id: 'b1',
        start: new Date('2026-11-01T14:00:00.000Z'),
        end: new Date('2026-11-01T15:00:00.000Z'),
        status: BookingStatus.CANCELLED,
      };

      const candidateSameSlot = {
        start: new Date('2026-11-01T14:00:00.000Z'),
        end: new Date('2026-11-01T15:00:00.000Z'),
      };

      expect(BookingConflictPolicy.conflicts(candidateSameSlot, existingCancelled)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // Integration Tests: End-to-End API Flow
  // -------------------------------------------------------------
  describe('Integration Tests: Mandatory Acceptance Criteria', () => {
    let bookingAId: string;

    // AT-01: Valid future booking is created and persisted
    it('AT-01: creates and persists a valid future booking with status RESERVED', async () => {
      const start = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24h in future
      const end = new Date(Date.now() + 26 * 3600 * 1000).toISOString();   // 26h in future

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({
          kitId,
          start,
          end,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe(BookingStatus.RESERVED);
      expect(res.body.clubId).toBe(roboticsClubId);
      bookingAId = res.body.id;

      // Verify persisted in DB
      const dbBooking = await prisma.booking.findUnique({
        where: { id: bookingAId },
      });
      expect(dbBooking).not.toBeNull();
      expect(dbBooking?.status).toBe(BookingStatus.RESERVED);
    });

    // AT-02: Overlapping reservation is rejected
    it('AT-02: rejects a reservation overlapping an existing active booking with 409 Conflict', async () => {
      const bookingA = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingAId },
      });

      // Attempt to book directly overlapping period by Drama Society
      const overlapStart = new Date(bookingA.start.getTime() + 30 * 60 * 1000).toISOString();
      const overlapEnd = new Date(bookingA.end.getTime() + 30 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${dramaToken}`)
        .send({
          kitId,
          start: overlapStart,
          end: overlapEnd,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BookingConflictError');
    });

    it('checks slot availability via GET /api/bookings/availability', async () => {
      const bookingA = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingAId },
      });

      // Conflicting slot
      const conflictingRes = await request(app)
        .get('/api/bookings/availability')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .query({
          kitId,
          start: bookingA.start.toISOString(),
          end: bookingA.end.toISOString(),
        });
      expect(conflictingRes.status).toBe(200);
      expect(conflictingRes.body.available).toBe(false);
      expect(conflictingRes.body.conflictingBookings.length).toBeGreaterThan(0);

      // Available slot (far in the future)
      const freeStart = new Date(Date.now() + 200 * 3600 * 1000).toISOString();
      const freeEnd = new Date(Date.now() + 202 * 3600 * 1000).toISOString();
      const freeRes = await request(app)
        .get('/api/bookings/availability')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .query({
          kitId,
          start: freeStart,
          end: freeEnd,
        });
      expect(freeRes.status).toBe(200);
      expect(freeRes.body.available).toBe(true);
      expect(freeRes.body.conflictingBookings.length).toBe(0);
    });

    // AT-03: Booking beginning exactly 15 minutes after prior end is allowed
    it('AT-03: allows booking beginning exactly 15 minutes after prior booking ends', async () => {
      const bookingA = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingAId },
      });

      // Start exactly 15 minutes after Booking A ends
      const exactStart = new Date(bookingA.end.getTime() + 15 * 60 * 1000).toISOString();
      const exactEnd = new Date(bookingA.end.getTime() + 75 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${dramaToken}`)
        .send({
          kitId,
          start: exactStart,
          end: exactEnd,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(BookingStatus.RESERVED);
      expect(res.body.clubId).toBe(dramaClubId);
    });

    // AT-04: Booking beginning less than 15 minutes after prior end is rejected
    it('AT-04: rejects booking beginning 14 minutes after prior booking ends', async () => {
      const bookingA = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingAId },
      });

      // Start 14 minutes after Booking A ends (violating the 15-minute buffer)
      const invalidStart = new Date(bookingA.end.getTime() + 14 * 60 * 1000).toISOString();
      const invalidEnd = new Date(bookingA.end.getTime() + 74 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${dramaToken}`)
        .send({
          kitId,
          start: invalidStart,
          end: invalidEnd,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BookingConflictError');
    });

    // AT-05: Cancelled bookings no longer block a slot
    it('AT-05: cancelled booking releases its slot, allowing reuse', async () => {
      // 1. Create a future slot by Robotics Club
      const start = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const end = new Date(Date.now() + 50 * 3600 * 1000).toISOString();

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({ kitId, start, end });
      expect(createRes.status).toBe(201);
      const bookingToCancelId = createRes.body.id;

      // 2. Drama Society attempts to book same slot -> Rejected
      const conflictRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${dramaToken}`)
        .send({ kitId, start, end });
      expect(conflictRes.status).toBe(409);

      // 3. Robotics Club cancels their booking
      const cancelRes = await request(app)
        .post(`/api/bookings/${bookingToCancelId}/cancel`)
        .set('Authorization', `Bearer ${roboticsToken}`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.booking.status).toBe(BookingStatus.CANCELLED);

      // 4. Drama Society now books the exact same slot -> Accepted!
      const rebookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${dramaToken}`)
        .send({ kitId, start, end });
      expect(rebookRes.status).toBe(201);
      expect(rebookRes.body.status).toBe(BookingStatus.RESERVED);
      expect(rebookRes.body.clubId).toBe(dramaClubId);
    });

    // AT-06: Simultaneous conflicting booking attempts (Concurrency test)
    it('AT-06: two simultaneous conflicting booking requests cannot both succeed', async () => {
      const concurrentStart = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      const concurrentEnd = new Date(Date.now() + 74 * 3600 * 1000).toISOString();

      // Launch both requests concurrently via Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${roboticsToken}`)
          .send({ kitId, start: concurrentStart, end: concurrentEnd }),
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${dramaToken}`)
          .send({ kitId, start: concurrentStart, end: concurrentEnd }),
      ]);

      const statuses = [res1.status, res2.status];
      // Exactly one request must succeed (201), and one must fail with conflict (409)
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      // Verify database state: exactly one booking exists for this slot
      const existingInDb = await prisma.booking.findMany({
        where: {
          kitId,
          start: new Date(concurrentStart),
          end: new Date(concurrentEnd),
          status: BookingStatus.RESERVED,
        },
      });
      expect(existingInDb.length).toBe(1);
    });

    // AT-13: Input validation, malformed intervals, and invalid state transitions
    it('AT-13: rejects invalid dates, end-before-start, past bookings, and invalid state transitions', async () => {
      // 1. end before start
      const invalidIntervalRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({
          kitId,
          start: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
          end: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
        });
      expect(invalidIntervalRes.status).toBe(400);

      // 2. past start time
      const pastStartRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({
          kitId,
          start: new Date(Date.now() - 3600 * 1000).toISOString(),
          end: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
      expect(pastStartRes.status).toBe(400);

      // 3. malformed datetime format
      const malformedRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({
          kitId,
          start: 'not-a-date',
          end: 'not-a-date',
        });
      expect(malformedRes.status).toBe(400);

      // 4. Invalid state transition: cancelling an already cancelled booking
      // Create and cancel a booking
      const bRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({
          kitId,
          start: new Date(Date.now() + 90 * 3600 * 1000).toISOString(),
          end: new Date(Date.now() + 92 * 3600 * 1000).toISOString(),
        });
      const bId = bRes.body.id;

      await request(app)
        .post(`/api/bookings/${bId}/cancel`)
        .set('Authorization', `Bearer ${roboticsToken}`);

      // Second cancellation attempt
      const secondCancelRes = await request(app)
        .post(`/api/bookings/${bId}/cancel`)
        .set('Authorization', `Bearer ${roboticsToken}`);
      expect(secondCancelRes.status).toBe(409);
      expect(secondCancelRes.body.code).toBe('InvalidStateError');
    });

    // Authorization & Ownership Checks
    it('prevents a club member from cancelling another club\'s booking', async () => {
      // Robotics creates a booking
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({
          kitId,
          start: new Date(Date.now() + 100 * 3600 * 1000).toISOString(),
          end: new Date(Date.now() + 102 * 3600 * 1000).toISOString(),
        });
      const bId = res.body.id;

      // Drama Society attempts to cancel Robotics' booking -> 403 Forbidden
      const cancelAttempt = await request(app)
        .post(`/api/bookings/${bId}/cancel`)
        .set('Authorization', `Bearer ${dramaToken}`);
      expect(cancelAttempt.status).toBe(403);
    });

    it('allows coordinator to cancel any club\'s booking before checkout', async () => {
      // Robotics creates a booking
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({
          kitId,
          start: new Date(Date.now() + 110 * 3600 * 1000).toISOString(),
          end: new Date(Date.now() + 112 * 3600 * 1000).toISOString(),
        });
      const bId = res.body.id;

      // Coordinator cancels it -> 200 OK
      const coordCancel = await request(app)
        .post(`/api/bookings/${bId}/cancel`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(coordCancel.status).toBe(200);
      expect(coordCancel.body.booking.status).toBe(BookingStatus.CANCELLED);
    });
  });

  // -------------------------------------------------------------
  // Regression Tests: Kit ID Retrieval, Validation, & Flow
  // -------------------------------------------------------------
  describe('Regression Tests: Kit ID Retrieval, Validation, & Flow', () => {
    it('retrieves the shared event kit via GET /api/equipment/kit with valid UUID', async () => {
      const res = await request(app)
        .get('/api/equipment/kit')
        .set('Authorization', `Bearer ${roboticsToken}`);

      expect(res.status).toBe(200);
      expect(res.body.kit).toBeDefined();
      expect(res.body.kit.id).toBe(kitId);
      expect(res.body.kit.items).toHaveLength(3);
      expect(res.body.isReadyForHandover).toBe(true);
    });

    it('rejects availability check if kitId is missing or empty string (400)', async () => {
      const start = new Date(Date.now() + 120 * 3600 * 1000).toISOString();
      const end = new Date(Date.now() + 122 * 3600 * 1000).toISOString();

      const res = await request(app)
        .get('/api/bookings/availability')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .query({ kitId: '', start, end });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details[0].path).toBe('kitId');
      expect(res.body.details[0].message).toBe('Valid kitId required');
    });

    it('rejects booking creation if kitId is missing or empty string (400)', async () => {
      const start = new Date(Date.now() + 120 * 3600 * 1000).toISOString();
      const end = new Date(Date.now() + 122 * 3600 * 1000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({ kitId: '', start, end });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details[0].path).toBe('kitId');
      expect(res.body.details[0].message).toBe('Valid kitId required');
    });

    it('rejects availability check if kitId is a valid UUID but does not exist (404)', async () => {
      const nonExistentKitId = '00000000-0000-0000-0000-000000000000';
      const start = new Date(Date.now() + 120 * 3600 * 1000).toISOString();
      const end = new Date(Date.now() + 122 * 3600 * 1000).toISOString();

      const res = await request(app)
        .get('/api/bookings/availability')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .query({ kitId: nonExistentKitId, start, end });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NotFoundError');
      expect(res.body.error).toContain('not found');
    });

    it('rejects booking creation if kitId is a valid UUID but does not exist (404)', async () => {
      const nonExistentKitId = '00000000-0000-0000-0000-000000000000';
      const start = new Date(Date.now() + 120 * 3600 * 1000).toISOString();
      const end = new Date(Date.now() + 122 * 3600 * 1000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({ kitId: nonExistentKitId, start, end });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NotFoundError');
      expect(res.body.error).toContain('not found');
    });

    it('executes full end-to-end flow: retrieve kit ID -> check availability -> create booking', async () => {
      // 1. Fetch kit ID as Club Lead
      const kitRes = await request(app)
        .get('/api/equipment/kit')
        .set('Authorization', `Bearer ${roboticsToken}`);
      expect(kitRes.status).toBe(200);
      const retrievedKitId = kitRes.body.kit.id;
      expect(retrievedKitId).toBeDefined();

      // 2. Check availability with the retrieved kit ID
      const start = new Date(Date.now() + 130 * 3600 * 1000).toISOString();
      const end = new Date(Date.now() + 132 * 3600 * 1000).toISOString();

      const availRes = await request(app)
        .get('/api/bookings/availability')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .query({ kitId: retrievedKitId, start, end });
      expect(availRes.status).toBe(200);
      expect(availRes.body.available).toBe(true);

      // 3. Create booking with the retrieved kit ID
      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${roboticsToken}`)
        .send({ kitId: retrievedKitId, start, end });
      expect(createRes.status).toBe(201);
      expect(createRes.body.kitId).toBe(retrievedKitId);
      expect(createRes.body.status).toBe(BookingStatus.RESERVED);
    });
  });
});
