import { initDatabase } from '../client.js';
import { logger } from '../../platform/logger.js';

async function main() {
  logger.info('🚀 Starting MarichiFleet Database Seeder...');
  const success = await initDatabase();
  if (success) {
    logger.info('✅ Database seeded and ready.');
    process.exit(0);
  } else {
    logger.error('❌ Failed to initialize and seed database.');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err, msg: 'Fatal error in seeder' });
  process.exit(1);
});
