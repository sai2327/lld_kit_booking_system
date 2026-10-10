import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/authRoutes.js';
import { bookingRouter } from './routes/bookingRoutes.js';
import { equipmentRouter } from './routes/equipmentRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json());

// Health Check Endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    system: 'Shared Event Kit Booking System',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/notifications', notificationRouter);

// Global Error Handler
app.use(errorHandler);

export default app;
