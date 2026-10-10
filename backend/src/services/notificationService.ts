import prisma from '../db/prisma.js';
import { io } from '../server.js';

export interface CreateNotificationParams {
  userId?: string | null;
  clubId?: string | null;
  bookingId?: string | null;
  title: string;
  message: string;
}

export class NotificationService {
  /**
   * Persist a notification to the database before broadcasting over sockets.
   */
  static async createNotification(params: CreateNotificationParams) {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        clubId: params.clubId,
        bookingId: params.bookingId,
        title: params.title,
        message: params.message,
        isRead: false,
      },
    });

    // Broadcast over WebSocket channels
    try {
      if (params.clubId) {
        io.to(`club:${params.clubId}`).emit('notification', notification);
      }
      if (!params.clubId && !params.userId) {
        // Coordinator broadcast
        io.to('coordinators').emit('notification', notification);
      }
    } catch (_e) {
      // Non-blocking socket emission
    }

    return notification;
  }

  /**
   * Fetch persisted notifications for a user/club (offline retrieval).
   */
  static async getNotifications(filters: { userId?: string; clubId?: string | null; isCoordinator?: boolean }) {
    const where: any = {};

    if (filters.isCoordinator) {
      // Coordinators can view system notifications or coordinator-targeted notifications
      where.OR = [
        { clubId: null, userId: null },
        filters.userId ? { userId: filters.userId } : {},
      ];
    } else if (filters.clubId) {
      // Club members view notifications for their club
      where.OR = [
        { clubId: filters.clubId },
        filters.userId ? { userId: filters.userId } : {},
      ];
    } else if (filters.userId) {
      where.userId = filters.userId;
    }

    return await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Mark a notification as read.
   */
  static async markAsRead(notificationId: string) {
    return await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }
}
