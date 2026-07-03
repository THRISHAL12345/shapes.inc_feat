import { describe, it, expect, beforeEach } from 'vitest';
import { NegotiationLLMService } from '../llmService';
import { InMemoryNegotiationRepository } from '../../../db/repository';

describe('NegotiationLLMService', () => {
  let llm: NegotiationLLMService;
  let repo: InMemoryNegotiationRepository;
  let sessionId: string;
  let pAId: string;
  let pBId: string;

  beforeEach(async () => {
    llm = new NegotiationLLMService('mock'); // enforce mock mode
    repo = new InMemoryNegotiationRepository();

    const session = await repo.createSession('Bill Split', { total: 100 });
    sessionId = session.id;

    const pA = await repo.createParticipant(sessionId, 'human-1', 'shape-1', 'initiator');
    const pB = await repo.createParticipant(sessionId, 'human-2', 'shape-2', 'counterparty');
    pAId = pA.id;
    pBId = pB.id;

    await repo.createPrivateConstraints(sessionId, pAId, { amount: 40 }, { amount: 60 }, { budget: 1 });
    await repo.createPrivateConstraints(sessionId, pBId, { amount: 40 }, { amount: 60 }, { budget: 1 });
  });

  it('should generate a negotiation turn cleanly', async () => {
    const turn = await llm.generateTurn(sessionId, pAId, repo);
    expect(turn.offer).toBeDefined();
    expect(turn.rationale).toContain('proposes');
    expect(turn.flag_impasse).toBe(false);
  });

  it('should detect bad-faith $0 asks in sanity check (§5.5)', async () => {
    const badRes = await llm.checkConstraintsSanity({ total: 100 }, { amount: 0 }, { amount: 50 });
    expect(badRes.valid).toBe(false);
    expect(badRes.reason).toContain('Bad-faith ask detected');

    const goodRes = await llm.checkConstraintsSanity({ total: 100 }, { amount: 40 }, { amount: 60 });
    expect(goodRes.valid).toBe(true);
  });
});
