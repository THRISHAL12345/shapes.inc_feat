import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { negotiateRouter } from '../routes';
import { defaultRepository, InMemoryNegotiationRepository } from '../../db';
import { defaultGuardrails, NegotiationGuardrails } from '../../services';

const app = express();
app.use(express.json());
app.use('/api/negotiate', negotiateRouter);

describe('Negotiate API Routes & DTO Constraint Stripping (§6, §8)', () => {
  beforeEach(() => {
    NegotiationGuardrails.resetTracker();
    // Clear in-memory repo if needed or let tests create unique sessions
  });

  it('should create session and return DTO without any private constraints (§8)', async () => {
    const res = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Split Uber Bill',
        sharedFacts: { amount: 50 },
        initiatorHumanId: 'human-100',
        initiatorShapeId: 'shape-100',
        initiatorFloor: { amount: 20 },
        initiatorCeiling: { amount: 30 },
        initiatorPriorities: { fairness: 1 },
        counterpartyHumanId: 'human-200',
        counterpartyShapeId: 'shape-200',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('pending_consent');
    expect(res.body.participants).toHaveLength(2);

    // Strict check: verify no participant has floor_value, ceiling_value, or priority_weights
    for (const p of res.body.participants) {
      expect((p as any).floor_value).toBeUndefined();
      expect((p as any).ceiling_value).toBeUndefined();
      expect((p as any).priority_weights).toBeUndefined();
    }
  });

  it('should reject session creation if topic violates scope allowlist (§6)', async () => {
    const res = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Lease dispute mediation',
        sharedFacts: { rent: 1500 },
        initiatorHumanId: 'human-100',
        initiatorShapeId: 'shape-100',
        initiatorFloor: {},
        initiatorCeiling: {},
        initiatorPriorities: {},
        counterpartyHumanId: 'human-200',
        counterpartyShapeId: 'shape-200',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Scope violation');
  });

  it('should handle consent acceptance and activate session (§3.2, §8)', async () => {
    // Create session first
    const createRes = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Dinner bill split',
        sharedFacts: { total: 80 },
        initiatorHumanId: 'h-1',
        initiatorShapeId: 's-1',
        initiatorFloor: { amount: 30 },
        initiatorCeiling: { amount: 50 },
        initiatorPriorities: { cost: 1 },
        counterpartyHumanId: 'h-2',
        counterpartyShapeId: 's-2',
      });

    const sessionId = createRes.body.id;
    const counterparty = createRes.body.participants.find((p: any) => p.role === 'counterparty');

    const consentRes = await request(app)
      .post(`/api/negotiate/sessions/${sessionId}/consent`)
      .send({
        participantId: counterparty.id,
        accept: true,
        floor: { amount: 30 },
        ceiling: { amount: 50 },
        priorities: { cost: 1 },
      });

    expect(consentRes.status).toBe(200);
    expect(consentRes.body.status).toBe('active');
  });

  it('should explicitly exclude private-constraint fields on GET /sessions/:id (§8)', async () => {
    const createRes = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Schedule Meeting',
        sharedFacts: { date: '2026-08-01' },
        initiatorHumanId: 'h-A',
        initiatorShapeId: 's-A',
        initiatorFloor: { time: '10:00' },
        initiatorCeiling: { time: '12:00' },
        initiatorPriorities: { early: 1 },
        counterpartyHumanId: 'h-B',
        counterpartyShapeId: 's-B',
      });

    const sessionId = createRes.body.id;
    const getRes = await request(app).get(`/api/negotiate/sessions/${sessionId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(sessionId);

    // Assert absence of private keys anywhere in the response JSON tree
    const jsonString = JSON.stringify(getRes.body);
    expect(jsonString).not.toContain('floor_value');
    expect(jsonString).not.toContain('ceiling_value');
    expect(jsonString).not.toContain('priority_weights');
    expect(jsonString).not.toContain('10:00'); // the private floor value must not leak!
  });

  it('should record emoji reactions securely without exposing to counterparty (§6, §8)', async () => {
    const res = await request(app)
      .post('/api/negotiate/sessions/test-session-id/react')
      .send({
        shapeId: 'shape-100',
        emoji: '👍',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reaction_recorded');
    expect(res.body.emoji).toBe('👍');
  });

  it('should guard POST /sessions/:id/constraints against mid-session overwrites and bad-faith asks (§5.5, §8)', async () => {
    // Create session
    const createRes = await request(app)
      .post('/api/negotiate/sessions')
      .send({
        topic: 'Split Dinner Bill',
        sharedFacts: { total: 100 },
        initiatorHumanId: 'h-1',
        initiatorShapeId: 's-1',
        initiatorFloor: { amount: 40 },
        initiatorCeiling: { amount: 60 },
        initiatorPriorities: { cost: 1 },
        counterpartyHumanId: 'h-2',
        counterpartyShapeId: 's-2',
      });
    const sessionId = createRes.body.id;
    const counterparty = createRes.body.participants.find((p: any) => p.role === 'counterparty');

    // Reject bad faith ask ($0 on shared cost)
    const badFaithRes = await request(app)
      .post(`/api/negotiate/sessions/${sessionId}/constraints`)
      .send({
        participantId: counterparty.id,
        floor: { amount: 0 },
        ceiling: { amount: 0 },
        priorities: {},
      });
    expect(badFaithRes.status).toBe(400);
    expect(badFaithRes.body.error).toContain('Sanity check failed');

    // Accept valid ask while pending_consent
    const validRes = await request(app)
      .post(`/api/negotiate/sessions/${sessionId}/constraints`)
      .send({
        participantId: counterparty.id,
        floor: { amount: 40 },
        ceiling: { amount: 60 },
        priorities: {},
      });
    expect(validRes.status).toBe(200);
    expect(validRes.body.status).toBe('recorded');

    // Activate session via consent
    await request(app)
      .post(`/api/negotiate/sessions/${sessionId}/consent`)
      .send({
        participantId: counterparty.id,
        accept: true,
        floor: { amount: 40 },
        ceiling: { amount: 60 },
        priorities: {},
      });

    // Attempt constraint update after session is active -> MUST fail!
    const activeUpdateRes = await request(app)
      .post(`/api/negotiate/sessions/${sessionId}/constraints`)
      .send({
        participantId: counterparty.id,
        floor: { amount: 30 },
        ceiling: { amount: 50 },
        priorities: {},
      });
    expect(activeUpdateRes.status).toBe(400);
    expect(activeUpdateRes.body.error).toContain('Cannot update private constraints: session status is \'active\'');
  });
});
