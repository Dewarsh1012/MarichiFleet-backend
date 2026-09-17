import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { WhatsAppMessageModel, VehicleModel, ExceptionModel, DriverModel } from '../../db/models/index.js';
import { sendWhatsAppMessage } from '../../platform/whatsapp/whatsappProvider.js';
import { v4 as uuidv4 } from 'uuid';

export const whatsappRouter = Router();

whatsappRouter.use(requirePermission('read', 'whatsapp'));

// Get conversation messages
whatsappRouter.get('/messages', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.phone) {
      const phone = req.query.phone as string;
      filter.$or = [{ recipient: phone }, { senderPhone: phone }];
    }
    const messages = await WhatsAppMessageModel.find(filter).sort({ timestamp: -1 }).limit(200).lean();
    res.json({ success: true, data: messages });
  } catch (err) { next(err); }
});

// Send message (Meta Cloud API when configured, otherwise simulated + persisted)
whatsappRouter.post('/send', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z.object({
      phone: z.string().min(8),
      content: z.string().min(1),
      senderName: z.string().optional(),
      mediaUrl: z.string().optional(),
      tripId: z.string().optional(),
      purpose: z.string().optional(),
    }).parse(req.body);

    const sendResult = await sendWhatsAppMessage({
      to: body.phone,
      body: body.content,
      tenantId,
    });

    const newMsg = await WhatsAppMessageModel.create({
      id: `msg_${uuidv4().slice(0, 8)}`,
      tenantId,
      sender: 'SYSTEM',
      senderPhone: body.phone,
      senderName: req.auth!.name,
      recipient: body.phone,
      content: body.content,
      type: body.purpose ?? 'OUTBOUND',
      mediaUrl: body.mediaUrl,
      tripId: body.tripId,
      deliveryStatus: sendResult.ok ? 'sent' : 'failed',
      provider: sendResult.provider,
      externalId: sendResult.messageId,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      data: {
        sent: newMsg,
        provider: sendResult.provider,
        externalId: sendResult.messageId,
        simulated: sendResult.provider === 'simulated',
      },
    });
  } catch (err) { next(err); }
});

// Inbound webhook stub (Meta Cloud API verification + receive)
whatsappRouter.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

whatsappRouter.post('/webhook', async (req: AuthenticatedRequest, res: Response) => {
  res.sendStatus(200);
  // Async processing would enqueue here; for now acknowledge immediately per Meta requirements
});

// Update live location from WhatsApp share
whatsappRouter.post('/live-location', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { vehicleRegNumber, driverPhone, latitude, longitude, speedKmH } = req.body;

    if (vehicleRegNumber) {
      await VehicleModel.findOneAndUpdate(
        { tenantId, regNumber: vehicleRegNumber },
        {
          $set: {
            'currentLocation.latitude': latitude,
            'currentLocation.longitude': longitude,
            'currentLocation.speedKmH': speedKmH || 0,
            'currentLocation.updatedAt': new Date(),
            'currentLocation.source': 'whatsapp',
          }
        }
      );
    }

    if (driverPhone) {
      await DriverModel.findOneAndUpdate(
        { tenantId, phone: driverPhone },
        { $set: { lastLocationAt: new Date() } },
      );
    }

    res.json({ success: true, message: 'Location updated from WhatsApp.' });
  } catch (err) { next(err); }
});

// Location drop alert workflow
whatsappRouter.post('/location-drop', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { vehicleRegNumber, driverPhone } = req.body;
    const driver = driverPhone
      ? ((await DriverModel.findOne({ tenantId, phone: driverPhone }).lean()) as { phone?: string } | null)
      : null;
    const phone = driverPhone || driver?.phone;
    if (!phone) {
      return res.status(400).json({ success: false, error: { message: 'Driver phone required' } });
    }

    const alertText = `ALERT: Live Location signal drop for ${vehicleRegNumber}. Please open WhatsApp and share Live Location (8 hours) again.`;
    const sendResult = await sendWhatsAppMessage({ to: phone, body: alertText, tenantId });

    await WhatsAppMessageModel.create({
      id: `msg_${uuidv4().slice(0, 8)}`,
      tenantId,
      sender: 'SYSTEM',
      recipient: phone,
      content: alertText,
      type: 'LOCATION_DROP_ALERT',
      deliveryStatus: sendResult.ok ? 'sent' : 'failed',
      provider: sendResult.provider,
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

    res.json({ success: true, message: 'Location drop alert sent.', provider: sendResult.provider });
  } catch (err) { next(err); }
});
