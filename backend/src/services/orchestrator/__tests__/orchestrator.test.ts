import { describe, it, expect, beforeEach } from 'vitest';
import { NegotiationOrchestrator } from '../index';
import { InMemoryNegotiationRepository } from '../../../db';
import { NegotiationLLMService } from '../../llm';
import { InMemoryTurnLock } from '../../lock';
import { NegotiationNotifyService } from '../../notify';

describe('NegotiationOrchestrator (§3, §5.1, §5.3)', () => {
  let repo: InMemoryNegotiationRepository;
  let llm: NegotiationLLMService;
  let lock: InMemoryTurnLock;
  let notify: NegotiationNotifyService;
  let orchestrator: NegotiationOrchestrator;

  beforeEach(() => {
    repo = new InMemoryNegotiationRepository();
    llm = new NegotiationLLMService('mock');
    lock = new InMemoryTurnLock();
    notify = new NegotiationNotifyService();
    orchestrator = new NegotiationOrchestrator(repo, llm, lock, notify);
  });

  it('should initiate session and transition through consent to active (§3.1, §3.2)', async () => {
    const session = await orchestrator.initiateSession({
      topic: 'Split Uber Bill',
      sharedFacts: { amount: 40 },
      initiatorHumanId: 'human-A',
      initiatorShapeId: 'shape-A',
      initiatorFloor: { amount: 15 },
      initiatorCeiling: { amount: 25 },
      initiatorPriorities: { fairness: 1 },
      counterpartyHumanId: 'human-B',
      counterpartyShapeId: 'shape-B',
    });

    expect(session.status).toBe('pending_consent');
    expect(notify.getSentConsentCards()).toHaveLength(1);

    const participants = await repo.getParticipantsBySession(session.id);
    const counterparty = participants.find(p => p.role === 'counterparty');
    expect(counterparty).toBeDefined();

    const activeSession = await orchestrator.respondToConsent({
      sessionId: session.id,
      participantId: counterparty!.id,
      accept: true,
      floor: { amount: 15 },
      ceiling: { amount: 25 },
      priorities: { fairness: 1 },
    });

    expect(activeSession.status).toBe('active');
  });

  it('should expire session when consent is declined plainly without guilt-tripping (§3.2)', async () => {
    const session = await orchestrator.initiateSession({
      topic: 'Date night scheduling',
      sharedFacts: { date: '2026-07-10' },
      initiatorHumanId: 'human-A',
      initiatorShapeId: 'shape-A',
      initiatorFloor: { time: '18:00' },
      initiatorCeiling: { time: '21:00' },
      initiatorPriorities: { schedule: 1 },
      counterpartyHumanId: 'human-B',
      counterpartyShapeId: 'shape-B',
    });

    const participants = await repo.getParticipantsBySession(session.id);
    const counterparty = participants.find(p => p.role === 'counterparty');

    const expiredSession = await orchestrator.respondToConsent({
      sessionId: session.id,
      participantId: counterparty!.id,
      accept: false,
    });

    expect(expiredSession.status).toBe('expired');
    const notifyCards = notify.getSentResolutionCards();
    expect(notifyCards).toHaveLength(1);
    expect(notifyCards[0].outcome).toBe('expired');
    expect(notifyCards[0].divergenceNotes).toContain('declined');
  });

  it('should enforce strict server turn alternation and converge in loop (§3.3, §5.3)', async () => {
    const session = await orchestrator.initiateSession({
      topic: 'Trip Budget Agreement',
      sharedFacts: { total: 120 },
      initiatorHumanId: 'human-A',
      initiatorShapeId: 'shape-A',
      initiatorFloor: { amount: 50 },
      initiatorCeiling: { amount: 70 },
      initiatorPriorities: { cost: 1 },
      counterpartyHumanId: 'human-B',
      counterpartyShapeId: 'shape-B',
    });

    const participants = await repo.getParticipantsBySession(session.id);
    const counterparty = participants.find(p => p.role === 'counterparty');
    await orchestrator.respondToConsent({
      sessionId: session.id,
      participantId: counterparty!.id,
      accept: true,
      floor: { amount: 50 },
      ceiling: { amount: 70 },
      priorities: { cost: 1 },
    });

    // Execute turns in strict alternating order
    const t1 = await orchestrator.executeNextTurn(session.id);
    expect(t1.turn.turn_number).toBe(1);
    expect(t1.sessionStatus).toBe('active');

    const t2 = await orchestrator.executeNextTurn(session.id);
    expect(t2.turn.turn_number).toBe(2);

    const t3 = await orchestrator.executeNextTurn(session.id);
    expect(t3.turn.turn_number).toBe(3);
    expect(t3.sessionStatus).toBe('converged');
    expect(t3.resolution).toBeDefined();
    expect(t3.resolution?.outcome).toBe('converged');
  });

  it('should reject out-of-order/concurrent turn attempts via turn lock (§5.3)', async () => {
    const session = await orchestrator.initiateSession({
      topic: 'Lock test',
      sharedFacts: {},
      initiatorHumanId: 'h-1',
      initiatorShapeId: 's-1',
      initiatorFloor: {},
      initiatorCeiling: {},
      initiatorPriorities: {},
      counterpartyHumanId: 'h-2',
      counterpartyShapeId: 's-2',
    });

    const participants = await repo.getParticipantsBySession(session.id);
    const counterparty = participants.find(p => p.role === 'counterparty');
    await orchestrator.respondToConsent({
      sessionId: session.id,
      participantId: counterparty!.id,
      accept: true,
      floor: {},
      ceiling: {},
      priorities: {},
    });

    // Manually acquire lock to simulate concurrent execution
    await lock.acquire(session.id);

    await expect(orchestrator.executeNextTurn(session.id)).rejects.toThrow(
      /Turn currently in progress/
    );
  });

  it('should support lock TTL extension via extend() method (§5.3)', async () => {
    const sessionId = 'test-extend-session';
    await lock.acquire(sessionId, 500);
    expect(await lock.isLocked(sessionId)).toBe(true);

    const extended = await lock.extend(sessionId, 5000);
    expect(extended).toBe(true);
    expect(await lock.isLocked(sessionId)).toBe(true);

    await lock.release(sessionId);
    expect(await lock.isLocked(sessionId)).toBe(false);
  });

  it('should persist human resolution outcomes in the repository (§3.4)', async () => {
    const session = await repo.createSession('Budget Split', { amount: 1000 });
    const res = await orchestrator.handleHumanResolution(session.id, 'human-42', 'counter', { amount: 600 });

    expect(res.status).toBe('recorded');
    const resolutions = await repo.getHumanResolutionsBySession(session.id);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].human_id).toBe('human-42');
    expect(resolutions[0].action).toBe('counter');
    expect(resolutions[0].counter_offer).toEqual({ amount: 600 });
  });

  it('should use dynamic proportional convergence tolerance based on 5% of deal size (§3.3, §8)', async () => {
    // For a deal size of $400, 5% tolerance is $20.
    // In mock LLM: turn 1 initiator proposes $50. Turn 2 counterparty proposes $65 (70 - 5 = $65).
    // The gap is |65 - 50| = $15. Since $15 <= $20 tolerance, it should converge on turn 2!
    const session = await orchestrator.initiateSession({
      topic: 'High Value Contract Agreement',
      sharedFacts: { total: 400 },
      initiatorHumanId: 'human-X',
      initiatorShapeId: 'shape-X',
      initiatorFloor: { amount: 40 },
      initiatorCeiling: { amount: 80 },
      initiatorPriorities: { value: 1 },
      counterpartyHumanId: 'human-Y',
      counterpartyShapeId: 'shape-Y',
    });

    const participants = await repo.getParticipantsBySession(session.id);
    const counterparty = participants.find(p => p.role === 'counterparty');
    await orchestrator.respondToConsent({
      sessionId: session.id,
      participantId: counterparty!.id,
      accept: true,
      floor: { amount: 40 },
      ceiling: { amount: 80 },
      priorities: { value: 1 },
    });

    const t1 = await orchestrator.executeNextTurn(session.id);
    expect(t1.sessionStatus).toBe('active');

    const t2 = await orchestrator.executeNextTurn(session.id);
    expect(t2.sessionStatus).toBe('converged');
    expect(t2.resolution?.outcome).toBe('converged');
  });
});
