import { describe, it, expect, beforeEach } from 'vitest';
import { NegotiationGuardrails } from '../index';

describe('NegotiationGuardrails (§6)', () => {
  let guardrails: NegotiationGuardrails;

  beforeEach(() => {
    guardrails = new NegotiationGuardrails();
    NegotiationGuardrails.resetTracker();
  });

  it('should allow valid v1 topics (bill-splitting, scheduling, budget agreement) (§6)', () => {
    expect(guardrails.checkScopeAllowlist('Split Uber Bill', { amount: 50 }).allowed).toBe(true);
    expect(guardrails.checkScopeAllowlist('Date night scheduling', { date: '2026-07-10' }).allowed).toBe(true);
    expect(guardrails.checkScopeAllowlist('Trip budget agreement', { limit: 1000 }).allowed).toBe(true);
  });

  it('should reject forbidden legal, lease, or fault dispute topics (§6)', () => {
    const res1 = guardrails.checkScopeAllowlist('Lease terms negotiation', { rent: 2000 });
    expect(res1.allowed).toBe(false);
    expect(res1.reason).toContain('legal/fault');

    const res2 = guardrails.checkScopeAllowlist('Car accident fault dispute', { damage: 500 });
    expect(res2.allowed).toBe(false);
    expect(res2.reason).toContain('legal/fault');

    const res3 = guardrails.checkScopeAllowlist('Contract breach claim', {});
    expect(res3.allowed).toBe(false);
    expect(res3.reason).toContain('legal/fault');
  });

  it('should enforce rate limits: max 3 active/recent sessions per user-pair per 7 days (§6)', async () => {
    const humanA = 'user-1';
    const humanB = 'user-2';

    expect((await guardrails.checkRateLimit(humanA, humanB)).allowed).toBe(true);
    await guardrails.recordSessionCreation(humanA, humanB);

    expect((await guardrails.checkRateLimit(humanA, humanB)).allowed).toBe(true);
    await guardrails.recordSessionCreation(humanA, humanB);

    expect((await guardrails.checkRateLimit(humanA, humanB)).allowed).toBe(true);
    await guardrails.recordSessionCreation(humanA, humanB);

    // 4th session attempt within 7 days MUST be blocked!
    const fourth = await guardrails.checkRateLimit(humanA, humanB);
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toContain('Rate limit exceeded');
  });

  it('should use Redis sorted sets for distributed rate limiting when redisClient is provided (§6)', async () => {
    let zaddCalled = false;
    let expireCalled = false;
    let zcardVal = 0;
    const mockRedis: any = {
      zremrangebyscore: async () => 0,
      zcard: async () => zcardVal,
      zadd: async () => { zaddCalled = true; return 1; },
      expire: async () => { expireCalled = true; return 1; },
    };

    guardrails.setRedisClient(mockRedis);
    expect((await guardrails.checkRateLimit('u-1', 'u-2')).allowed).toBe(true);
    
    await guardrails.recordSessionCreation('u-1', 'u-2');
    expect(zaddCalled).toBe(true);
    expect(expireCalled).toBe(true);

    zcardVal = 3;
    const res = await guardrails.checkRateLimit('u-1', 'u-2');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Rate limit exceeded');
  });
});
