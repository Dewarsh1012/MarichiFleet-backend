import { AuthContext, UserRole } from '../types.js';
import { AppError } from '../errors.js';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types.js';

export type Action =
  | 'read'
  | 'write'
  | 'update'
  | 'create'
  | 'delete'
  | 'approve'
  | 'override'
  | 'post_ledger'
  | 'assign_asset'
  | 'dispatch'
  | 'finalise_invoice';

export type Resource =
  | 'trips'
  | 'bookings'
  | 'consignments'
  | 'consignors'
  | 'consignees'
  | 'vehicles'
  | 'drivers'
  | 'invoices'
  | 'ledger'
  | 'tower'
  | 'approvals'
  | 'rate_cards'
  | 'claims'
  | 'settings'
  | 'customers'
  | 'vendors'
  | 'compliance'
  | 'documents'
  | 'expenses'
  | 'fuel'
  | 'incidents'
  | 'roles'
  | 'users'
  | 'tenants'
  | 'branches'
  | 'audit_logs'
  | 'portals'
  | 'reports'
  | 'automation'
  | 'whatsapp';

export function can(ctx: AuthContext, action: Action, resource: Resource): boolean {
  const { role, permissions = [] } = ctx;

  // 1. Wildcard permissions check
  if (permissions.includes('*') || permissions.includes(`${resource}:*`) || permissions.includes(`${resource}:${action}`)) {
    return true;
  }

  // 2. Super Admin & Fleet Owner have omnipotent access across all tenants & modules
  if (role === 'SUPER_ADMIN' || role === 'FLEET_OWNER') {
    return true;
  }

  // 3. Admin has tenant-wide administrative and operational access
  if (role === 'ADMIN') {
    if (resource === 'tenants' && action === 'delete') return false; // only super admin can delete tenant
    return true;
  }

  switch (resource) {
    case 'consignments':
      if (['OPERATIONS_MANAGER', 'BRANCH_MANAGER', 'BOOKING_OPERATOR', 'DISPATCHER'].includes(role)) {
        return true;
      }
      if (role === 'TRACKING_EXECUTIVE') {
        return action === 'read' || action === 'update';
      }
      if (['FINANCE_EXECUTIVE', 'FINANCE_CONTROLLER', 'AUDITOR', 'CUSTOMER_SUPPORT'].includes(role)) {
        return action === 'read';
      }
      if (['CONSIGNOR_USER', 'CONSIGNOR_ADMIN', 'CONSIGNEE_USER', 'CUSTOMER_USER'].includes(role)) {
        return action === 'read' || (action === 'create' && ['CONSIGNOR_USER', 'CONSIGNOR_ADMIN'].includes(role));
      }
      if (role === 'DRIVER') {
        return action === 'read' || action === 'update'; // for POD upload & checkpoint
      }
      return action === 'read';

    case 'consignors':
    case 'consignees':
      if (['OPERATIONS_MANAGER', 'BRANCH_MANAGER', 'BOOKING_OPERATOR', 'DISPATCHER'].includes(role)) {
        return true;
      }
      if (['CUSTOMER_SUPPORT', 'FINANCE_EXECUTIVE', 'AUDITOR', 'TRACKING_EXECUTIVE'].includes(role)) {
        return action === 'read';
      }
      if (['CONSIGNOR_USER', 'CONSIGNOR_ADMIN', 'CONSIGNEE_USER', 'CUSTOMER_USER'].includes(role)) {
        return action === 'read';
      }
      return action === 'read';

    case 'trips':
    case 'tower':
      if (
        ['CONTROL_TOWER_LEAD', 'TRACKING_EXECUTIVE', 'DISPATCHER', 'LOGISTICS_MANAGER', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER'].includes(
          role
        )
      ) {
        return true;
      }
      if (role === 'DRIVER' && (action === 'read' || action === 'write' || action === 'update')) {
        return true;
      }
      if (['CONSIGNOR_ADMIN', 'CONSIGNOR_USER', 'CONSIGNEE_USER', 'CUSTOMER_USER'].includes(role) && action === 'read') {
        return true;
      }
      return action === 'read';

    case 'bookings':
      if (['DISPATCHER', 'LOGISTICS_MANAGER', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER', 'BOOKING_OPERATOR'].includes(role)) {
        return true;
      }
      if (['CONSIGNOR_ADMIN', 'CONSIGNOR_USER', 'CUSTOMER_USER'].includes(role) && (action === 'create' || action === 'read')) {
        return true;
      }
      return action === 'read';

    case 'vehicles':
    case 'drivers':
      if (['LOGISTICS_MANAGER', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER', 'SAFETY_OFFICER', 'DISPATCHER'].includes(role)) {
        return true;
      }
      return action === 'read';

    case 'invoices':
      if (['FINANCE_CONTROLLER', 'FINANCE_EXECUTIVE', 'BILLING_EXECUTIVE'].includes(role)) {
        return true;
      }
      if (['ACCOUNTS_PAYABLE', 'AUDITOR', 'CONSIGNOR_ADMIN', 'CONSIGNOR_USER'].includes(role) && action === 'read') {
        return true;
      }
      return false;

    case 'ledger':
      if (['FINANCE_CONTROLLER', 'FINANCE_EXECUTIVE'].includes(role)) {
        return true;
      }
      if (['AUDITOR', 'BILLING_EXECUTIVE'].includes(role) && action === 'read') {
        return true;
      }
      return false;

    case 'approvals':
      if (action === 'approve' || action === 'override') {
        return ['SUPER_ADMIN', 'FLEET_OWNER', 'FINANCE_CONTROLLER', 'CONTROL_TOWER_LEAD', 'OPERATIONS_MANAGER'].includes(role);
      }
      return true;

    case 'roles':
    case 'users':
    case 'branches':
    case 'tenants':
    case 'settings':
      if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
        return true;
      }
      if (role === 'BRANCH_MANAGER' && resource === 'users' && action === 'read') {
        return true;
      }
      return false;

    case 'audit_logs':
      return ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(role);

    case 'reports':
      return ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER', 'FINANCE_EXECUTIVE', 'AUDITOR'].includes(role);

    case 'portals':
      return ['CONSIGNOR_USER', 'CONSIGNOR_ADMIN', 'CONSIGNEE_USER', 'CUSTOMER_USER', 'SUPER_ADMIN', 'ADMIN'].includes(role);

    case 'customers':
    case 'vendors':
    case 'compliance':
    case 'documents':
    case 'expenses':
    case 'fuel':
    case 'incidents':
    case 'automation':
      return true;

    default:
      return false;
  }
}

export function requirePermission(action: Action, resource: Resource) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(AppError.unauthorized('Authentication context missing'));
    }

    if (!can(req.auth, action, resource)) {
      return next(
        AppError.forbidden(`Role ${req.auth.role} is not permitted to ${action} on ${resource}`)
      );
    }

    next();
  };
}
