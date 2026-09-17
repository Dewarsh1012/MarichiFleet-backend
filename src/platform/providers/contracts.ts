import { z } from 'zod';

export type ProviderCapability =
  | 'tax-invoice'
  | 'e-invoice'
  | 'road-permit'
  | 'telematics'
  | 'payment'
  | 'messaging';

export type ProviderFailureStatus =
  | 'UNCONFIGURED'
  | 'UNSUPPORTED'
  | 'NOT_IMPLEMENTED'
  | 'INVALID_INPUT';

export interface ProviderFailure {
  ok: false;
  status: ProviderFailureStatus;
  providerId: string;
  retryable: false;
  error: {
    code: string;
    message: string;
    validationIssues?: Array<{ path: string; message: string }>;
  };
}

export interface ProviderSuccess<T> {
  ok: true;
  status: 'COMPLETED';
  providerId: string;
  externalReference: string;
  data: T;
}

export type ProviderResult<T> = ProviderSuccess<T> | ProviderFailure;

export interface ProviderConfiguration {
  providerId: string;
  capability: ProviderCapability;
  configured: boolean;
  operational: boolean;
  credentialNames: readonly string[];
}

export interface TaxInvoiceInput {
  tenantId: string;
  invoiceNumber: string;
  issueDate: string;
  currency: string;
  sellerTaxId: string;
  buyerTaxId?: string;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface TaxInvoiceReceipt {
  invoiceNumber: string;
  documentId: string;
}

export interface TaxInvoiceProvider {
  readonly configuration: ProviderConfiguration;
  issue(input: TaxInvoiceInput): Promise<ProviderResult<TaxInvoiceReceipt>>;
}

export interface EInvoiceInput extends TaxInvoiceInput {
  invoicePayload: Record<string, unknown>;
}

export interface EInvoiceReceipt {
  invoiceNumber: string;
  clearanceReference: string;
}

export interface EInvoiceProvider {
  readonly configuration: ProviderConfiguration;
  submit(input: EInvoiceInput): Promise<ProviderResult<EInvoiceReceipt>>;
}

export interface PermitInput {
  tenantId: string;
  vehicleRegistration: string;
  documentNumber: string;
  origin: string;
  destination: string;
  validFrom: string;
  validUntil: string;
}

export interface PermitReceipt {
  permitNumber: string;
  validUntil: string;
}

export interface PermitProvider {
  readonly configuration: ProviderConfiguration;
  apply(input: PermitInput): Promise<ProviderResult<PermitReceipt>>;
}

export interface TelematicsPositionInput {
  tenantId: string;
  vehicleId: string;
  deviceId: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
  speedKph?: number;
}

export interface TelematicsReceipt {
  acceptedAt: string;
}

export interface TelematicsProvider {
  readonly configuration: ProviderConfiguration;
  publishPosition(input: TelematicsPositionInput): Promise<ProviderResult<TelematicsReceipt>>;
}

export interface PaymentInput {
  tenantId: string;
  amount: number;
  currency: string;
  payerReference: string;
  idempotencyKey: string;
  description?: string;
}

export interface PaymentReceipt {
  transactionReference: string;
  state: 'SETTLED' | 'PENDING';
}

export interface PaymentRailProvider {
  readonly configuration: ProviderConfiguration;
  collect(input: PaymentInput): Promise<ProviderResult<PaymentReceipt>>;
}

export interface MessageInput {
  tenantId: string;
  recipient: string;
  channel: 'sms' | 'whatsapp' | 'email';
  body: string;
  idempotencyKey: string;
}

export interface MessageReceipt {
  messageReference: string;
}

export interface MessagingProvider {
  readonly configuration: ProviderConfiguration;
  send(input: MessageInput): Promise<ProviderResult<MessageReceipt>>;
}

const requiredText = z.string().trim().min(1).max(256);
const isoDate = z.string().datetime({ offset: true });
const currency = z.string().regex(/^[A-Z]{3}$/);

const taxInvoiceShape = {
  tenantId: requiredText,
  invoiceNumber: requiredText,
  issueDate: isoDate,
  currency,
  sellerTaxId: requiredText,
  buyerTaxId: requiredText.optional(),
  subtotal: z.number().nonnegative().finite(),
  taxAmount: z.number().nonnegative().finite(),
  total: z.number().nonnegative().finite(),
};

const validateInvoiceTotal = (
  value: { subtotal: number; taxAmount: number; total: number },
  context: z.RefinementCtx,
) => {
  const expected = value.subtotal + value.taxAmount;
  if (Math.abs(expected - value.total) > 0.01) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['total'],
      message: 'total must equal subtotal plus taxAmount',
    });
  }
};

export const taxInvoiceInputSchema = z
  .object(taxInvoiceShape)
  .strict()
  .superRefine(validateInvoiceTotal);

export const eInvoiceInputSchema = z
  .object({ ...taxInvoiceShape, invoicePayload: z.record(z.unknown()) })
  .strict()
  .superRefine(validateInvoiceTotal);

export const permitInputSchema = z
  .object({
    tenantId: requiredText,
    vehicleRegistration: requiredText,
    documentNumber: requiredText,
    origin: requiredText,
    destination: requiredText,
    validFrom: isoDate,
    validUntil: isoDate,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'validUntil must be after validFrom',
      });
    }
  });

export const telematicsPositionInputSchema = z
  .object({
    tenantId: requiredText,
    vehicleId: requiredText,
    deviceId: requiredText,
    capturedAt: isoDate,
    latitude: z.number().min(-90).max(90).finite(),
    longitude: z.number().min(-180).max(180).finite(),
    speedKph: z.number().nonnegative().max(400).finite().optional(),
  })
  .strict();

export const paymentInputSchema = z
  .object({
    tenantId: requiredText,
    amount: z.number().positive().finite(),
    currency,
    payerReference: requiredText,
    idempotencyKey: requiredText,
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const messageInputSchema = z
  .object({
    tenantId: requiredText,
    recipient: requiredText,
    channel: z.enum(['sms', 'whatsapp', 'email']),
    body: z.string().trim().min(1).max(4096),
    idempotencyKey: requiredText,
  })
  .strict();
