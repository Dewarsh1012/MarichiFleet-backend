import { ConsignmentModel, ConsignmentStatusHistoryModel, ConsignmentStatus } from '../../db/models/index.js';
import { eventBus, DomainEventType } from '../../platform/events/eventBus.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { v4 as uuidv4 } from 'uuid';

export async function generateConsignmentNumbers(tenantId: string): Promise<{ consignmentNo: string; lrNo: string }> {
  const currentYear = new Date().getFullYear();
  const count = await ConsignmentModel.countDocuments({ tenantId });
  const seq = String(count + 1).padStart(6, '0');
  return {
    consignmentNo: `CON-${currentYear}-${seq}`,
    lrNo: `LR-${currentYear}-${seq}`,
  };
}

export const VALID_TRANSITIONS: Record<ConsignmentStatus, ConsignmentStatus[]> = {
  DRAFT: ['BOOKED', 'CLOSED'],
  BOOKED: ['VEHICLE_ASSIGNED', 'CLOSED'],
  VEHICLE_ASSIGNED: ['DRIVER_ASSIGNED', 'PICKED_UP', 'CLOSED'],
  DRIVER_ASSIGNED: ['PICKED_UP', 'CLOSED'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  AT_HUB: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['POD_RECEIVED'],
  POD_RECEIVED: ['CLOSED'],
  CLOSED: [],
};

export function canTransitionStatus(current: ConsignmentStatus, next: ConsignmentStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

export async function transitionConsignmentStatus(params: {
  consignmentId: string;
  tenantId: string;
  nextStatus: ConsignmentStatus;
  remarks?: string;
  location?: string;
  actor: {
    userId: string;
    email: string;
    name: string;
    role: string;
  };
  extraUpdates?: Record<string, any>;
}) {
  const { consignmentId, tenantId, nextStatus, remarks, location, actor, extraUpdates = {} } = params;

  const consignment = await ConsignmentModel.findOne({ id: consignmentId, tenantId });
  if (!consignment) {
    throw new Error(`Consignment ${consignmentId} not found`);
  }

  const prevStatus = consignment.currentStatus;
  // Super Admin can override transition if needed; otherwise enforce finite state machine
  if (actor.role !== 'SUPER_ADMIN' && !canTransitionStatus(prevStatus, nextStatus)) {
    throw new Error(`Invalid status transition from ${prevStatus} to ${nextStatus}. Allowed: ${VALID_TRANSITIONS[prevStatus]?.join(', ') || 'None'}`);
  }

  // Update consignment
  const updated: any = await ConsignmentModel.findOneAndUpdate(
    { id: consignmentId, tenantId, currentStatus: prevStatus },
    {
      $set: {
        currentStatus: nextStatus,
        lastUpdate: new Date(),
        ...extraUpdates,
      },
    },
    { new: true }
  ).lean();
  if (!updated) {
    throw new Error(`Consignment ${consignmentId} changed concurrently; retry the transition`);
  }

  // Record immutable status history
  await ConsignmentStatusHistoryModel.create({
    id: `csh_${uuidv4().slice(0, 8)}`,
    consignmentId,
    tenantId,
    fromStatus: prevStatus,
    toStatus: nextStatus,
    remarks: remarks || `Transitioned from ${prevStatus} to ${nextStatus}`,
    location: location || consignment.origin,
    actor: {
      userId: actor.userId,
      name: actor.name,
      role: actor.role,
    },
    timestamp: new Date(),
  });

  // Map to domain event
  const eventMap: Partial<Record<ConsignmentStatus, DomainEventType>> = {
    BOOKED: 'consignment.booked',
    VEHICLE_ASSIGNED: 'consignment.vehicle_assigned',
    DRIVER_ASSIGNED: 'consignment.driver_assigned',
    PICKED_UP: 'consignment.picked_up',
    IN_TRANSIT: 'consignment.in_transit',
    DELIVERED: 'consignment.delivered',
    POD_RECEIVED: 'consignment.pod_uploaded',
    CLOSED: 'consignment.closed',
  };

  const eventType = eventMap[nextStatus];
  if (eventType) {
    await eventBus.publish(eventType, {
      tenantId,
      aggregateId: consignmentId,
      aggregateType: 'consignment',
      payload: updated,
      actor,
    });
  }

  // Record append-only audit trail
  await recordAudit({
    tenantId,
    module: 'consignments',
    resourceId: consignmentId,
    action: `STATUS_CHANGE_${nextStatus}`,
    actor,
    details: { fromStatus: prevStatus, toStatus: nextStatus, remarks, ...extraUpdates },
  });

  return updated;
}
