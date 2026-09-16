import { Request } from 'express';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'BRANCH_MANAGER'
  | 'OPERATIONS_MANAGER'
  | 'BOOKING_OPERATOR'
  | 'DISPATCHER'
  | 'TRACKING_EXECUTIVE'
  | 'FINANCE_EXECUTIVE'
  | 'CUSTOMER_SUPPORT'
  | 'DRIVER'
  | 'CONSIGNOR_USER'
  | 'CONSIGNEE_USER'
  | 'CUSTOMER_USER'
  | 'AUDITOR'
  // Legacy / existing compatibility aliases:
  | 'FLEET_OWNER'
  | 'CONTROL_TOWER_LEAD'
  | 'LOGISTICS_MANAGER'
  | 'FINANCE_CONTROLLER'
  | 'BILLING_EXECUTIVE'
  | 'ACCOUNTS_PAYABLE'
  | 'SAFETY_OFFICER'
  | 'BROKER'
  | 'VENDOR'
  | 'CONSIGNOR_ADMIN';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  orgId: string;
  role: UserRole;
  branches: string[];
  permissions: string[];
  consignorId?: string;
  consigneeId?: string;
  mustResetPassword?: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  requestId?: string;
  idempotencyKey?: string;
}
