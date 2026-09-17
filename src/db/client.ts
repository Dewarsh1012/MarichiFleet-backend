import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../platform/logger.js';
import { bootstrap } from './seeds/mongoSeeder.js';

let isMongoConnected = false;
let activeMongoUri = '';
let mongoServerInstance: import('mongodb-memory-server').MongoMemoryServer | null = null;
mongoose.set('bufferCommands', false);

export function sanitizeMongoUri(rawUri: string): string {
  try {
    const protocolMatch = rawUri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/);
    if (!protocolMatch) return rawUri;
    const protocol = protocolMatch[1];
    const rest = protocolMatch[2];
    const lastAtIndex = rest.lastIndexOf('@');
    if (lastAtIndex === -1) return rawUri;
    const creds = rest.substring(0, lastAtIndex);
    const hostAndQuery = rest.substring(lastAtIndex + 1);
    const colonIndex = creds.indexOf(':');
    if (colonIndex === -1) return rawUri;
    const user = creds.substring(0, colonIndex);
    const pass = creds.substring(colonIndex + 1);
    const encodedUser = encodeURIComponent(decodeURIComponent(user));
    const encodedPass = encodeURIComponent(decodeURIComponent(pass));
    return `${protocol}${encodedUser}:${encodedPass}@${hostAndQuery}`;
  } catch {
    return rawUri;
  }
}

async function runBootstrapSafely(): Promise<void> {
  try {
    await bootstrap();
  } catch (err) {
    // Bootstrap failures must never crash the API; log and continue.
    logger.error({ err, msg: 'bootstrap: run failed (continuing)' });
  }
}

export async function initDatabase(): Promise<boolean> {
  if (env.MONGODB_URI) {
    const targetUri = sanitizeMongoUri(env.MONGODB_URI);
    try {
      await mongoose.connect(targetUri, {
        serverSelectionTimeoutMS: 5000,
      });
      isMongoConnected = true;
      activeMongoUri = targetUri;
      logger.info(' Connected to database at ' + targetUri.replace(/\/\/.*@/, '//***@'));
      await runBootstrapSafely();
      return true;
    } catch (error) {
      isMongoConnected = false;
      if (env.NODE_ENV === 'production') {
        throw new Error(`Database connection failed: ${(error as Error).message}`, { cause: error });
      }
      logger.warn(`Database connection failed (${(error as Error).message}); trying an in-memory development database`);
    }
  } else if (env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI is required in production');
  }

  // Development/test convenience only. Production always fails closed above.
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoServerInstance = await MongoMemoryServer.create();
    const memUri = mongoServerInstance.getUri();
    await mongoose.connect(memUri);
    isMongoConnected = true;
    activeMongoUri = memUri;
    logger.info(' In-memory database initialized and connected at ' + memUri);
    await runBootstrapSafely();
    return true;
  } catch (err) {
    logger.error({ err, msg: ' Failed to start in-memory database.' });
    isMongoConnected = false;
    return false;
  }
}

export function getDatabaseStatus() {
  return {
    isMongoConnected,
    mode: 'mongodb',
    uri: activeMongoUri ? activeMongoUri.replace(/\/\/.*@/, '//***@') : 'not-connected',
  };
}
