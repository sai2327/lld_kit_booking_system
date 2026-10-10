import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';

export const notificationRouter = Router();

notificationRouter.get('/', authenticate, NotificationController.list);
notificationRouter.put('/:id/read', authenticate, NotificationController.markRead);
