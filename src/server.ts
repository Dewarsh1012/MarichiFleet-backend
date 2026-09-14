import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './platform/logger.js';
import { initDatabase } from './db/client.js';

async function bootstrap() {
  // Initialize Database connection (or fallback)
  await initDatabase();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`🚀 MarichiFleet Core API listening on ${env.HOST}:${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`📡 Healthcheck available at: http://${env.HOST}:${env.PORT}/healthz`);
    logger.info(`📦 API root mounted at: http://${env.HOST}:${env.PORT}${env.API_PREFIX}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`❌ Port ${env.PORT} is already in use by another process. Please free port ${env.PORT} or stop the competing process.`);
      process.exit(1);
    }
    logger.error({ err, msg: 'Server listen error' });
    process.exit(1);
  });

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err, msg: 'Fatal error during server bootstrap' });
  process.exit(1);
});
