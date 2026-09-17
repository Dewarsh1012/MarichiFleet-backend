import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, isBcryptPasswordHash, verifyStoredPassword } from './auth.router.js';

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
