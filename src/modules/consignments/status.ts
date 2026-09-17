import type { ConsignmentStatus } from '../../db/models/index.js';

export const CONSIGNMENT_STATUSES = [
  'DRAFT',
  'BOOKED',
  'VEHICLE_ASSIGNED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'POD_RECEIVED',
  'CLOSED',
] as const satisfies readonly ConsignmentStatus[];

export const TRIP_STATUSES = [
  'PLANNED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

const CONSIGNMENT_ALIASES: Record<string, ConsignmentStatus> = {
  CREATED: 'DRAFT',
  CONFIRMED: 'BOOKED',
  ASSIGNED: 'VEHICLE_ASSIGNED',
  PICKUP_COMPLETE: 'PICKED_UP',
  ON_ROAD: 'IN_TRANSIT',
  COMPLETED: 'DELIVERED',
  POD_UPLOADED: 'POD_RECEIVED',
};

const TRIP_ALIASES: Record<string, TripStatus> = {
  CREATED: 'PLANNED',
  STARTED: 'IN_TRANSIT',
  EN_ROUTE: 'IN_TRANSIT',
  CLOSED: 'COMPLETED',
};

export function canonicalConsignmentStatus(value: string): ConsignmentStatus | undefined {
  const normalized = value.trim().toUpperCase();
  return CONSIGNMENT_STATUSES.includes(normalized as ConsignmentStatus)
    ? (normalized as ConsignmentStatus)
    : CONSIGNMENT_ALIASES[normalized];
}

export function canonicalTripStatus(value: string): TripStatus | undefined {
  const normalized = value.trim().toUpperCase();
  return TRIP_STATUSES.includes(normalized as TripStatus)
    ? (normalized as TripStatus)
    : TRIP_ALIASES[normalized];
}
