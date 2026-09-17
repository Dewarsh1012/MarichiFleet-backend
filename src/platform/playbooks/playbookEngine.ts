import { eventBus, DomainEvent } from '../events/eventBus.js';
import { PlaybookRunModel, ConsignmentModel, ConsignorModel, ConsigneeModel, ExceptionModel } from '../../db/models/index.js';
import { logger } from '../logger.js';
import { v4 as uuidv4 } from 'uuid';
import { sendWhatsAppMessage, WhatsAppSendResult } from '../whatsapp/whatsappProvider.js';
import { persistWhatsAppOutbound } from '../whatsapp/whatsappMessageStore.js';
import { buildWhatsAppMessage } from '../whatsapp/whatsappTemplates.js';

export interface PlaybookDefinition {
  key: string;
  name: string;
  trigger: string;
  description: string;
  enabled: boolean;
}

export const PLAYBOOKS: PlaybookDefinition[] = [
  {
    key: 'PB-CONSIGNMENT-CREATED',
    name: 'Consignment Creation Alert',
    trigger: 'consignment.created',
    description: 'Notifies consignor via WhatsApp upon consignment generation with LR and tracking references.',
    enabled: true,
  },
  {
    key: 'PB-CONSIGNMENT-PICKUP-DUE',
    name: 'Vehicle & Driver Assignment Notification',
    trigger: 'consignment.vehicle_assigned',
    description: 'Dispatches vehicle number, driver contact, and ETA details to consignor and consignee.',
    enabled: true,
  },
  {
    key: 'PB-CONSIGNMENT-DELAYED',
    name: 'Shipment Delay & ETA Recalculation',
    trigger: 'consignment.delayed',
    description: 'Recalculates transit schedule and alerts customer support and consignee when delayed.',
    enabled: true,
  },
  {
    key: 'PB-CONSIGNMENT-DELIVERED',
    name: 'Delivery Confirmation & POD Request',
    trigger: 'consignment.delivered',
    description: 'Notifies consignor and consignee of delivery completion and requests immediate digital POD upload.',
    enabled: true,
  },
  {
    key: 'PB-POD-PENDING',
    name: 'POD Missing Escalation (24 Hours)',
    trigger: 'pod.pending_escalation',
    description: 'Flags SLA breach and escalates missing POD to Branch Manager if unverified after 24h.',
    enabled: true,
  },
];

async function sendPlaybookWhatsApp(input: {
  tenantId: string;
  phone: string;
  content: string;
  type: string;
  senderName: string;
  template?: ReturnType<typeof buildWhatsAppMessage>;
  mediaUrl?: string;
}): Promise<WhatsAppSendResult> {
  const message = input.template ?? { body: input.content };
  const result = await sendWhatsAppMessage({ to: input.phone, ...message, tenantId: input.tenantId });
  await persistWhatsAppOutbound({
    input: { to: input.phone, ...message, tenantId: input.tenantId },
    result,
    content: input.content,
    type: input.type,
    senderName: input.senderName,
    mediaUrl: input.mediaUrl,
  });
  return result;
}

export function initPlaybookEngine() {
  logger.info('🤖 Initializing MarichiFleet Playbook Automation Engine...');

  // 1. PB-CONSIGNMENT-CREATED
  eventBus.subscribe('consignment.created', async (event: DomainEvent<any>) => {
    try {
      const consignment = event.payload;
      const consignor = await ConsignorModel.findOne({ id: consignment.consignorId });
      const actions: string[] = [];

      const phone = consignor?.mobile;
      if (!phone) throw new Error(`Consignor phone unavailable for ${consignment.consignorId}`);
      const msgContent = `📦 MarichiFleet Update: Consignment ${consignment.consignmentNo} (LR: ${consignment.lrNo}) has been created for ${consignment.commodity} (${consignment.packageCount} ${consignment.packageType}, ${consignment.weight} Tons) from ${consignment.origin} to ${consignment.destination}. Track live: https://marichifleet.com/portal/consignor`;

      const sendResult = await sendPlaybookWhatsApp({
        tenantId: event.tenantId,
        phone,
        content: msgContent,
        type: 'CONSIGNMENT_ALERT',
        senderName: 'MarichiFleet Dispatch Bot',
      });
      actions.push(sendResult.ok
        ? `Sent WhatsApp alert to Consignor ${phone} (${sendResult.provider})`
        : `WhatsApp alert failed for Consignor ${phone}: ${sendResult.error?.message}`);

      await PlaybookRunModel.create({
        id: `run_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        playbookKey: 'PB-CONSIGNMENT-CREATED',
        version: 1,
        triggerEvent: event.type,
        entityId: consignment.id,
        status: sendResult.ok ? 'SUCCESS' : 'FAILED',
        actionsTaken: actions,
        executedAt: new Date(),
      });
    } catch (err) {
      logger.error({ err }, 'Error in PB-CONSIGNMENT-CREATED playbook execution');
    }
  });

  // 2. PB-CONSIGNMENT-PICKUP-DUE / VEHICLE & DRIVER ASSIGNED
  eventBus.subscribe('consignment.vehicle_assigned', async (event: DomainEvent<any>) => {
    try {
      const consignment = event.payload;
      const [consignor, consignee] = await Promise.all([
        ConsignorModel.findOne({ id: consignment.consignorId }),
        ConsigneeModel.findOne({ id: consignment.consigneeId }),
      ]);
      const actions: string[] = [];

      const driverInfo = consignment.driverName ? `Driver: ${consignment.driverName} (${consignment.driverPhone || 'On Call'})` : 'Driver assigned';
      const vehicleInfo = `Vehicle: ${consignment.vehicleRegNumber || 'Designated Fleet Vehicle'}`;
      const sendResults: WhatsAppSendResult[] = [];

      // Notify Consignor
      if (consignor?.mobile) {
        const content = `🚛 Pickup Scheduled: Vehicle assigned for ${consignment.consignmentNo} (LR: ${consignment.lrNo}). ${vehicleInfo}, ${driverInfo}. Estimated departure: ${consignment.shipmentDate}.`;
        const result = await sendPlaybookWhatsApp({
          tenantId: event.tenantId,
          phone: consignor.mobile,
          senderName: 'MarichiFleet Operations',
          content,
          type: 'DISPATCH_ALERT',
        });
        sendResults.push(result);
        actions.push(result.ok ? `Notified consignor at ${consignor.mobile}` : `Consignor notification failed: ${result.error?.message}`);
      }

      // Notify Consignee
      if (consignee?.mobile) {
        const content = `🚚 Incoming Cargo Notice: Consignment ${consignment.consignmentNo} is dispatched from ${consignment.origin}. Expected delivery by: ${consignment.expectedDeliveryDate}.`;
        const message = buildWhatsAppMessage('eta_update', {
          reference: consignment.consignmentNo,
          eta: consignment.expectedDeliveryDate,
        });
        const result = await sendPlaybookWhatsApp({
          tenantId: event.tenantId,
          phone: consignee.mobile,
          senderName: 'MarichiFleet Operations',
          content,
          type: 'DISPATCH_ALERT',
          template: message,
        });
        sendResults.push(result);
        actions.push(result.ok ? `Notified consignee at ${consignee.mobile}` : `Consignee notification failed: ${result.error?.message}`);
      }

      await PlaybookRunModel.create({
        id: `run_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        playbookKey: 'PB-CONSIGNMENT-PICKUP-DUE',
        version: 1,
        triggerEvent: event.type,
        entityId: consignment.id,
        status: sendResults.length > 0 && sendResults.every((result) => result.ok) ? 'SUCCESS' : 'FAILED',
        actionsTaken: actions,
        executedAt: new Date(),
      });
    } catch (err) {
      logger.error({ err }, 'Error in PB-CONSIGNMENT-PICKUP-DUE playbook execution');
    }
  });

  // 3. PB-CONSIGNMENT-DELIVERED
  eventBus.subscribe('consignment.delivered', async (event: DomainEvent<any>) => {
    try {
      const consignment = event.payload;
      const consignor = await ConsignorModel.findOne({ id: consignment.consignorId });
      const actions: string[] = [];

      const phone = consignor?.mobile;
      if (!phone) throw new Error(`Consignor phone unavailable for ${consignment.consignorId}`);
      const content = `✅ Delivered: Consignment ${consignment.consignmentNo} was safely handed over at ${consignment.destination}. Receiver: ${consignment.receiverName || 'Recipient Authorized Signatory'}. Please upload the signed digital POD.`;
      const sendResult = await sendPlaybookWhatsApp({
        tenantId: event.tenantId,
        phone,
        senderName: 'MarichiFleet Proof of Delivery',
        content,
        type: 'DELIVERY_ALERT',
        template: buildWhatsAppMessage('pod_reminder', { reference: consignment.consignmentNo }),
      });
      actions.push(sendResult.ok
        ? `Sent Delivery & POD notice to ${phone}`
        : `Delivery & POD notice failed for ${phone}: ${sendResult.error?.message}`);

      await PlaybookRunModel.create({
        id: `run_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        playbookKey: 'PB-CONSIGNMENT-DELIVERED',
        version: 1,
        triggerEvent: event.type,
        entityId: consignment.id,
        status: sendResult.ok ? 'SUCCESS' : 'FAILED',
        actionsTaken: actions,
        executedAt: new Date(),
      });
    } catch (err) {
      logger.error({ err }, 'Error in PB-CONSIGNMENT-DELIVERED playbook execution');
    }
  });

  // 4. PB-CONSIGNMENT-POD-UPLOADED
  eventBus.subscribe('consignment.pod_uploaded', async (event: DomainEvent<any>) => {
    try {
      const consignment = event.payload;
      const consignee = await ConsigneeModel.findOne({ id: consignment.consigneeId });
      if (consignee?.mobile) {
        const content = `📄 Verified POD Copy Available: LR ${consignment.lrNo} (Consignment: ${consignment.consignmentNo}). Download copy: ${consignment.podUrl || 'https://marichifleet.com/portal/consignee'}`;
        const result = await sendPlaybookWhatsApp({
          tenantId: event.tenantId,
          phone: consignee.mobile,
          senderName: 'MarichiFleet Billing & POD',
          content,
          type: 'POD_DOCUMENT',
          mediaUrl: consignment.podUrl,
        });
        if (!result.ok) logger.warn({ error: result.error, consignmentId: consignment.id }, 'POD WhatsApp notification failed');
      }
    } catch (err) {
      logger.error({ err }, 'Error in PB-CONSIGNMENT-POD-UPLOADED');
    }
  });

  // 5. PB-POD-PENDING Escalation checker
  setInterval(async () => {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pendingPods = await ConsignmentModel.find({
        currentStatus: 'DELIVERED',
        podUrl: { $in: [null, ''] },
        updatedAt: { $lte: oneDayAgo },
      }).limit(10);

      for (const c of pendingPods) {
        // Create escalation exception
        const existing = await ExceptionModel.findOne({ id: `exc_pod_${c.id}` });
        if (!existing) {
          await ExceptionModel.create({
            id: `exc_pod_${c.id}`,
            tenantId: c.tenantId,
            vehicleRegNumber: c.vehicleRegNumber || 'UNKNOWN',
            type: 'POD_MISSING_ESCALATION',
            severity: 'HIGH',
            description: `SLA Breach: Consignment ${c.consignmentNo} (LR: ${c.lrNo}) delivered >24 hours ago but POD is still pending upload.`,
            status: 'OPEN',
            timestamp: new Date(),
          });

          await PlaybookRunModel.create({
            id: `run_${uuidv4().slice(0, 8)}`,
            tenantId: c.tenantId,
            playbookKey: 'PB-POD-PENDING',
            version: 1,
            triggerEvent: 'pod.pending_escalation',
            entityId: c.id,
            status: 'SUCCESS',
            actionsTaken: [`Escalated SLA breach to Branch Manager for ${c.consignmentNo}`],
            executedAt: new Date(),
          });
        }
      }
    } catch (e) {
      // Quiet background check
    }
  }, 60000); // Check periodically
}
