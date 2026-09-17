import { z } from 'zod';
import {
  EInvoiceInput,
  EInvoiceProvider,
  EInvoiceReceipt,
  MessageInput,
  MessageReceipt,
  MessagingProvider,
  PaymentInput,
  PaymentRailProvider,
  PaymentReceipt,
  PermitInput,
  PermitProvider,
  PermitReceipt,
  ProviderCapability,
  ProviderConfiguration,
  ProviderFailure,
  ProviderResult,
  TaxInvoiceInput,
  TaxInvoiceProvider,
  TaxInvoiceReceipt,
  TelematicsPositionInput,
  TelematicsProvider,
  TelematicsReceipt,
  eInvoiceInputSchema,
  messageInputSchema,
  paymentInputSchema,
  permitInputSchema,
  taxInvoiceInputSchema,
  telematicsPositionInputSchema,
} from './contracts.js';

export interface FailClosedAdapterOptions {
  providerId: string;
  capability: ProviderCapability;
  requiredCredentialNames?: readonly string[];
  credentials?: Readonly<Record<string, string | undefined>>;
  supported?: boolean;
}

abstract class FailClosedAdapter {
  public readonly configuration: ProviderConfiguration;
  private readonly supported: boolean;

  protected constructor(options: FailClosedAdapterOptions) {
    const credentialNames = Object.freeze([...(options.requiredCredentialNames ?? [])]);
    const configured =
      credentialNames.length > 0 &&
      credentialNames.every((name) => Boolean(options.credentials?.[name]?.trim()));

    this.supported = options.supported ?? true;
    this.configuration = Object.freeze({
      providerId: options.providerId,
      capability: options.capability,
      configured,
      operational: false,
      credentialNames,
    });
  }

  protected reject<T>(schema: z.ZodTypeAny, input: unknown): ProviderResult<T> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        status: 'INVALID_INPUT',
        providerId: this.configuration.providerId,
        retryable: false,
        error: {
          code: 'PROVIDER_INPUT_INVALID',
          message: 'Provider request failed boundary validation.',
          validationIssues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
    }

    if (!this.supported) {
      return this.failure(
        'UNSUPPORTED',
        'CAPABILITY_NOT_SUPPORTED',
        `${this.configuration.capability} is not supported by this provider.`,
      );
    }

    if (!this.configuration.configured) {
      return this.failure(
        'UNCONFIGURED',
        'PROVIDER_NOT_CONFIGURED',
        `${this.configuration.providerId} requires configured credentials.`,
      );
    }

    return this.failure(
      'NOT_IMPLEMENTED',
      'EXTERNAL_OPERATION_NOT_IMPLEMENTED',
      `${this.configuration.providerId} is configured but its external operation is not implemented.`,
    );
  }

  private failure(
    status: ProviderFailure['status'],
    code: string,
    message: string,
  ): ProviderFailure {
    return {
      ok: false,
      status,
      providerId: this.configuration.providerId,
      retryable: false,
      error: { code, message },
    };
  }
}

export class FailClosedTaxInvoiceAdapter
  extends FailClosedAdapter
  implements TaxInvoiceProvider
{
  constructor(options: Omit<FailClosedAdapterOptions, 'capability'>) {
    super({ ...options, capability: 'tax-invoice' });
  }

  async issue(input: TaxInvoiceInput): Promise<ProviderResult<TaxInvoiceReceipt>> {
    return this.reject(taxInvoiceInputSchema, input);
  }
}

export class FailClosedEInvoiceAdapter extends FailClosedAdapter implements EInvoiceProvider {
  constructor(options: Omit<FailClosedAdapterOptions, 'capability'>) {
    super({ ...options, capability: 'e-invoice' });
  }

  async submit(input: EInvoiceInput): Promise<ProviderResult<EInvoiceReceipt>> {
    return this.reject(eInvoiceInputSchema, input);
  }
}

export class FailClosedPermitAdapter extends FailClosedAdapter implements PermitProvider {
  constructor(options: Omit<FailClosedAdapterOptions, 'capability'>) {
    super({ ...options, capability: 'road-permit' });
  }

  async apply(input: PermitInput): Promise<ProviderResult<PermitReceipt>> {
    return this.reject(permitInputSchema, input);
  }
}

export class FailClosedTelematicsAdapter
  extends FailClosedAdapter
  implements TelematicsProvider
{
  constructor(options: Omit<FailClosedAdapterOptions, 'capability'>) {
    super({ ...options, capability: 'telematics' });
  }

  async publishPosition(
    input: TelematicsPositionInput,
  ): Promise<ProviderResult<TelematicsReceipt>> {
    return this.reject(telematicsPositionInputSchema, input);
  }
}

export class FailClosedPaymentRailAdapter
  extends FailClosedAdapter
  implements PaymentRailProvider
{
  constructor(options: Omit<FailClosedAdapterOptions, 'capability'>) {
    super({ ...options, capability: 'payment' });
  }

  async collect(input: PaymentInput): Promise<ProviderResult<PaymentReceipt>> {
    return this.reject(paymentInputSchema, input);
  }
}

export class FailClosedMessagingAdapter extends FailClosedAdapter implements MessagingProvider {
  constructor(options: Omit<FailClosedAdapterOptions, 'capability'>) {
    super({ ...options, capability: 'messaging' });
  }

  async send(input: MessageInput): Promise<ProviderResult<MessageReceipt>> {
    return this.reject(messageInputSchema, input);
  }
}
