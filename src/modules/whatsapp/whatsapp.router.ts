import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { WhatsAppMessageModel, VehicleModel, ExceptionModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const whatsappRouter = Router();

// Get conversation messages
whatsappRouter.get('/messages', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth?.tenantId || 'tenant_delhi_01';
    const filter: any = { tenantId };
    if (req.query.phone) {
      const phone = req.query.phone as string;
      filter.$or = [{ recipient: phone }, { senderPhone: phone }];
    }
    const messages = await WhatsAppMessageModel.find(filter).sort({ timestamp: -1 }).limit(200).lean();
    res.json({ success: true, data: messages });
  } catch (err) { next(err); }
});

// Send message
whatsappRouter.post('/send', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth?.tenantId || 'tenant_delhi_01';
    const body = z.object({
      phone: z.string().default('+91 98110 23456'),
      content: z.string().min(1),
      senderName: z.string().optional(),
      mediaUrl: z.string().optional(),
    }).parse(req.body);

    const newMsg = await WhatsAppMessageModel.create({
      id: `msg_${uuidv4().slice(0, 8)}`,
      tenantId,
      sender: 'DRIVER',
      senderPhone: body.phone,
      senderName: body.senderName || 'Driver',
      recipient: 'CONTROL_TOWER',
      content: body.content,
      type: 'DRIVER_MESSAGE',
      mediaUrl: body.mediaUrl,
      timestamp: new Date(),
    });

    // Auto-reply simulation
    const autoReply = await WhatsAppMessageModel.create({
      id: `msg_${uuidv4().slice(0, 8)}`,
      tenantId,
      sender: 'SYSTEM',
      recipient: body.phone,
      content: `✅ Message received. Control tower has been notified. Ref: ${newMsg.id}`,
      type: 'AUTO_REPLY',
      timestamp: new Date(Date.now() + 2000),
    });

    res.json({ success: true, data: { sent: newMsg, autoReply } });
  } catch (err) { next(err); }
});

// Update live location
whatsappRouter.post('/live-location', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth?.tenantId || 'tenant_delhi_01';
    const { vehicleRegNumber, latitude, longitude, speedKmH } = req.body;

    // Sync to vehicle
    if (vehicleRegNumber) {
      await VehicleModel.findOneAndUpdate(
        { tenantId, regNumber: vehicleRegNumber },
        {
          $set: {
            'currentLocation.latitude': latitude,
            'currentLocation.longitude': longitude,
            'currentLocation.speedKmH': speedKmH || 0,
            'currentLocation.updatedAt': new Date(),
          }
        }
      );
    }

    res.json({ success: true, message: 'Location updated.' });
  } catch (err) { next(err); }
});

// Simulate location drop
whatsappRouter.post('/location-drop', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth?.tenantId || 'tenant_delhi_01';
    const { vehicleRegNumber, driverPhone } = req.body;
    const phone = driverPhone || '+91 98110 23456';

    await WhatsAppMessageModel.create({
      id: `msg_${uuidv4().slice(0, 8)}`,
      tenantId,
      sender: 'SYSTEM',
      recipient: phone,
      content: `⚠️ ALERT: Live Location signal drop for ${vehicleRegNumber}. Kripya WhatsApp me jakar "Share Live Location" (8 Hours) dobara share karein.`,
      type: 'LOCATION_DROP_ALERT',
      timestamp: new Date(),
    });

    await ExceptionModel.create({
      id: `exc_${uuidv4().slice(0, 8)}`,
      tenantId,
      vehicleRegNumber,
      type: 'WHATSAPP_LOCATION_DROPPED',
      severity: 'HIGH',
      description: `Live location stream stopped for vehicle ${vehicleRegNumber}.`,
      status: 'OPEN',
      timestamp: new Date(),
    });

    res.json({ success: true, message: 'Location drop alert sent.' });
  } catch (err) { next(err); }
});
