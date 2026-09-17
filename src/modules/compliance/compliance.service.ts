import {
  ComplianceItemModel,
  DriverModel,
  VehicleModel,
} from '../../db/models/index.js';

export type ComplianceBlocker = {
  code:
    | 'COMPLIANCE_NON_COMPLIANT'
    | 'COMPLIANCE_PENDING'
    | 'COMPLIANCE_EXPIRED'
    | 'VEHICLE_DOCUMENT_EXPIRED'
    | 'DRIVER_LICENSE_EXPIRED';
  entityType: 'VEHICLE' | 'DRIVER' | 'COMPANY';
  entityId: string;
  itemType: string;
  message: string;
  dueDate?: string;
};

export interface ComplianceGateInput {
  tenantId: string;
  vehicleRegNumber: string;
  driverId?: string;
  at?: Date;
}

function expired(value: string | Date | undefined, at: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < at.getTime();
}

export async function evaluateDispatchCompliance(
  input: ComplianceGateInput
): Promise<ComplianceBlocker[]> {
  const at = input.at ?? new Date();
  const subjectFilters: Array<Record<string, unknown>> = [
    { entityType: 'COMPANY' },
    { entityType: 'VEHICLE', entityId: input.vehicleRegNumber },
  ];
  if (input.driverId) {
    subjectFilters.push({ entityType: 'DRIVER', entityId: input.driverId });
  }

  const [items, vehicleResult, driverResult] = await Promise.all([
    ComplianceItemModel.find({ tenantId: input.tenantId, $or: subjectFilters }).lean(),
    VehicleModel.findOne({
      tenantId: input.tenantId,
      regNumber: input.vehicleRegNumber,
    }).lean(),
    input.driverId
      ? DriverModel.findOne({ tenantId: input.tenantId, id: input.driverId }).lean()
      : Promise.resolve(null),
  ]);
  const vehicle: any = vehicleResult;
  const driver: any = driverResult;

  const blockers: ComplianceBlocker[] = [];
  for (const item of items) {
    const dueDate = item.dueDate?.toISOString();
    if (expired(item.dueDate, at)) {
      blockers.push({
        code: 'COMPLIANCE_EXPIRED',
        entityType: item.entityType,
        entityId: item.entityId,
        itemType: item.itemType,
        message: `${item.itemType} expired`,
        dueDate,
      });
    } else if (item.status === 'NON_COMPLIANT') {
      blockers.push({
        code: 'COMPLIANCE_NON_COMPLIANT',
        entityType: item.entityType,
        entityId: item.entityId,
        itemType: item.itemType,
        message: `${item.itemType} is non-compliant`,
        dueDate,
      });
    } else if (item.status === 'PENDING') {
      blockers.push({
        code: 'COMPLIANCE_PENDING',
        entityType: item.entityType,
        entityId: item.entityId,
        itemType: item.itemType,
        message: `${item.itemType} is pending verification`,
        dueDate,
      });
    }
  }

  const vehicleDocuments = vehicle?.documents;
  for (const [itemType, dueDate] of Object.entries(vehicleDocuments ?? {}) as Array<
    [string, string | Date | undefined]
  >) {
    if (expired(dueDate, at)) {
      blockers.push({
        code: 'VEHICLE_DOCUMENT_EXPIRED',
        entityType: 'VEHICLE',
        entityId: input.vehicleRegNumber,
        itemType,
        message: `${itemType} expired`,
        dueDate: new Date(dueDate as string).toISOString(),
      });
    }
  }

  if (driver && expired(driver.licenseValidUntil, at)) {
    blockers.push({
      code: 'DRIVER_LICENSE_EXPIRED',
      entityType: 'DRIVER',
      entityId: driver.id,
      itemType: 'DRIVER_LICENSE',
      message: 'Driver license expired',
      dueDate: new Date(driver.licenseValidUntil).toISOString(),
    });
  }

  return blockers;
}
