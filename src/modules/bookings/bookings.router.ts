import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { BookingModel } from '../../db/models/index.js';

export const bookingsRouter = Router();

const createBookingSchema = z.object({
  clientName: z.string().min(2),
  pickupLocation: z.string().min(2),
  deliveryLocation: z.string().min(2),
  expectedWeightTons: z.number().positive(),
  vehicleTypeRequired: z.string().default('CONTAINER_CLOSED'),
  quotedRate: z.number().positive(),
});

bookingsRouter.get('/', requirePermission('read', 'bookings'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    const bookings = await BookingModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: bookings, total: bookings.length });
  } catch (err) { next(err); }
});

bookingsRouter.get('/:bookingId', requirePermission('read', 'bookings'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const booking = await BookingModel.findOne({ tenantId, id: req.params.bookingId }).lean();
    if (!booking) return next(new Error('Booking not found'));
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

bookingsRouter.post('/', requirePermission('create', 'bookings'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createBookingSchema.parse(req.body);
    const bookingId = `BKG-${Math.floor(10000 + Math.random() * 90000)}`;

    const newBooking = await BookingModel.create({
      id: bookingId,
      tenantId,
      ...body,
      status: 'CONFIRMED',
    });

    res.status(201).json({ success: true, data: newBooking, message: `Booking ${bookingId} confirmed.` });
  } catch (err) { next(err); }
});

bookingsRouter.put('/:bookingId', requirePermission('update', 'bookings'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await BookingModel.findOneAndUpdate(
      { tenantId, id: req.params.bookingId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Booking not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

bookingsRouter.patch('/:bookingId/status', requirePermission('update', 'bookings'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const updated = await BookingModel.findOneAndUpdate(
      { tenantId, id: req.params.bookingId },
      { $set: { status } },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Booking not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

bookingsRouter.delete('/:bookingId', requirePermission('delete', 'bookings'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const deleted = await BookingModel.findOneAndDelete({
      tenantId,
      id: req.params.bookingId,
    }).lean();
    if (!deleted) return next(new Error('Booking not found'));
    res.json({ success: true, message: `Booking ${req.params.bookingId} deleted successfully.` });
  } catch (err) { next(err); }
});

