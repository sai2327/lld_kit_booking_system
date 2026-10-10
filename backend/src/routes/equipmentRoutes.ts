import { Router } from 'express';
import { EquipmentController } from '../controllers/equipmentController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Role } from '@prisma/client';

export const equipmentRouter = Router();

// Kit status and disruption listing (authenticated users)
equipmentRouter.get('/kit', authenticate, EquipmentController.getSharedKit);
equipmentRouter.get('/shared-kit', authenticate, EquipmentController.getSharedKit);
equipmentRouter.get('/kit/:kitId', authenticate, EquipmentController.getKitStatus);
equipmentRouter.get('/disruptions', authenticate, EquipmentController.listDisruptions);

// Protected Coordinator / Admin workflows
equipmentRouter.post(
  '/checkout',
  authenticate,
  requireRole('ADMIN'),
  EquipmentController.checkout
);

equipmentRouter.post(
  '/return',
  authenticate,
  requireRole('ADMIN'),
  EquipmentController.returnAndInspect
);

equipmentRouter.post(
  '/recover',
  authenticate,
  requireRole('ADMIN'),
  EquipmentController.recover
);

equipmentRouter.post(
  '/replace',
  authenticate,
  requireRole('ADMIN'),
  EquipmentController.replace
);
