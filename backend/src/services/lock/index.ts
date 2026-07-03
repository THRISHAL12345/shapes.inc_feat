import Redis from 'ioredis';

export interface ITurnLock {
  acquire(sessionId: string, ttlMs?: number): Promise<boolean>;
  release(sessionId: string): Promise<void>;
  isLocked(sessionId: string): Promise<boolean>;
}

export class InMemoryTurnLock implements ITurnLock {
  private locks: Set<string> = new Set();

  async acquire(sessionId: string, ttlMs = 10000): Promise<boolean> {
    if (this.locks.has(sessionId)) {
      return false;
    }
    this.locks.add(sessionId);
    if (ttlMs > 0) {
      setTimeout(() => {
        this.locks.delete(sessionId);
      }, ttlMs);
    }
    return true;
  }

  async release(sessionId: string): Promise<void> {
    this.locks.delete(sessionId);
  }

  async isLocked(sessionId: string): Promise<boolean> {
    return this.locks.has(sessionId);
  }
}

export class RedisTurnLock implements ITurnLock {
  private redis: Redis;
  private prefix = 'negotiate:lock:session:';

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  async acquire(sessionId: string, ttlMs = 10000): Promise<boolean> {
    const key = `${this.prefix}${sessionId}`;
    // SET key value NX PX ttlMs
    const res = await this.redis.set(key, 'locked', 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  async release(sessionId: string): Promise<void> {
    const key = `${this.prefix}${sessionId}`;
    await this.redis.del(key);
  }

  async isLocked(sessionId: string): Promise<boolean> {
    const key = `${this.prefix}${sessionId}`;
    const exists = await this.redis.exists(key);
    return exists > 0;
  }
}

export const defaultTurnLock: ITurnLock = new InMemoryTurnLock();
