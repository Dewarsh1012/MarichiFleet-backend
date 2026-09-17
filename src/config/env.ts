import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromEnvironment = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const booleanFromEnvironmentWithDefault = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      return value === 'true' || value === '1';
    });

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default('0.0.0.0'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGIN: z.string().default('*'),
    JWT_SECRET: z.string().default('marichifleet-super-secret-jwt-key-change-in-production'),
    MONGODB_URI: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    SERVICE_NAME: z.string().default('core-api'),
    API_PREFIX: z.string().default('/api'),
    DEMO_MODE: booleanFromEnvironment,
    SEED_ON_BOOT: booleanFromEnvironment,
    // Super Admin bootstrap (single account, env-driven)
    SUPERADMIN_EMAIL: z.string().email().optional(),
    SUPERADMIN_PASSWORD: z.string().min(12).optional(),
    SUPERADMIN_NAME: z.string().default('Super Admin'),
    BOOTSTRAP_TENANT_ID: z.string().min(1).default('platform'),
    FX_BOOTSTRAP: booleanFromEnvironmentWithDefault(true),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_TENANT_ID: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_TENANT_MAP: z.string().optional(),
    WHATSAPP_TEMPLATE_DRIVER_OFFER: z.string().optional(),
    WHATSAPP_TEMPLATE_ETA_UPDATE: z.string().optional(),
    WHATSAPP_TEMPLATE_POD_REMINDER: z.string().optional(),
    WHATSAPP_TEMPLATE_APPROVAL: z.string().optional(),
    WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en'),
    TRACKING_TOKEN_SECRET: z.string().min(32).optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.DEMO_MODE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_MODE'],
        message: 'DEMO_MODE cannot be enabled in production',
      });
    }
    // Fail-closed: in production, if a super admin email is configured, a password must be too.
    if (
      value.NODE_ENV === 'production' &&
      value.SUPERADMIN_EMAIL &&
      !value.SUPERADMIN_PASSWORD
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPERADMIN_PASSWORD'],
        message:
          'SUPERADMIN_PASSWORD is required in production when SUPERADMIN_EMAIL is set. Refusing to boot without a bootstrap password.',
      });
    }
  });

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${JSON.stringify(parsed.error.format())}`);
  }
  return parsed.data;
}

export const env = parseEnvironment(process.env);
