import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEnvironment } from './env.js';

test('security-sensitive feature flags default to false', () => {
  const parsed = parseEnvironment({ NODE_ENV: 'test' });

  assert.equal(parsed.DEMO_MODE, false);
  assert.equal(parsed.SEED_ON_BOOT, false);
});

test('environment boolean flags require explicit supported values', () => {
  const parsed = parseEnvironment({ NODE_ENV: 'development', DEMO_MODE: '1', SEED_ON_BOOT: 'true' });

  assert.equal(parsed.DEMO_MODE, true);
  assert.equal(parsed.SEED_ON_BOOT, true);
  assert.throws(() => parseEnvironment({ NODE_ENV: 'test', DEMO_MODE: 'yes' }), /Invalid environment variables/);
});

test('production rejects demo mode', () => {
  assert.throws(
    () => parseEnvironment({ NODE_ENV: 'production', DEMO_MODE: 'true' }),
    /DEMO_MODE cannot be enabled in production/,
  );
});
