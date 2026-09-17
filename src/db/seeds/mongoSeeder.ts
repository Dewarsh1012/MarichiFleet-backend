/**
 * Production bootstrap (NOT a demo seeder).
 *
 * On first boot this idempotently ensures:
 *   1. A single "platform" tenant (id from env.BOOTSTRAP_TENANT_ID) with sensible
 *      default currency/country settings.
 *   2. One Super Admin user (role "platform_admin") derived from
 *      SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD. Passwords are bcrypt-hashed and
 *      the account is created with mustResetPassword=true. An existing hash
 *      is NEVER overwritten.
 *   3. (Optional, FX_BOOTSTRAP=true) a base INR FX-rate row if none exists.
 *
 * All demo data (tenants, users, vehicles, trips, bookings, invoices, approvals,
 * WhatsApp messages, drivers, geofences, job cards, etc.) has been removed. This
 * module intentionally contains no product data.
 */
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { TenantModel, UserModel, FxRateModel } from '../models/index.js';
import { logger } from '../../platform/logger.js';
import { env } from '../../config/env.js';

const PASSWORD_HASH_ROUNDS = 12;

// Neutral FX baseline used only when FX_BOOTSTRAP=true AND no FX rows exist.
// This is configuration, not seed data — no tenant data is ever created.
const DEFAULT_INR_FX_RATES: Record<string, number> = {
  INR: 1,
  USD: 83.12,
  ZMW: 3.18,
  AED: 22.63,
  SAR: 22.16,
  EUR: 90.45,
  GBP: 105.2,
  KES: 0.64,
  TZS: 0.032,
  BHD: 220.5,
  OMR: 216,
  QAR: 22.83,
};

async function ensurePlatformTenant(): Promise<void> {
  const tenantId = env.BOOTSTRAP_TENANT_ID;
  const existing = await TenantModel.findOne({ id: tenantId }).lean();
  if (existing) {
    logger.info({ tenantId }, 'bootstrap: platform tenant already exists — skipping');
    return;
  }
  await TenantModel.create({
    id: tenantId,
    name: 'Platform',
    branches: [],
    settings: {
      country: 'India',
      baseCurrency: 'INR',
      displayCurrencies: ['INR', 'USD', 'AED', 'ZMW'],
      autoConvertReports: true,
    },
    status: 'ACTIVE',
  });
  logger.info({ tenantId }, 'bootstrap: created platform tenant');
}

async function ensureSuperAdmin(): Promise<void> {
  if (!env.SUPERADMIN_EMAIL || !env.SUPERADMIN_PASSWORD) {
    logger.warn(
      'bootstrap: SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD not set — skipping Super Admin creation. ' +
        'Set both to bootstrap the single Super Admin account.',
    );
    return;
  }

  const email = env.SUPERADMIN_EMAIL.toLowerCase().trim();
  const existing = await UserModel.findOne({ email }).select('userId email passwordHash role').lean() as any;
  if (existing) {
    // Idempotent: never rehash / overwrite an existing password.
    logger.info({ email, userId: existing.userId }, 'bootstrap: Super Admin already exists — leaving password untouched');
    return;
  }

  const passwordHash = await bcrypt.hash(env.SUPERADMIN_PASSWORD, PASSWORD_HASH_ROUNDS);
  await UserModel.create({
    userId: `usr_platform_${uuidv4().slice(0, 8)}`,
    email,
    username: email.split('@')[0],
    name: env.SUPERADMIN_NAME,
    role: 'platform_admin',
    tenantId: env.BOOTSTRAP_TENANT_ID,
    orgId: 'platform',
    branches: [],
    branchIds: [],
    permissions: ['*'],
    active: true,
    passwordHash,
    mustResetPassword: true,
    authProvider: 'local',
    status: 'ACTIVE',
  });
  logger.info({ email }, 'bootstrap: created Super Admin (mustResetPassword=true)');
}

async function ensureBaseFxRate(): Promise<void> {
  if (!env.FX_BOOTSTRAP) {
    logger.info('bootstrap: FX_BOOTSTRAP=false — skipping FX baseline');
    return;
  }
  const anyFx = await FxRateModel.findOne({}).select('_id').lean();
  if (anyFx) {
    logger.info('bootstrap: FX rates already present — skipping baseline');
    return;
  }
  await FxRateModel.create({
    base: 'INR',
    rates: DEFAULT_INR_FX_RATES,
    source: 'bootstrap',
    updatedAt: new Date(),
  });
  logger.info('bootstrap: inserted default INR FX baseline');
}

/**
 * Idempotent production bootstrap. Safe to call on every boot.
 */
export async function bootstrap(): Promise<void> {
  logger.info('bootstrap: starting');
  await ensurePlatformTenant();
  await ensureSuperAdmin();
  await ensureBaseFxRate();
  logger.info('bootstrap: finished');
}

/**
 * Backward-compatible export kept so callers importing the old name still
 * compile. It runs the production bootstrap, NOT the removed demo seeder.
 * The `options` parameter is accepted and ignored.
 */
export async function seedMongoDatabase(_options?: { force?: boolean }): Promise<void> {
  await bootstrap();
}

/**
 * Backward-compatible no-op export. The former demo platform sync has been removed.
 */
export async function syncPlatformSeed(_options?: { force?: boolean }): Promise<void> {
  await bootstrap();
}
