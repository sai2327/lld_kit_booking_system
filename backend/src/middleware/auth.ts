import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';
import prisma from '../db/prisma.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: Role;
  clubId?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  clubId?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_shared_event_kit_2026';

export function generateToken(payload: TokenPayload, expiresIn: jwt.SignOptions['expiresIn'] = '7d'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (_err) {
    throw new UnauthorizedError('Invalid or expired authentication token');
  }
}

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization token required');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        clubId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User account not found');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function normalizeRole(role: Role | string | undefined | null): 'ADMIN' | 'USER' {
  if (role === Role.COORDINATOR || role === 'ADMIN') return 'ADMIN';
  return 'USER';
}

export function requireRole(...allowedRoles: (Role | 'ADMIN' | 'USER')[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userNormalized = normalizeRole(req.user.role);
    const isAllowed = allowedRoles.some((role) => {
      if (role === 'ADMIN' || role === Role.COORDINATOR) return userNormalized === 'ADMIN';
      if (role === 'USER' || role === Role.CLUB_MEMBER) return userNormalized === 'USER';
      return (req.user!.role as string) === (role as string);
    });

    if (!isAllowed) {
      throw new ForbiddenError(
        `Action restricted. Required role: ${allowedRoles.join(' or ')}`
      );
    }

    next();
  };
}

export function requireClubOrCoordinator(clubIdExtractor: (req: AuthenticatedRequest) => string | undefined) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (normalizeRole(req.user.role) === 'ADMIN') {
      return next();
    }

    const targetClubId = clubIdExtractor(req);
    if (!targetClubId || req.user.clubId !== targetClubId) {
      throw new ForbiddenError('Access restricted to owning club or coordinators');
    }

    next();
  };
}
