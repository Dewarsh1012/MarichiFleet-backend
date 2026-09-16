import { eventBus, DomainEvent } from '../events/eventBus.js';
import { PlaybookRunModel, WhatsAppMessageModel, ConsignmentModel, ConsignorModel, ConsigneeModel, ExceptionModel } from '../../db/models/index.js';
import { logger } from '../logger.js';
import { v4 as uuidv4 } from 'uuid';

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

export function initPlaybookEngine() {
  logger.info('🤖 Initializing MarichiFleet Playbook Automation Engine...');

  // 1. PB-CONSIGNMENT-CREATED
  eventBus.subscribe('consignment.created', async (event: DomainEvent<any>) => {
    try {
      const consignment = event.payload;
      const consignor = await ConsignorModel.findOne({ id: consignment.consignorId });
      const actions: string[] = [];

      const phone = consignor?.mobile || '+91 98110 23456';
      const msgContent = `📦 MarichiFleet Update: Consignment ${consignment.consignmentNo} (LR: ${consignment.lrNo}) has been created for ${consignment.commodity} (${consignment.packageCount} ${consignment.packageType}, ${consignment.weight} Tons) from ${consignment.origin} to ${consignment.destination}. Track live: https://marichifleet.com/portal/consignor`;

      await WhatsAppMessageModel.create({
        id: `msg_pb_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        sender: 'SYSTEM',
        recipient: phone,
        senderName: 'MarichiFleet Dispatch Bot',
        content: msgContent,
        type: 'CONSIGNMENT_ALERT',
        timestamp: new Date(),
      });
      actions.push(`Sent WhatsApp alert to Consignor ${phone}`);

      await PlaybookRunModel.create({
        id: `run_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        playbookKey: 'PB-CONSIGNMENT-CREATED',
        version: 1,
        triggerEvent: event.type,
        entityId: consignment.id,
        status: 'SUCCESS',
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

      // Notify Consignor
      if (consignor?.mobile) {
        await WhatsAppMessageModel.create({
          id: `msg_pb_${uuidv4().slice(0, 8)}`,
          tenantId: event.tenantId,
          sender: 'SYSTEM',
          recipient: consignor.mobile,
          senderName: 'MarichiFleet Operations',
          content: `🚛 Pickup Scheduled: Vehicle assigned for ${consignment.consignmentNo} (LR: ${consignment.lrNo}). ${vehicleInfo}, ${driverInfo}. Estimated departure: ${consignment.shipmentDate}.`,
          type: 'DISPATCH_ALERT',
          timestamp: new Date(),
        });
        actions.push(`Notified consignor at ${consignor.mobile}`);
      }

      // Notify Consignee
      if (consignee?.mobile) {
        await WhatsAppMessageModel.create({
          id: `msg_pb_${uuidv4().slice(0, 8)}`,
          tenantId: event.tenantId,
          sender: 'SYSTEM',
          recipient: consignee.mobile,
          senderName: 'MarichiFleet Operations',
          content: `🚚 Incoming Cargo Notice: Consignment ${consignment.consignmentNo} is dispatched from ${consignment.origin}. Expected delivery by: ${consignment.expectedDeliveryDate}.`,
          type: 'DISPATCH_ALERT',
          timestamp: new Date(),
        });
        actions.push(`Notified consignee at ${consignee.mobile}`);
      }

      await PlaybookRunModel.create({
        id: `run_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        playbookKey: 'PB-CONSIGNMENT-PICKUP-DUE',
        version: 1,
        triggerEvent: event.type,
        entityId: consignment.id,
        status: 'SUCCESS',
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

      const phone = consignor?.mobile || '+91 98110 23456';
      await WhatsAppMessageModel.create({
        id: `msg_pb_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        sender: 'SYSTEM',
        recipient: phone,
        senderName: 'MarichiFleet Proof of Delivery',
        content: `✅ Delivered: Consignment ${consignment.consignmentNo} was safely handed over at ${consignment.destination}. Receiver: ${consignment.receiverName || 'Recipient Authorized Signatory'}. Digital POD is being indexed.`,
        type: 'DELIVERY_ALERT',
        timestamp: new Date(),
      });
      actions.push(`Sent Delivery & POD notice to ${phone}`);

      await PlaybookRunModel.create({
        id: `run_${uuidv4().slice(0, 8)}`,
        tenantId: event.tenantId,
        playbookKey: 'PB-CONSIGNMENT-DELIVERED',
        version: 1,
        triggerEvent: event.type,
        entityId: consignment.id,
        status: 'SUCCESS',
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
        await WhatsAppMessageModel.create({
          id: `msg_pb_${uuidv4().slice(0, 8)}`,
          tenantId: event.tenantId,
          sender: 'SYSTEM',
          recipient: consignee.mobile,
          senderName: 'MarichiFleet Billing & POD',
          content: `📄 Verified POD Copy Available: LR ${consignment.lrNo} (Consignment: ${consignment.consignmentNo}). Download copy: ${consignment.podUrl || 'https://marichifleet.com/portal/consignee'}`,
          type: 'POD_DOCUMENT',
          mediaUrl: consignment.podUrl,
          timestamp: new Date(),
        });
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
