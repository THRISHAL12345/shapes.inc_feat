import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { createNegotiationRouter } from '../../api/routes';
import { InMemoryNegotiationRepository } from '../../db/repository';
import { NegotiationOrchestrator } from '../../services/orchestrator';
import { NegotiationLLMService } from '../../services/llm/llmService';
import { InMemoryTurnLock } from '../../services/lock';
import { NegotiationNotifyService } from '../../services/notify';
import { NegotiationGuardrails } from '../../services/guardrails';

describe('E2E Negotiation Test Suite (§9.8, §10 Definition of Done)', () => {
  let app: express.Express;
  let repo: InMemoryNegotiationRepository;
  let orchestrator: NegotiationOrchestrator;

  beforeEach(() => {
    NegotiationGuardrails.resetTracker();
    repo = new InMemoryNegotiationRepository();
    const llm = new NegotiationLLMService('mock');
    const lock = new InMemoryTurnLock();
    const notify = new NegotiationNotifyService();
    const guardrails = new NegotiationGuardrails(repo);
    orchestrator = new NegotiationOrchestrator(repo, llm, lock, notify);

    app = express();
    app.use(bodyParser.json());
    app.use('/api/negotiate', createNegotiationRouter(orchestrator, repo, guardrails, notify));
  });

  it('1. Full happy path to convergence with two fixture users (§9.8)', async () => {
    // A. User A initiates session
    const initRes = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Split Trip Uber Bill',
        sharedFacts: { amount: 100, currency: '$' },
        initiatorHumanId: 'human-nova',
        initiatorShapeId: 'shape-nova',
        initiatorFloor: { amount: 30, currency: '$' },
        initiatorCeiling: { amount: 50, currency: '$' },
        initiatorPriorities: { fairness: 1 },
        counterpartyHumanId: 'human-atlas',
        counterpartyShapeId: 'shape-atlas',
      });

    expect(initRes.status).toBe(201);
    expect(initRes.body.status).toBe('pending_consent');
    const sessionId = initRes.body.id;
    const initiator = initRes.body.participants.find((p: any) => p.role === 'initiator');
    const counterparty = initRes.body.participants.find((p: any) => p.role === 'counterparty');

    // Verify DTO does not leak private constraints (§4, §8)
    expect(initRes.body.initiatorFloor).toBeUndefined();
    expect(initRes.body.private_constraints).toBeUndefined();
    expect((counterparty as any).floor_value).toBeUndefined();

    // B. Counterparty Shape Atlas accepts consent with private constraints (§3.2)
    const consentRes = await request(app)
      .post(`/api/negotiate/sessions/${sessionId}/consent`)
      .send({
        participantId: counterparty.id,
        accept: true,
        floor: { amount: 40, currency: '$' },
        ceiling: { amount: 60, currency: '$' },
        priorities: { fairness: 1 },
      });

    expect(consentRes.status).toBe(200);
    expect(consentRes.body.status).toBe('active');

    // C. Execute alternating turns in negotiation loop (§3.3, §5.3)
    // Turn 1 (Initiator)
    const turn1Res = await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    expect(turn1Res.status).toBe(200);
    expect(turn1Res.body.turn.turn_number).toBe(1);
    expect(turn1Res.body.turn.participant_id).toBe(initiator.id);

    // Turn 2 (Counterparty)
    const turn2Res = await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.turn.turn_number).toBe(2);
    expect(turn2Res.body.turn.participant_id).toBe(counterparty.id);

    // Turn 3 (Initiator -> closes gap to $5 within tolerance band, triggering convergence per §3.3)
    const turn3Res = await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    expect(turn3Res.status).toBe(200);
    expect(turn3Res.body.turn.turn_number).toBe(3);
    expect(turn3Res.body.sessionStatus).toBe('converged');
    expect(turn3Res.body.resolution).toBeDefined();
    expect(turn3Res.body.resolution.outcome).toBe('converged');

    // D. Verify public GET endpoint shows full transcript and status without constraints (§4, §8)
    const getRes = await request(app).get(`/api/negotiate/sessions/${sessionId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('converged');
    expect(getRes.body.turns).toHaveLength(3);
    expect(getRes.body.turns[0].offer).toBeDefined();
    expect(getRes.body.turns[0].rationale).toBeDefined();

    // E. Verify human manual resolution acceptance (§3.4)
    const resolveRes = await request(app)
      .post(`/api/negotiate/sessions/${sessionId}/resolve`)
      .send({
        humanId: 'human-nova',
        action: 'accept',
      });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.status).toBe('recorded');
  });

  it('2. Forced impasse with Fixture A: Bill-Splitting Floor/Ceiling Gap (§9.8, §10)', async () => {
    const initRes = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Vacation Rental Rent Share (Impasse Fixture A)',
        sharedFacts: { amount: 200, currency: '$' },
        initiatorHumanId: 'h-101',
        initiatorShapeId: 's-101',
        initiatorFloor: { amount: 150, currency: '$' },
        initiatorCeiling: { amount: 180, currency: '$' },
        initiatorPriorities: { cost: 1 },
        counterpartyHumanId: 'h-102',
        counterpartyShapeId: 's-102',
      });

    expect(initRes.status).toBe(201);
    const sessionId = initRes.body.id;
    const counterparty = initRes.body.participants.find((p: any) => p.role === 'counterparty');

    const consentRes = await request(app).post(`/api/negotiate/sessions/${sessionId}/consent`).send({
      participantId: counterparty.id,
      accept: true,
      floor: { amount: 80, currency: '$' },
      ceiling: { amount: 100, currency: '$' },
      priorities: { cost: 1 },
    });
    expect(consentRes.status).toBe(200);

    // Turn 1
    const t1 = await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    expect(t1.status).toBe(200);

    // Turn 2 triggers impasse fixture A in LLM service
    const turn2Res = await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.sessionStatus).toBe('impasse');
    expect(turn2Res.body.resolution.outcome).toBe('impasse');
    expect(turn2Res.body.resolution.divergence_notes).toContain('Structural divergence detected');
  });

  it('3. Forced impasse with Fixture B: Scheduling Date/Time Incompatibility (§9.8, §10)', async () => {
    const initRes = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Summer Trip Dates Scheduling Conflict (Impasse Fixture B)',
        sharedFacts: { month: 'August', duration_days: 7 },
        initiatorHumanId: 'h-201',
        initiatorShapeId: 's-201',
        initiatorFloor: { earliest: '2026-08-01' },
        initiatorCeiling: { latest: '2026-08-10' },
        initiatorPriorities: { speed: 1 },
        counterpartyHumanId: 'h-202',
        counterpartyShapeId: 's-202',
      });

    expect(initRes.status).toBe(201);
    const sessionId = initRes.body.id;
    const counterparty = initRes.body.participants.find((p: any) => p.role === 'counterparty');

    const consentRes = await request(app).post(`/api/negotiate/sessions/${sessionId}/consent`).send({
      participantId: counterparty.id,
      accept: true,
      floor: { earliest: '2026-08-15' },
      ceiling: { latest: '2026-08-25' },
      priorities: { speed: 1 },
    });
    expect(consentRes.status).toBe(200);

    await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    const turn2Res = await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.sessionStatus).toBe('impasse');
    expect(turn2Res.body.resolution.divergence_notes).toContain('Temporal divergence detected');
  });

  it('4. Forced impasse with Fixture C: Budget vs. Amenities Priority Conflict (§9.8, §10)', async () => {
    const initRes = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Team Offsite Budget Priority Conflict (Impasse Fixture C)',
        sharedFacts: { headcount: 10 },
        initiatorHumanId: 'h-301',
        initiatorShapeId: 's-301',
        initiatorFloor: { min_per_person: 300 },
        initiatorCeiling: { max_per_person: 400 },
        initiatorPriorities: { quality: 1 },
        counterpartyHumanId: 'h-302',
        counterpartyShapeId: 's-302',
      });

    expect(initRes.status).toBe(201);
    const sessionId = initRes.body.id;
    const counterparty = initRes.body.participants.find((p: any) => p.role === 'counterparty');

    const consentRes = await request(app).post(`/api/negotiate/sessions/${sessionId}/consent`).send({
      participantId: counterparty.id,
      accept: true,
      floor: { max_total: 1000 },
      ceiling: { max_total: 1500 },
      priorities: { cost: 1 },
    });
    expect(consentRes.status).toBe(200);

    await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    const turn2Res = await request(app).post(`/api/negotiate/sessions/${sessionId}/turn`).send({});
    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.sessionStatus).toBe('impasse');
    expect(turn2Res.body.resolution.divergence_notes).toContain('Priority & budget divergence detected');
  });
});
