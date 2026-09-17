import { CountryPack } from '../../modules/regions/countryPacks.js';
import {
  EInvoiceProvider,
  MessagingProvider,
  PaymentRailProvider,
  PermitProvider,
  ProviderConfiguration,
  TaxInvoiceProvider,
  TelematicsProvider,
} from './contracts.js';
import {
  FailClosedEInvoiceAdapter,
  FailClosedMessagingAdapter,
  FailClosedPaymentRailAdapter,
  FailClosedPermitAdapter,
  FailClosedTaxInvoiceAdapter,
  FailClosedTelematicsAdapter,
} from './failClosedAdapters.js';

export interface CountryProviderSet {
  taxInvoice: TaxInvoiceProvider;
  eInvoice: EInvoiceProvider;
  permit: PermitProvider;
  telematics: TelematicsProvider;
  payment: PaymentRailProvider;
  messaging: MessagingProvider;
  configurations: readonly ProviderConfiguration[];
}

export type ProviderCredentials = Readonly<Record<string, string | undefined>>;

const credentialPrefixByCountry: Readonly<Record<CountryPack['code'], string>> = {
  IN: 'INDIA',
  GCC: 'GCC',
  AE: 'UAE',
  SA: 'SAUDI',
  ZM: 'ZAMBIA',
};

/**
 * Creates fail-closed country adapters. Credentials are checked but never retained or used
 * for network calls. Replace each adapter explicitly during final provider integration.
 */
export function createCountryProviderSet(
  pack: CountryPack,
  credentials: ProviderCredentials = {},
): CountryProviderSet {
  const prefix = credentialPrefixByCountry[pack.code];
  const memberSelected = pack.code !== 'GCC';
  const options = (
    suffix: string,
    credentialNames: readonly string[],
    supported = memberSelected,
  ) => ({
    providerId: `${pack.code.toLowerCase()}-${suffix}`,
    requiredCredentialNames: credentialNames,
    credentials,
    supported,
  });

  const taxInvoice = new FailClosedTaxInvoiceAdapter(
    options('tax-invoice', [`${prefix}_TAX_PROVIDER_API_KEY`]),
  );
  const eInvoice = new FailClosedEInvoiceAdapter(
    options('e-invoice', [`${prefix}_EINVOICE_API_KEY`, `${prefix}_EINVOICE_TENANT_ID`]),
  );
  const permit = new FailClosedPermitAdapter(
    options('permit', [`${prefix}_PERMIT_API_KEY`]),
  );
  const telematics = new FailClosedTelematicsAdapter(
    options('telematics', [`${prefix}_TELEMATICS_API_KEY`]),
  );
  const payment = new FailClosedPaymentRailAdapter(
    options('payment', [`${prefix}_PAYMENT_API_KEY`]),
  );
  const messaging = new FailClosedMessagingAdapter(
    options('messaging', [`${prefix}_MESSAGING_API_KEY`], true),
  );

  return {
    taxInvoice,
    eInvoice,
    permit,
    telematics,
    payment,
    messaging,
    configurations: Object.freeze([
      taxInvoice.configuration,
      eInvoice.configuration,
      permit.configuration,
      telematics.configuration,
      payment.configuration,
      messaging.configuration,
    ]),
  };
}
