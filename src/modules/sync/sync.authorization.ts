import type { AuthContext } from '../../platform/types.js';
import { AppError } from '../../platform/errors.js';

type DriverScopedClaims = AuthContext & {
  driverId?: string;
  selfScope?: string;
};

export function driverIdFromAuth(auth: AuthContext): string {
  if (auth.role !== 'DRIVER') {
    throw AppError.forbidden('Offline driver mutations require a DRIVER identity');
  }

  const claims = auth as DriverScopedClaims;
  if (claims.driverId) return claims.driverId;
  if (claims.selfScope) return claims.selfScope;
  if (/^drv_[A-Za-z0-9_.:-]+$/.test(auth.userId)) return auth.userId;

  // Compatibility for the existing seeded identities: usr_driver_01 owns drv_01.
  const seededIdentity = /^usr_driver_([A-Za-z0-9_.:-]+)$/.exec(auth.userId);
  if (seededIdentity) return `drv_${seededIdentity[1]}`;

  throw AppError.forbidden('JWT is missing a driver self-scope claim');
}

export function assertTenantAndDriverOwnership<T extends { tenantId?: string; driverId?: string }>(
  resource: T | null,
  tenantId: string,
  driverId: string,
  resourceName: string,
): asserts resource is T & { tenantId: string; driverId: string } {
  if (!resource || resource.tenantId !== tenantId) {
    throw AppError.notFound(resourceName);
  }
  if (resource.driverId !== driverId) {
    throw AppError.forbidden(`${resourceName} is not assigned to the authenticated driver`);
  }
}

export function sameMutationIdentity(
  prior: { deviceId: string; seq: number; payloadHash: string },
  candidate: { deviceId: string; seq: number; payloadHash: string },
): boolean {
  return prior.deviceId === candidate.deviceId &&
    prior.seq === candidate.seq &&
    prior.payloadHash === candidate.payloadHash;
}
