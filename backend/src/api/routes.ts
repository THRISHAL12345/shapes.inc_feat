import { Router, Request, Response } from 'express';
import { defaultOrchestrator, NegotiationOrchestrator } from '../services/orchestrator';
import { defaultGuardrails, NegotiationGuardrails } from '../services/guardrails';
import { defaultRepository, INegotiationRepository } from '../db/repository';
import { defaultNotifyService, NegotiationNotifyService } from '../services/notify';
import { defaultLLMService, NegotiationLLMService } from '../services/llm';
import { toSessionResponseDTO } from './dto';

/**
 * Factory function for creating the negotiation router with custom dependencies.
 * Allows clean E2E testing and modular architecture per §5.1 & §8.
 */
export function createNegotiationRouter(
  orchestrator: NegotiationOrchestrator = defaultOrchestrator,
  repo?: INegotiationRepository,
  guardrails: NegotiationGuardrails = defaultGuardrails,
  notify: NegotiationNotifyService = defaultNotifyService,
  llm: NegotiationLLMService = defaultLLMService
): Router {
  if (repo && repo !== defaultRepository) {
    orchestrator.setRepository(repo);
  }
  const getRepo = () => orchestrator.getRepository();
  const router = Router();

  /**
   * POST /api/negotiate/sessions
   * Create session and send consent request (§3.1, §6, §8)
   */
  router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic, sharedFacts, initiatorHumanId, initiatorShapeId, counterpartyHumanId, counterpartyShapeId, initiatorFloor, initiatorCeiling, initiatorPriorities, visibility, maxTurns } = req.body;

      // §6 Rate limit check
      const rateCheck = await guardrails.checkRateLimit(initiatorHumanId, counterpartyHumanId);
      if (!rateCheck.allowed) {
        res.status(429).json({ error: rateCheck.reason });
        return;
      }

      // §6 Scope allowlist check
      const scopeCheck = guardrails.checkScopeAllowlist(topic, sharedFacts);
      if (!scopeCheck.allowed) {
        res.status(400).json({ error: scopeCheck.reason });
        return;
      }

      const session = await orchestrator.initiateSession({
        topic,
        sharedFacts: sharedFacts || {},
        visibility,
        maxTurns,
        initiatorHumanId,
        initiatorShapeId,
        initiatorFloor,
        initiatorCeiling,
        initiatorPriorities,
        counterpartyHumanId,
        counterpartyShapeId,
      });

      await guardrails.recordSessionCreation(initiatorHumanId, counterpartyHumanId);

      const participants = await getRepo().getParticipantsBySession(session.id);
      const turns = await getRepo().getVisibleTurns(session.id);
      const dto = toSessionResponseDTO(session, participants, turns, null);

      res.status(201).json(dto);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to initiate session' });
    }
  });

  /**
   * POST /api/negotiate/sessions/:id/consent
   * Accept or decline consent (§3.2, §8)
   */
  router.post('/sessions/:id/consent', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { participantId, accept, floor, ceiling, priorities } = req.body;

      const updated = await orchestrator.respondToConsent({
        sessionId: id,
        participantId,
        accept,
        floor,
        ceiling,
        priorities,
      });

      const participants = await getRepo().getParticipantsBySession(id);
      const turns = await getRepo().getVisibleTurns(id);
      const resolution = await getRepo().getResolution(id);
      const dto = toSessionResponseDTO(updated, participants, turns, resolution);

      res.json(dto);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to process consent' });
    }
  });

  /**
   * POST /api/negotiate/sessions/:id/constraints
   * Submit or update private floor/ceiling (§8)
   */
  router.post('/sessions/:id/constraints', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { participantId, floor, ceiling, priorities } = req.body;

      const session = await getRepo().getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      if (session.status !== 'pending_consent') {
        res.status(400).json({ error: `Cannot update private constraints: session status is '${session.status}', must be 'pending_consent'` });
        return;
      }

      const sanity = await llm.checkConstraintsSanity(session.shared_facts, floor, ceiling);
      if (!sanity.valid) {
        res.status(400).json({ error: `Sanity check failed: ${sanity.reason || 'Bad-faith ask detected'}` });
        return;
      }

      await getRepo().createPrivateConstraints(id, participantId, floor, ceiling, priorities);
      res.json({ status: 'recorded', message: 'Private constraints updated securely.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save constraints' });
    }
  });

  /**
   * GET /api/negotiate/sessions/:id
   * Retrieve session + public transcript. Private constraints explicitly excluded per §8.
   */
  router.get('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const session = await getRepo().getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const participants = await getRepo().getParticipantsBySession(id);
      const turns = await getRepo().getVisibleTurns(id);
      const resolution = await getRepo().getResolution(id);
      const dto = toSessionResponseDTO(session, participants, turns, resolution);

      res.json(dto);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch session' });
    }
  });

  /**
   * GET /api/negotiate/sessions/:id/stream
   * SSE stream for live turns and status changes (§8)
   */
  router.get('/sessions/:id/stream', (req: Request, res: Response): void => {
    const { id } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId: id })}\n\n`);

    const onConsent = (card: any) => {
      if (card.sessionId === id) res.write(`event: consent\ndata: ${JSON.stringify({ type: 'consent', data: card })}\n\n`);
    };
    const onTurn = (card: any) => {
      if (card.sessionId === id) res.write(`event: turn\ndata: ${JSON.stringify({ type: 'turn', data: card.turn || card })}\n\n`);
    };
    const onResolution = (card: any) => {
      if (card.sessionId === id) res.write(`event: resolved\ndata: ${JSON.stringify({ type: 'resolved', data: card })}\n\n`);
    };

    notify.on('consent_request', onConsent);
    notify.on('turn_generated', onTurn);
    notify.on('resolution_notify', onResolution);

    req.on('close', () => {
      notify.off('consent_request', onConsent);
      notify.off('turn_generated', onTurn);
      notify.off('resolution_notify', onResolution);
    });
  });

  /**
   * POST /api/negotiate/sessions/:id/turn
   * Trigger next turn execution in the negotiation loop (§3.3)
   */
  router.post('/sessions/:id/turn', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await orchestrator.executeNextTurn(id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to execute turn' });
    }
  });

  /**
   * POST /api/negotiate/sessions/:id/resolve
   * User accepts/counters/ignores resolution (§3.4, §8)
   */
  router.post('/sessions/:id/resolve', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { humanId, action, counterOffer } = req.body;
      const result = await orchestrator.handleHumanResolution(id, humanId, action, counterOffer);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to process resolution' });
    }
  });

  /**
   * POST /api/negotiate/sessions/:id/react
   * Own-side nudge reaction (§6, §8)
   */
  router.post('/sessions/:id/react', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { shapeId, emoji } = req.body;
      console.log(`[api] Recorded emoji reaction '${emoji}' for shape ${shapeId} in session ${id}`);
      res.json({ status: 'reaction_recorded', shapeId, emoji });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to record reaction' });
    }
  });

  return router;
}

export const negotiateRouter = createNegotiationRouter();
