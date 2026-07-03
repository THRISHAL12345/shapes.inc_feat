import Redis from 'ioredis';

export interface ITurnLock {
  acquire(sessionId: string, ttlMs?: number): Promise<boolean>;
  release(sessionId: string): Promise<void>;
  isLocked(sessionId: string): Promise<boolean>;
  extend(sessionId: string, ttlMs?: number): Promise<boolean>;
}

export class InMemoryTurnLock implements ITurnLock {
  private locks: Set<string> = new Set();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  async acquire(sessionId: string, ttlMs = 60000): Promise<boolean> {
    if (this.locks.has(sessionId)) {
      return false;
    }
    this.locks.add(sessionId);
    if (ttlMs > 0) {
      const timer = setTimeout(() => {
        this.locks.delete(sessionId);
        this.timers.delete(sessionId);
      }, ttlMs);
      this.timers.set(sessionId, timer);
    }
    return true;
  }

  async release(sessionId: string): Promise<void> {
    this.locks.delete(sessionId);
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
  }

  async isLocked(sessionId: string): Promise<boolean> {
    return this.locks.has(sessionId);
  }

  async extend(sessionId: string, ttlMs = 60000): Promise<boolean> {
    if (!this.locks.has(sessionId)) {
      return false;
    }
    const oldTimer = this.timers.get(sessionId);
    if (oldTimer) {
      clearTimeout(oldTimer);
    }
    if (ttlMs > 0) {
      const timer = setTimeout(() => {
        this.locks.delete(sessionId);
        this.timers.delete(sessionId);
      }, ttlMs);
      this.timers.set(sessionId, timer);
    }
    return true;
  }
}

export class RedisTurnLock implements ITurnLock {
  private redis: Redis;
  private prefix = 'negotiate:lock:session:';

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  async acquire(sessionId: string, ttlMs = 60000): Promise<boolean> {
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

  async extend(sessionId: string, ttlMs = 60000): Promise<boolean> {
    const key = `${this.prefix}${sessionId}`;
    const res = await this.redis.pexpire(key, ttlMs);
    return res === 1;
  }
}

export const defaultTurnLock: ITurnLock = new InMemoryTurnLock();
