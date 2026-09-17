import express, { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { WhatsAppMessageModel, VehicleModel, ExceptionModel, DriverModel } from '../../db/models/index.js';
import { sendWhatsAppMessage } from '../../platform/whatsapp/whatsappProvider.js';
import { buildWhatsAppMessage } from '../../platform/whatsapp/whatsappTemplates.js';
import { parseWhatsAppWebhook, verifyMetaWebhookSignature } from '../../platform/whatsapp/whatsappWebhook.js';
import {
  applyWhatsAppStatus,
  persistWhatsAppInbound,
  persistWhatsAppOutbound,
} from '../../platform/whatsapp/whatsappMessageStore.js';
import { logger } from '../../platform/logger.js';
import { v4 as uuidv4 } from 'uuid';

export const whatsappPublicRouter = Router();
export const whatsappProtectedRouter = Router();
/** Backwards-compatible protected router export. Webhooks must use whatsappPublicRouter. */
export const whatsappRouter = whatsappProtectedRouter;

// Get conversation messages
whatsappProtectedRouter.get('/messages', requirePermission('read', 'whatsapp'), async (req: AuthenticatedRequest, res: Response, next) => {
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

// Send through Meta (or explicit non-production simulation) and persist the attempt.
whatsappProtectedRouter.post('/send', requirePermission('create', 'whatsapp'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z.object({
      phone: z.string().min(8),
      content: z.string().min(1).optional(),
      messageKind: z.enum(['driver_offer', 'eta_update', 'pod_reminder', 'approval']).optional(),
      templateData: z.object({
        driverName: z.string().optional(),
        reference: z.string(),
        origin: z.string().optional(),
        destination: z.string().optional(),
        eta: z.string().optional(),
        amount: z.string().optional(),
        decision: z.enum(['APPROVED', 'REJECTED']).optional(),
        reason: z.string().optional(),
      }).optional(),
      senderName: z.string().optional(),
      mediaUrl: z.string().optional(),
      tripId: z.string().optional(),
      purpose: z.string().optional(),
    }).superRefine((value, ctx) => {
      if (!value.content && !(value.messageKind && value.templateData)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'content or messageKind with templateData is required' });
      }
    }).parse(req.body);

    const message = body.messageKind && body.templateData
      ? buildWhatsAppMessage(body.messageKind, body.templateData)
      : { body: body.content! };
    const displayContent = message.body ?? body.content ?? `${body.messageKind} template`;

    const sendResult = await sendWhatsAppMessage({
      to: body.phone,
      ...message,
      tenantId,
    });

    const sent = await persistWhatsAppOutbound({
      input: { to: body.phone, ...message, tenantId },
      result: sendResult,
      content: displayContent,
      type: body.purpose ?? body.messageKind ?? 'OUTBOUND',
      senderName: body.senderName ?? req.auth!.name,
      mediaUrl: body.mediaUrl,
      tripId: body.tripId,
    });

    res.status(sendResult.ok ? 200 : 502).json({
      success: sendResult.ok,
      data: {
        sent,
        result: sendResult,
        simulated: sendResult.provider === 'simulated',
      },
    });
  } catch (err) { next(err); }
});

// These handlers are intentionally isolated from the protected router.
whatsappPublicRouter.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (verifyToken && mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

whatsappPublicRouter.post('/webhook', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined;
  if (!rawBody) {
    return res.status(400).json({
      success: false,
      error: 'Raw request body unavailable. Mount whatsappPublicRouter before express.json().',
    });
  }
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? '';
  const signature = req.get('x-hub-signature-256');
  if (!verifyMetaWebhookSignature(rawBody, signature, appSecret)) {
    return res.status(401).json({ success: false, error: 'Invalid Meta webhook signature.' });
  }

  try {
    const parsed = parseWhatsAppWebhook(JSON.parse(rawBody.toString('utf8')));
    const tenantId = resolveWebhookTenant(parsed.phoneNumberId);
    if (!tenantId) {
      logger.error({ phoneNumberId: parsed.phoneNumberId }, 'No tenant mapping for WhatsApp webhook');
      return res.status(503).json({ success: false, error: 'No tenant mapping for WhatsApp phone number.' });
    }
    let inserted = 0;
    for (const message of parsed.messages) {
      if (await persistWhatsAppInbound(tenantId, parsed.displayPhoneNumber ?? parsed.phoneNumberId ?? '', message)) inserted += 1;
    }
    for (const status of parsed.statuses) {
      await applyWhatsAppStatus(tenantId, status);
    }
    return res.status(200).json({ success: true, received: parsed.messages.length, inserted, statuses: parsed.statuses.length });
  } catch (error) {
    logger.error({ error }, 'Failed to process WhatsApp webhook');
    return res.status(500).json({ success: false, error: 'Webhook processing failed.' });
  }
});

// Update live location from an authenticated internal request.
whatsappProtectedRouter.post('/live-location', requirePermission('update', 'whatsapp'), async (req: AuthenticatedRequest, res: Response, next) => {
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
whatsappProtectedRouter.post('/location-drop', requirePermission('create', 'whatsapp'), async (req: AuthenticatedRequest, res: Response, next) => {
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

    await persistWhatsAppOutbound({
      input: { to: phone, body: alertText, tenantId },
      result: sendResult,
      content: alertText,
      type: 'LOCATION_DROP_ALERT',
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

    res.status(sendResult.ok ? 200 : 502).json({
      success: sendResult.ok,
      message: sendResult.ok ? 'Location drop alert sent.' : 'Location drop alert was not sent.',
      result: sendResult,
    });
  } catch (err) { next(err); }
});

export function resolveWebhookTenant(phoneNumberId: string | undefined): string | undefined {
  if (phoneNumberId && process.env.WHATSAPP_PHONE_NUMBER_TENANT_MAP) {
    try {
      const mapping = JSON.parse(process.env.WHATSAPP_PHONE_NUMBER_TENANT_MAP) as Record<string, string>;
      if (mapping[phoneNumberId]) return mapping[phoneNumberId];
    } catch {
      logger.error('WHATSAPP_PHONE_NUMBER_TENANT_MAP is not valid JSON');
    }
  }
  return process.env.WHATSAPP_TENANT_ID;
}
