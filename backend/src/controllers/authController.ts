import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/authService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  clubId: z.string().uuid('Valid clubId required').optional(),
  // role field intentionally ignored — public registration always creates USER (CLUB_MEMBER)
});

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.parse(req.body);
      const result = await AuthService.login(parsed.email, parsed.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Public registration endpoint.
   * Ignores any role field in the request body — always creates CLUB_MEMBER (USER).
   */
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.parse(req.body);
      const result = await AuthService.register({
        email: parsed.email,
        passwordPlain: parsed.password,
        name: parsed.name,
        clubId: parsed.clubId,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      const profile = await AuthService.getProfile(req.user.id);
      res.json({ user: profile });
    } catch (err) {
      next(err);
    }
  }
}
