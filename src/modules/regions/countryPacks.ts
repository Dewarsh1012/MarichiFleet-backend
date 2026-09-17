import { z } from 'zod';
import {
  ProviderCapability,
  ProviderConfiguration,
} from '../../platform/providers/contracts.js';

export type CountryPackCode = 'IN' | 'GCC' | 'AE' | 'SA' | 'ZM';
export type CapabilityAvailability = 'SUPPORTED' | 'CONDITIONAL' | 'NOT_SUPPORTED';

export interface TaxIdentifierDefinition {
  code: string;
  label: string;
  requiredForTaxInvoice: boolean;
}

export interface ComplianceRequirement {
  code: string;
  label: string;
  mandatory: boolean;
  notes: string;
}

export interface CountryCapability {
  capability: ProviderCapability;
  availability: CapabilityAvailability;
  notes: string;
}

export interface CountryPack {
  code: CountryPackCode;
  countryName: string;
  region: 'INDIA' | 'GCC' | 'ZAMBIA';
  currency: {
    code: string;
    symbol: string;
    minorUnits: number;
  };
  taxIdentifiers: readonly TaxIdentifierDefinition[];
  documentLabels: Readonly<{
    taxInvoice: string;
    eInvoice: string;
    transportPermit: string;
  }>;
  complianceRequirements: readonly ComplianceRequirement[];
  capabilities: readonly CountryCapability[];
}

export interface CapabilityReportItem extends CountryCapability {
  configured: boolean;
  operational: boolean;
  providerId?: string;
  reason: string;
}

export interface TenantCountrySettings {
  settings?: {
    country?: unknown;
  };
}

export type CountryPackResolution =
  | { ok: true; pack: CountryPack }
  | {
      ok: false;
      status: 'INVALID_TENANT_COUNTRY' | 'UNSUPPORTED_COUNTRY';
      message: string;
      supportedCountryCodes: readonly CountryPackCode[];
    };

const capabilities = (
  overrides: Partial<Record<ProviderCapability, Omit<CountryCapability, 'capability'>>>,
): readonly CountryCapability[] => {
  const all: readonly ProviderCapability[] = [
    'tax-invoice',
    'e-invoice',
    'road-permit',
    'telematics',
    'payment',
    'messaging',
  ];
  return all.map((capability) => ({
    capability,
    availability: overrides[capability]?.availability ?? 'SUPPORTED',
    notes: overrides[capability]?.notes ?? 'Provider selection and credentials are required.',
  }));
};

const packs: Record<CountryPackCode, CountryPack> = {
  IN: {
    code: 'IN',
    countryName: 'India',
    region: 'INDIA',
    currency: { code: 'INR', symbol: '₹', minorUnits: 2 },
    taxIdentifiers: [
      { code: 'GSTIN', label: 'GST Identification Number', requiredForTaxInvoice: true },
      { code: 'PAN', label: 'Permanent Account Number', requiredForTaxInvoice: false },
    ],
    documentLabels: {
      taxInvoice: 'Tax Invoice',
      eInvoice: 'GST E-Invoice',
      transportPermit: 'E-Way Bill',
    },
    complianceRequirements: [
      {
        code: 'GST_TAX_INVOICE',
        label: 'GST tax invoice fields',
        mandatory: true,
        notes: 'Apply GST place-of-supply and tax-component rules.',
      },
      {
        code: 'GST_E_INVOICE',
        label: 'GST e-invoice/IRN',
        mandatory: false,
        notes: 'Mandatory only when the taxpayer and transaction fall within notified scope.',
      },
      {
        code: 'E_WAY_BILL',
        label: 'E-Way Bill',
        mandatory: false,
        notes: 'Required when statutory consignment and movement conditions are met.',
      },
      {
        code: 'AIS_140',
        label: 'AIS-140 vehicle tracking',
        mandatory: false,
        notes: 'Applicability depends on vehicle class and permit rules.',
      },
    ],
    capabilities: capabilities({
      'e-invoice': {
        availability: 'CONDITIONAL',
        notes: 'GST IRP eligibility and credentials must be established.',
      },
      'road-permit': {
        availability: 'CONDITIONAL',
        notes: 'E-Way Bill applicability is transaction-dependent.',
      },
      telematics: {
        availability: 'CONDITIONAL',
        notes: 'AIS-140 applicability depends on vehicle and permit category.',
      },
    }),
  },
  GCC: {
    code: 'GCC',
    countryName: 'GCC (member not specified)',
    region: 'GCC',
    currency: { code: 'USD', symbol: '$', minorUnits: 2 },
    taxIdentifiers: [],
    documentLabels: {
      taxInvoice: 'Tax Invoice',
      eInvoice: 'Electronic Tax Invoice',
      transportPermit: 'Road Transport Permit',
    },
    complianceRequirements: [
      {
        code: 'GCC_MEMBER_REQUIRED',
        label: 'GCC member country selection',
        mandatory: true,
        notes: 'Select UAE or Saudi Arabia before country-specific compliance operations.',
      },
    ],
    capabilities: capabilities({
      'tax-invoice': {
        availability: 'CONDITIONAL',
        notes: 'Blocked until a GCC member country is selected.',
      },
      'e-invoice': {
        availability: 'CONDITIONAL',
        notes: 'UAE and Saudi Arabia have materially different e-invoicing regimes.',
      },
      'road-permit': {
        availability: 'CONDITIONAL',
        notes: 'Permit rules depend on member country and route.',
      },
      telematics: {
        availability: 'CONDITIONAL',
        notes: 'Device and transport authority rules depend on member country.',
      },
      payment: {
        availability: 'CONDITIONAL',
        notes: 'Currency and payment rail depend on member country.',
      },
    }),
  },
  AE: {
    code: 'AE',
    countryName: 'United Arab Emirates',
    region: 'GCC',
    currency: { code: 'AED', symbol: 'د.إ', minorUnits: 2 },
    taxIdentifiers: [
      { code: 'TRN', label: 'Tax Registration Number', requiredForTaxInvoice: true },
    ],
    documentLabels: {
      taxInvoice: 'Tax Invoice',
      eInvoice: 'UAE Electronic Invoice',
      transportPermit: 'Commercial Transport Permit',
    },
    complianceRequirements: [
      {
        code: 'UAE_VAT_INVOICE',
        label: 'UAE VAT tax invoice',
        mandatory: true,
        notes: 'Use FTA tax invoice content and retention requirements.',
      },
      {
        code: 'UAE_E_INVOICING',
        label: 'UAE e-invoicing',
        mandatory: false,
        notes: 'Phased applicability must be evaluated against current UAE rules.',
      },
    ],
    capabilities: capabilities({
      'e-invoice': {
        availability: 'CONDITIONAL',
        notes: 'Phased UAE rollout; do not assume Saudi ZATCA integration compatibility.',
      },
      'road-permit': {
        availability: 'CONDITIONAL',
        notes: 'Emirate, vehicle activity, and route determine permit requirements.',
      },
    }),
  },
  SA: {
    code: 'SA',
    countryName: 'Saudi Arabia',
    region: 'GCC',
    currency: { code: 'SAR', symbol: '﷼', minorUnits: 2 },
    taxIdentifiers: [
      { code: 'VAT_NUMBER', label: 'VAT Registration Number', requiredForTaxInvoice: true },
    ],
    documentLabels: {
      taxInvoice: 'Tax Invoice',
      eInvoice: 'ZATCA E-Invoice (Fatoora)',
      transportPermit: 'Transport Activity Permit',
    },
    complianceRequirements: [
      {
        code: 'KSA_VAT_INVOICE',
        label: 'Saudi VAT invoice',
        mandatory: true,
        notes: 'Use ZATCA VAT invoice requirements.',
      },
      {
        code: 'ZATCA_FATOORA',
        label: 'ZATCA e-invoicing',
        mandatory: true,
        notes: 'Generation and integration phases apply; clearance/reporting mode varies.',
      },
    ],
    capabilities: capabilities({
      'e-invoice': {
        availability: 'SUPPORTED',
        notes: 'ZATCA-specific adapter and onboarding credentials are required.',
      },
      'road-permit': {
        availability: 'CONDITIONAL',
        notes: 'Transport authority licensing depends on activity and vehicle.',
      },
    }),
  },
  ZM: {
    code: 'ZM',
    countryName: 'Zambia',
    region: 'ZAMBIA',
    currency: { code: 'ZMW', symbol: 'K', minorUnits: 2 },
    taxIdentifiers: [
      { code: 'TPIN', label: 'Taxpayer Identification Number', requiredForTaxInvoice: true },
    ],
    documentLabels: {
      taxInvoice: 'Tax Invoice',
      eInvoice: 'ZRA Smart Invoice',
      transportPermit: 'Road Service Permit',
    },
    complianceRequirements: [
      {
        code: 'ZRA_TAX_INVOICE',
        label: 'ZRA tax invoice',
        mandatory: true,
        notes: 'Apply current Zambia Revenue Authority invoice requirements.',
      },
      {
        code: 'ZRA_SMART_INVOICE',
        label: 'ZRA Smart Invoice',
        mandatory: true,
        notes: 'Taxpayer applicability and approved integration must be confirmed.',
      },
      {
        code: 'RTSA_PERMIT',
        label: 'RTSA road service permit',
        mandatory: false,
        notes: 'Applicability depends on operator, vehicle, and service class.',
      },
    ],
    capabilities: capabilities({
      'e-invoice': {
        availability: 'SUPPORTED',
        notes: 'A ZRA-approved Smart Invoice integration is required.',
      },
      'road-permit': {
        availability: 'CONDITIONAL',
        notes: 'RTSA permit applicability depends on transport service class.',
      },
      telematics: {
        availability: 'SUPPORTED',
        notes: 'Generic GPS capability; AIS-140 is an India-specific standard.',
      },
    }),
  },
};

export const COUNTRY_PACKS: Readonly<Record<CountryPackCode, CountryPack>> =
  Object.freeze(packs);
export const SUPPORTED_COUNTRY_CODES: readonly CountryPackCode[] = Object.freeze([
  'IN',
  'GCC',
  'AE',
  'SA',
  'ZM',
]);

const countryAliases: Readonly<Record<string, CountryPackCode>> = Object.freeze({
  IN: 'IN',
  INDIA: 'IN',
  GCC: 'GCC',
  AE: 'AE',
  UAE: 'AE',
  'UNITED ARAB EMIRATES': 'AE',
  SA: 'SA',
  KSA: 'SA',
  SAUDI: 'SA',
  'SAUDI ARABIA': 'SA',
  ZM: 'ZM',
  ZAMBIA: 'ZM',
});

const tenantCountrySchema = z.string().trim().min(2).max(64);

export function resolveCountryPack(tenant: TenantCountrySettings): CountryPackResolution {
  const parsed = tenantCountrySchema.safeParse(tenant.settings?.country);
  if (!parsed.success) {
    return {
      ok: false,
      status: 'INVALID_TENANT_COUNTRY',
      message: 'Tenant settings.country must be configured before regional operations.',
      supportedCountryCodes: SUPPORTED_COUNTRY_CODES,
    };
  }

  const code = countryAliases[parsed.data.toUpperCase()];
  if (!code) {
    return {
      ok: false,
      status: 'UNSUPPORTED_COUNTRY',
      message: `No country pack is registered for "${parsed.data}".`,
      supportedCountryCodes: SUPPORTED_COUNTRY_CODES,
    };
  }

  return { ok: true, pack: COUNTRY_PACKS[code] };
}

export function reportCapabilities(
  pack: CountryPack,
  providerConfigurations: readonly ProviderConfiguration[] = [],
): readonly CapabilityReportItem[] {
  return pack.capabilities.map((countryCapability) => {
    const provider = providerConfigurations.find(
      (configuration) => configuration.capability === countryCapability.capability,
    );
    const available = countryCapability.availability !== 'NOT_SUPPORTED';
    const configured = available && Boolean(provider?.configured);
    const operational = configured && Boolean(provider?.operational);
    return {
      ...countryCapability,
      configured,
      operational,
      providerId: provider?.providerId,
      reason: !available
        ? countryCapability.notes
        : !provider
          ? 'No provider is registered for this capability.'
          : !provider.configured
            ? `Provider requires: ${provider.credentialNames.join(', ') || 'explicit configuration'}.`
            : !provider.operational
              ? 'Provider is configured but its external operation is not implemented.'
              : 'Provider is configured and operational.',
    };
  });
}
