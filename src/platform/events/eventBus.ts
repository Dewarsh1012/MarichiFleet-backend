import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import { v4 as uuidv4 } from 'uuid';

export type DomainEventType =
  | 'consignor.created'
  | 'consignor.updated'
  | 'consignor.deleted'
  | 'consignee.created'
  | 'consignee.updated'
  | 'consignee.deleted'
  | 'consignment.created'
  | 'consignment.booked'
  | 'consignment.vehicle_assigned'
  | 'consignment.driver_assigned'
  | 'consignment.picked_up'
  | 'consignment.in_transit'
  | 'consignment.delivered'
  | 'consignment.pod_uploaded'
  | 'consignment.closed';

export interface DomainEvent<T = any> {
  id: string;
  type: DomainEventType;
  tenantId: string;
  aggregateId: string;
  aggregateType: 'consignor' | 'consignee' | 'consignment' | 'booking';
  payload: T;
  actor: {
    userId: string;
    name: string;
    role: string;
  };
  occurredAt: Date;
  version: number;
}

class EventBus extends EventEmitter {
  private inMemoryHistory: DomainEvent[] = [];

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  public async publish<T>(
    type: DomainEventType,
    params: {
      tenantId: string;
      aggregateId: string;
      aggregateType: 'consignor' | 'consignee' | 'consignment' | 'booking';
      payload: T;
      actor?: {
        userId?: string;
        name?: string;
        role?: string;
      };
      version?: number;
    }
  ): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      id: `evt_${uuidv4().slice(0, 12)}`,
      type,
      tenantId: params.tenantId,
      aggregateId: params.aggregateId,
      aggregateType: params.aggregateType,
      payload: params.payload,
      actor: {
        userId: params.actor?.userId || 'system',
        name: params.actor?.name || 'System Event Runner',
        role: params.actor?.role || 'SYSTEM',
      },
      occurredAt: new Date(),
      version: params.version || 1,
    };

    this.inMemoryHistory.unshift(event);
    if (this.inMemoryHistory.length > 500) {
      this.inMemoryHistory.pop();
    }

    logger.info({ eventId: event.id, type: event.type, aggregateId: event.aggregateId }, `⚡ Domain Event Emitted: ${event.type}`);

    // Emit event asynchronously to all subscribers
    setImmediate(() => {
      this.emit(type, event);
      this.emit('*', event);
    });

    return event;
  }

  public subscribe(type: DomainEventType | '*', handler: (event: DomainEvent) => void | Promise<void>) {
    this.on(type, async (evt) => {
      try {
        await handler(evt);
      } catch (err) {
        logger.error({ err, eventId: evt.id, eventType: evt.type }, `❌ Error handling domain event ${evt.type}`);
      }
    });
  }

  public getRecentEvents(tenantId?: string, limit = 50): DomainEvent[] {
    if (!tenantId) return this.inMemoryHistory.slice(0, limit);
    return this.inMemoryHistory.filter((e) => e.tenantId === tenantId).slice(0, limit);
  }
}

export const eventBus = new EventBus();
