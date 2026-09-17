/**
 * Standalone seed runner — loads .env, connects to MONGODB_URI, syncs platform data.
 * Usage: npm run seed
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { sanitizeMongoUri } from '../client.js';
import { seedMongoDatabase } from './mongoSeeder.js';
import { logger } from '../../platform/logger.js';

async function main() {
  if (!env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to .env and retry.');
    process.exit(1);
  }

  try {
    const uri = sanitizeMongoUri(env.MONGODB_URI);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    logger.info('Connected for seed run');

    await seedMongoDatabase({ force: true });

    logger.info('Seed run finished successfully');
  } catch (err) {
    logger.error({ err, msg: 'Seed run failed' });
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

void main();
