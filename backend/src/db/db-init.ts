import pg from 'pg';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { INegotiationRepository } from './repository';
import { PostgresNegotiationRepository } from './pg-repository';
import { InMemoryNegotiationRepository } from './repository';
import { ITurnLock, RedisTurnLock, InMemoryTurnLock } from '../services/lock';
import { defaultGuardrails } from '../services/guardrails';
import { defaultOrchestrator } from '../services/orchestrator';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StorageEngines {
  repository: INegotiationRepository;
  turnLock: ITurnLock;
  redisClient: Redis | null;
  pgPool: pg.Pool | null;
}

/**
 * Initializes Postgres and Redis connections if configured and available.
 * Automatically executes schema.sql for Postgres.
 * Seamlessly falls back to in-memory repositories and locks if services are unavailable or not configured.
 */
export async function initializeStorage(): Promise<StorageEngines> {
  let repository: INegotiationRepository = new InMemoryNegotiationRepository();
  let turnLock: ITurnLock = new InMemoryTurnLock();
  let redisClient: Redis | null = null;
  let pgPool: pg.Pool | null = null;

  // 1. Initialize Postgres
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      console.log(`[db] Attempting connection to Postgres (${dbUrl.split('@')[1] || 'localhost'})...`);
      const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });
      await pool.query('SELECT 1');
      
      // Execute schema migrations automatically
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        await pool.query(schemaSql);
        console.log('[db] Connected to Postgres and verified schema tables.');
      } else {
        console.log('[db] Connected to Postgres (schema.sql not found at path, skipping auto-migration).');
      }

      pgPool = pool;
      repository = new PostgresNegotiationRepository(pool);
      defaultOrchestrator.setRepository(repository);
    } catch (err: any) {
      console.warn(`[db] Notice: Postgres connection failed (${err.message}). Using InMemoryNegotiationRepository fallback.`);
      repository = new InMemoryNegotiationRepository();
      defaultOrchestrator.setRepository(repository);
    }
  } else {
    console.log('[db] No DATABASE_URL provided. Using InMemoryNegotiationRepository.');
  }

  // 2. Initialize Redis
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      console.log(`[lock] Attempting connection to Redis (${redisUrl})...`);
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times > 2 ? null : 200),
      });

      await client.ping();
      console.log('[lock] Connected to Redis. Enabling RedisTurnLock and Redis rate limiter.');
      
      redisClient = client;
      turnLock = new RedisTurnLock(client);
      defaultOrchestrator.setLock(turnLock);
      defaultGuardrails.setRedisClient(client);
    } catch (err: any) {
      console.warn(`[lock] Notice: Redis connection failed (${err.message}). Using InMemoryTurnLock and in-memory rate limit fallback.`);
      turnLock = new InMemoryTurnLock();
      defaultOrchestrator.setLock(turnLock);
      defaultGuardrails.setRedisClient(null as any);
    }
  } else {
    console.log('[lock] No REDIS_URL provided. Using InMemoryTurnLock and in-memory rate limiter.');
  }

  return { repository, turnLock, redisClient, pgPool };
}
