import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, isBcryptPasswordHash, verifyStoredPassword } from './auth.router.js';
import { parseEnvironment } from '../../config/env.js';

test('passwords are hashed and verified with bcrypt', async () => {
  const hash = await hashPassword('StrongDemoPassword!');

  assert.equal(isBcryptPasswordHash(hash), true);
  assert.notEqual(hash, 'StrongDemoPassword!');
  assert.deepEqual(await verifyStoredPassword(hash, 'StrongDemoPassword!', false), { valid: true });
  assert.deepEqual(await verifyStoredPassword(hash, 'wrong-password', false), { valid: false });
});

test('plaintext passwords are never accepted when legacy migration is disabled', async () => {
  assert.deepEqual(await verifyStoredPassword('demo123', 'demo123', false), { valid: false });
});

test('known plaintext credentials can be upgraded only on an explicit legacy path', async () => {
  const result = await verifyStoredPassword('demo123', 'demo123', true);

  assert.equal(result.valid, true);
  assert.ok(result.upgradedHash);
  assert.equal(isBcryptPasswordHash(result.upgradedHash), true);
});

test('production refuses to boot when SUPERADMIN_EMAIL is set without SUPERADMIN_PASSWORD', () => {
  assert.throws(
    () =>
      parseEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://localhost/x',
        SUPERADMIN_EMAIL: 'admin@example.com',
      }),
    /SUPERADMIN_PASSWORD is required in production/,
  );
});

test('SUPERADMIN_PASSWORD must be at least 12 characters', () => {
  assert.throws(
    () =>
      parseEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://localhost/x',
        SUPERADMIN_EMAIL: 'admin@example.com',
        SUPERADMIN_PASSWORD: 'short',
      }),
    /Invalid environment variables/,
  );
});

test('FX_BOOTSTRAP defaults to true and can be toggled off', () => {
  const on = parseEnvironment({ NODE_ENV: 'development' });
  assert.equal(on.FX_BOOTSTRAP, true);
  const off = parseEnvironment({ NODE_ENV: 'development', FX_BOOTSTRAP: 'false' });
  assert.equal(off.FX_BOOTSTRAP, false);
});

test('BOOTSTRAP_TENANT_ID defaults to "platform"', () => {
  const parsed = parseEnvironment({ NODE_ENV: 'development' });
  assert.equal(parsed.BOOTSTRAP_TENANT_ID, 'platform');
});
