import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { BookingService } from '../services/bookingService.js';
import { AuthenticatedRequest, normalizeRole } from '../middleware/auth.js';
import { Role, BookingStatus } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../middleware/errorHandler.js';

const availabilityQuerySchema = z.object({
  kitId: z.string().uuid('Valid kitId required'),
  start: z.string().datetime({ message: 'Valid ISO-8601 start timestamp required' }),
  end: z.string().datetime({ message: 'Valid ISO-8601 end timestamp required' }),
});

const createBookingSchema = z.object({
  kitId: z.string().uuid('Valid kitId required'),
  start: z.string().datetime({ message: 'Valid ISO-8601 start timestamp required' }),
  end: z.string().datetime({ message: 'Valid ISO-8601 end timestamp required' }),
  clubId: z.string().uuid('Valid clubId required').optional(),
});

export class BookingController {
  static async checkAvailability(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const parsed = availabilityQuerySchema.parse(req.query);
      const start = new Date(parsed.start);
      const end = new Date(parsed.end);

      const result = await BookingService.checkAvailability(parsed.kitId, start, end);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async createBooking(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const parsed = createBookingSchema.parse(req.body);
      const start = new Date(parsed.start);
      const end = new Date(parsed.end);

      // Determine clubId: Club members book on behalf of their assigned club
      let clubId: string;
      if (normalizeRole(req.user.role) === 'ADMIN') {
        if (!parsed.clubId) {
          throw new ValidationError('Coordinator must specify clubId when creating a booking');
        }
        clubId = parsed.clubId;
      } else {
        if (!req.user.clubId) {
          throw new ForbiddenError('User is not associated with an active club');
        }
        clubId = req.user.clubId;
      }

      const booking = await BookingService.createBooking({
        kitId: parsed.kitId,
        clubId,
        userId: req.user.id,
        start,
        end,
      });

      res.status(201).json(booking);
    } catch (err) {
      next(err);
    }
  }

  static async cancelBooking(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const { id } = req.params;
      const cancelled = await BookingService.cancelBooking({
        bookingId: id,
        actorUser: req.user,
      });

      res.json({
        message: 'Booking successfully cancelled',
        booking: cancelled,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listBookings(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { kitId, clubId, status } = req.query;

      const filters: any = {};
      if (typeof kitId === 'string') filters.kitId = kitId;
      if (typeof clubId === 'string') filters.clubId = clubId;
      if (typeof status === 'string' && Object.values(BookingStatus).includes(status as any)) {
        filters.status = status as BookingStatus;
      }

      // If regular club member, they can see their club's bookings or general schedule
      // The LLD states: "Do not allow one club to read or modify another club's private booking details unless explicitly needed for shared availability or coordinator duties."
      const bookings = await BookingService.listBookings(filters);

      // Sanitize private notes for other clubs if club member (USER)
      if (req.user && normalizeRole(req.user.role) === 'USER') {
        const sanitized = bookings.map((b) => {
          if (b.clubId === req.user?.clubId) {
            return b;
          }
          // Shared calendar view: only start, end, status, and club name
          return {
            id: b.id,
            kitId: b.kitId,
            clubId: b.clubId,
            club: { name: b.club.name, code: b.club.code },
            start: b.start,
            end: b.end,
            status: b.status,
          };
        });
        res.json(sanitized);
        return;
      }

      res.json(bookings);
    } catch (err) {
      next(err);
    }
  }

  static async getBookingById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const booking = await BookingService.getBookingById(id);

      // Check privacy: club members cannot access other clubs' detailed bookings
      if (
        req.user &&
        normalizeRole(req.user.role) === 'USER' &&
        req.user.clubId !== booking.clubId
      ) {
        throw new ForbiddenError("Cannot view another club's detailed booking record");
      }

      res.json(booking);
    } catch (err) {
      next(err);
    }
  }
}
