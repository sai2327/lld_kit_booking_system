import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { EquipmentService } from '../services/equipmentService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ItemCondition, InspectionResult } from '@prisma/client';
import { ForbiddenError } from '../middleware/errorHandler.js';

const checkoutSchema = z.object({
  bookingId: z.string().uuid(),
  itemConditions: z.record(z.nativeEnum(ItemCondition)),
});

const returnSchema = z.object({
  bookingId: z.string().uuid(),
  observations: z.record(
    z.object({
      returned: z.boolean(),
      condition: z.nativeEnum(ItemCondition),
      result: z.nativeEnum(InspectionResult),
      note: z.string().optional(),
    })
  ),
});

const recoverSchema = z.object({
  disruptionId: z.string().uuid(),
  itemId: z.string().uuid(),
  inspectionResult: z.nativeEnum(InspectionResult),
  note: z.string().optional(),
});

const replaceSchema = z.object({
  disruptionId: z.string().uuid(),
  oldItemId: z.string().uuid(),
  serialNumber: z.string().min(2, 'Serial number required'),
  conditionNote: z.string().optional(),
  initialInspectionResult: z.nativeEnum(InspectionResult),
});

export class EquipmentController {
  static async checkout(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Authentication required');

      const parsed = checkoutSchema.parse(req.body);
      const result = await EquipmentService.checkoutBooking({
        bookingId: parsed.bookingId,
        coordinatorId: req.user.id,
        itemConditions: parsed.itemConditions,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async returnAndInspect(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Authentication required');

      const parsed = returnSchema.parse(req.body);
      const result = await EquipmentService.returnAndInspect({
        bookingId: parsed.bookingId,
        coordinatorId: req.user.id,
        observations: parsed.observations,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async recover(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Authentication required');

      const parsed = recoverSchema.parse(req.body);
      const result = await EquipmentService.recoverItem({
        disruptionId: parsed.disruptionId,
        itemId: parsed.itemId,
        coordinatorId: req.user.id,
        inspectionResult: parsed.inspectionResult,
        note: parsed.note,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async replace(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Authentication required');

      const parsed = replaceSchema.parse(req.body);
      const result = await EquipmentService.replaceItem({
        disruptionId: parsed.disruptionId,
        oldItemId: parsed.oldItemId,
        coordinatorId: req.user.id,
        serialNumber: parsed.serialNumber,
        conditionNote: parsed.conditionNote,
        initialInspectionResult: parsed.initialInspectionResult,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getSharedKit(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = await EquipmentService.getSharedKit();
      res.json(status);
    } catch (err) {
      next(err);
    }
  }

  static async getKitStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { kitId } = req.params;
      const status = await EquipmentService.getKitStatus(kitId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }

  static async listDisruptions(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const disruptions = await EquipmentService.listDisruptions();
      res.json(disruptions);
    } catch (err) {
      next(err);
    }
  }
}
