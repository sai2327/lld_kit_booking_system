import { Router } from 'express';
import { BookingController } from '../controllers/bookingController.js';
import { authenticate } from '../middleware/auth.js';

export const bookingRouter = Router();

// Availability check (accessible to authenticated users)
bookingRouter.get('/availability', authenticate, BookingController.checkAvailability);

// List bookings (filtered by club or general schedule)
bookingRouter.get('/', authenticate, BookingController.listBookings);

// Get single booking
bookingRouter.get('/:id', authenticate, BookingController.getBookingById);

// Create reservation
bookingRouter.post('/', authenticate, BookingController.createBooking);

// Cancel reservation
bookingRouter.post('/:id/cancel', authenticate, BookingController.cancelBooking);
