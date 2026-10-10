import bcrypt from 'bcryptjs';
import prisma from '../db/prisma.js';
import { generateToken, AuthenticatedUser } from '../middleware/auth.js';
import { UnauthorizedError, NotFoundError, ConflictError, ValidationError } from '../middleware/errorHandler.js';
import { Role } from '@prisma/client';

export interface LoginResult {
  user: AuthenticatedUser & {
    club?: {
      id: string;
      name: string;
      code: string;
    } | null;
  };
  token: string;
}

export class AuthService {
  static async login(email: string, passwordPlain: string): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      clubId: user.clubId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId,
        club: user.club,
      },
      token,
    };
  }

  /**
   * Public registration — ALWAYS creates a CLUB_MEMBER (USER) account.
   * The role is never read from the request body to prevent privilege escalation.
   * Only an authenticated COORDINATOR can subsequently elevate an account.
   */
  static async register(params: {
    email: string;
    passwordPlain: string;
    name: string;
    clubId?: string;
  }): Promise<LoginResult> {
    const email = params.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    if (params.clubId) {
      const club = await prisma.club.findUnique({ where: { id: params.clubId } });
      if (!club) {
        throw new ValidationError('The specified club does not exist');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(params.passwordPlain, salt);

    // Always assign CLUB_MEMBER — never trust client-supplied role
    const user = await prisma.user.create({
      data: {
        email,
        name: params.name,
        passwordHash,
        role: Role.CLUB_MEMBER,
        clubId: params.clubId ?? null,
      },
      include: {
        club: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      clubId: user.clubId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId,
        club: user.club,
      },
      token,
    };
  }

  static async getProfile(userId: string): Promise<LoginResult['user']> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clubId: user.clubId,
      club: user.club,
    };
  }
}
