import { Response, NextFunction } from 'express';
import { NotificationService } from '../services/notificationService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Role } from '@prisma/client';
import { ForbiddenError } from '../middleware/errorHandler.js';

export class NotificationController {
  static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Authentication required');

      const isCoordinator = req.user.role === Role.COORDINATOR;
      const notifications = await NotificationService.getNotifications({
        userId: req.user.id,
        clubId: req.user.clubId,
        isCoordinator,
      });

      res.json(notifications);
    } catch (err) {
      next(err);
    }
  }

  static async markRead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await NotificationService.markAsRead(id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
}
