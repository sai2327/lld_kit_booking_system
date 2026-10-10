import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { seedDatabase } from '../src/prisma/seed.js';
import { Role, ItemType, KitItemState } from '@prisma/client';
import { requireRole, requireClubOrCoordinator, AuthenticatedRequest } from '../src/middleware/auth.js';
import { ForbiddenError } from '../src/middleware/errorHandler.js';

describe('Milestone 2: Foundation & Domain Core', () => {
  beforeAll(async () => {
    // Re-seed to guarantee deterministic state
    await seedDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Health Check', () => {
    it('returns 200 and system status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.system).toBe('Shared Event Kit Booking System');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Database Schema & Seed Verification', () => {
    it('contains exactly one kit with camera, mic, and tripod in AVAILABLE state', async () => {
      const kits = await prisma.kit.findMany({
        include: { items: true },
      });

      expect(kits.length).toBe(1);
      const kit = kits[0];
      expect(kit.items.length).toBe(3);

      const types = kit.items.map((i) => i.type).sort();
      expect(types).toEqual([ItemType.CAMERA, ItemType.MIC, ItemType.TRIPOD].sort());

      for (const item of kit.items) {
        expect(item.state).toBe(KitItemState.AVAILABLE);
        expect(item.serialNumber).toBeDefined();
      }
    });

    it('contains seeded clubs and users with proper roles', async () => {
      const clubs = await prisma.club.findMany();
      expect(clubs.length).toBe(2);

      const roboticsClub = clubs.find((c) => c.code === 'ROBOTICS');
      const dramaClub = clubs.find((c) => c.code === 'DRAMA');
      expect(roboticsClub).toBeDefined();
      expect(dramaClub).toBeDefined();

      const coordinator = await prisma.user.findUnique({
        where: { email: 'coordinator@campus.edu' },
      });
      expect(coordinator).toBeDefined();
      expect(coordinator?.role).toBe(Role.COORDINATOR);

      const roboticsUser = await prisma.user.findUnique({
        where: { email: 'robotics_lead@campus.edu' },
      });
      expect(roboticsUser).toBeDefined();
      expect(roboticsUser?.role).toBe(Role.CLUB_MEMBER);
      expect(roboticsUser?.clubId).toBe(roboticsClub?.id);
    });
  });

  describe('Authentication Flow', () => {
    let coordinatorToken: string;
    let roboticsToken: string;

    it('allows coordinator to log in with valid credentials and receive token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'coordinator@campus.edu',
          password: 'Coordinator123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('coordinator@campus.edu');
      expect(res.body.user.role).toBe(Role.COORDINATOR);
      coordinatorToken = res.body.token;
    });

    it('allows club member to log in and receive token with club metadata', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'robotics_lead@campus.edu',
          password: 'ClubPass123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('robotics_lead@campus.edu');
      expect(res.body.user.role).toBe(Role.CLUB_MEMBER);
      expect(res.body.user.club.code).toBe('ROBOTICS');
      roboticsToken = res.body.token;
    });

    it('rejects login with invalid password (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'coordinator@campus.edu',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('rejects login for non-existent email (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown@campus.edu',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('rejects malformed login payload with 400 validation error', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeDefined();
    });

    it('returns profile via /api/auth/me for authenticated user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('coordinator@campus.edu');
      expect(res.body.user.role).toBe(Role.COORDINATOR);
    });

    it('rejects /api/auth/me request without token (401)', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authorization token required');
    });

    it('rejects /api/auth/me request with invalid token (401)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.forged.jwt');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired authentication token');
    });
  });

  describe('Role-Based Authorization Middleware Unit Checks', () => {
    it('requireRole grants access when user has matching role', () => {
      const mockReq = {
        user: { id: 'u1', email: 'coord@test', role: Role.COORDINATOR },
      } as AuthenticatedRequest;
      const mockRes = {} as any;
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      requireRole(Role.COORDINATOR)(mockReq, mockRes, next);
      expect(nextCalled).toBe(true);
    });

    it('requireRole throws ForbiddenError when user has different role', () => {
      const mockReq = {
        user: { id: 'u2', email: 'club@test', role: Role.CLUB_MEMBER },
      } as AuthenticatedRequest;
      const mockRes = {} as any;
      const next = () => {};

      expect(() => {
        requireRole(Role.COORDINATOR)(mockReq, mockRes, next);
      }).toThrow(ForbiddenError);
    });

    it('requireClubOrCoordinator allows coordinator regardless of clubId', () => {
      const mockReq = {
        user: { id: 'u1', email: 'coord@test', role: Role.COORDINATOR, clubId: null },
      } as AuthenticatedRequest;
      const mockRes = {} as any;
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      requireClubOrCoordinator(() => 'club-123')(mockReq, mockRes, next);
      expect(nextCalled).toBe(true);
    });

    it('requireClubOrCoordinator allows matching club member', () => {
      const mockReq = {
        user: { id: 'u2', email: 'club@test', role: Role.CLUB_MEMBER, clubId: 'club-123' },
      } as AuthenticatedRequest;
      const mockRes = {} as any;
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      requireClubOrCoordinator(() => 'club-123')(mockReq, mockRes, next);
      expect(nextCalled).toBe(true);
    });

    it('requireClubOrCoordinator throws ForbiddenError for non-matching club member', () => {
      const mockReq = {
        user: { id: 'u2', email: 'club@test', role: Role.CLUB_MEMBER, clubId: 'club-456' },
      } as AuthenticatedRequest;
      const mockRes = {} as any;
      const next = () => {};

      expect(() => {
        requireClubOrCoordinator(() => 'club-123')(mockReq, mockRes, next);
      }).toThrow(ForbiddenError);
    });
  });

  describe('Two-Role Authorization System (ADMIN vs USER)', () => {
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
      // Authenticate ADMIN (Coordinator)
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'coordinator@campus.edu', password: 'Coordinator123!' });
      expect(adminLogin.status).toBe(200);
      adminToken = adminLogin.body.token;

      // Authenticate USER (Club Member)
      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'robotics_lead@campus.edu', password: 'ClubPass123!' });
      expect(userLogin.status).toBe(200);
      userToken = userLogin.body.token;
    });

    it('both roles authenticate properly and obtain valid tokens', () => {
      expect(adminToken).toBeDefined();
      expect(userToken).toBeDefined();
    });

    it('USER role is forbidden (403) from calling checkout endpoint', async () => {
      const res = await request(app)
        .post('/api/equipment/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ bookingId: '00000000-0000-0000-0000-000000000000', items: [] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ForbiddenError');
    });

    it('USER role is forbidden (403) from calling return endpoint', async () => {
      const res = await request(app)
        .post('/api/equipment/return')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ bookingId: '00000000-0000-0000-0000-000000000000', items: [] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ForbiddenError');
    });

    it('USER role is forbidden (403) from calling recover endpoint', async () => {
      const res = await request(app)
        .post('/api/equipment/recover')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ disruptionId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ForbiddenError');
    });

    it('USER role is forbidden (403) from calling replace endpoint', async () => {
      const res = await request(app)
        .post('/api/equipment/replace')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          disruptionId: '00000000-0000-0000-0000-000000000000',
          newSerialNumber: 'CAM-NEW-01',
          type: 'CAMERA',
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ForbiddenError');
    });

    it('ADMIN role is permitted past authorization on coordinator endpoints', async () => {
      // With valid admin token, authorization passes (response is not 403)
      const res = await request(app)
        .post('/api/equipment/checkout')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).not.toBe(403);
    });

    it('USER role can access user-allowed endpoints (e.g. kit status and availability check)', async () => {
      const kitRes = await request(app)
        .get('/api/equipment/kit')
        .set('Authorization', `Bearer ${userToken}`);
      expect(kitRes.status).toBe(200);
      expect(kitRes.body.kit).toBeDefined();
    });
  });
});

