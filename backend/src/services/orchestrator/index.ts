import { INegotiationRepository, defaultRepository } from '../../db/repository';
import { NegotiationLLMService, defaultLLMService } from '../llm/llmService';
import { ITurnLock, defaultTurnLock } from '../lock';
import { NegotiationNotifyService, defaultNotifyService } from '../notify';
import {
  NegotiateSession,
  NegotiateTurn,
  NegotiateResolution,
  SessionStatus,
  SessionVisibility,
} from '../../db/types';

export interface InitiateSessionRequest {
  topic: string;
  sharedFacts: Record<string, any>;
  visibility?: SessionVisibility;
  maxTurns?: number;
  initiatorHumanId: string;
  initiatorShapeId: string;
  initiatorFloor: Record<string, any>;
  initiatorCeiling: Record<string, any>;
  initiatorPriorities: Record<string, any>;
  counterpartyHumanId: string;
  counterpartyShapeId: string;
}

export interface RespondConsentRequest {
  sessionId: string;
  participantId: string;
  accept: boolean;
  floor?: Record<string, any>;
  ceiling?: Record<string, any>;
  priorities?: Record<string, any>;
}

export class NegotiationOrchestrator {
  private repo: INegotiationRepository;
  private llm: NegotiationLLMService;
  private lock: ITurnLock;
  private notify: NegotiationNotifyService;

  constructor(
    repo = defaultRepository,
    llm = defaultLLMService,
    lock = defaultTurnLock,
    notify = defaultNotifyService
  ) {
    this.repo = repo;
    this.llm = llm;
    this.lock = lock;
    this.notify = notify;
  }

  setRepository(repo: INegotiationRepository): void {
    this.repo = repo;
  }

  getRepository(): INegotiationRepository {
    return this.repo;
  }

  setLock(lock: ITurnLock): void {
    this.lock = lock;
  }

  /**
   * §3.1 Initiation & §5.5 Pre-session sanity check
   */
  async initiateSession(req: InitiateSessionRequest): Promise<NegotiateSession> {
    // 1. Pre-session sanity check on initiator's constraints
    const sanity = await this.llm.checkConstraintsSanity(req.sharedFacts, req.initiatorFloor, req.initiatorCeiling);
    if (!sanity.valid) {
      throw new Error(`Sanity check failed for initiator constraints: ${sanity.reason}`);
    }

    // 2. Create session in pending_consent
    const session = await this.repo.createSession(req.topic, req.sharedFacts, req.visibility, req.maxTurns);

    // 3. Create participants
    const initiator = await this.repo.createParticipant(session.id, req.initiatorHumanId, req.initiatorShapeId, 'initiator');
    const counterparty = await this.repo.createParticipant(session.id, req.counterpartyHumanId, req.counterpartyShapeId, 'counterparty');

    // 4. Capture private constraints for initiator
    await this.repo.createPrivateConstraints(
      session.id,
      initiator.id,
      req.initiatorFloor,
      req.initiatorCeiling,
      req.initiatorPriorities
    );

    // 5. Send consent request to counterparty (§3.2)
    await this.notify.sendConsentRequest({
      sessionId: session.id,
      topic: session.topic,
      sharedFacts: session.shared_facts,
      initiatorHumanId: initiator.human_id,
      initiatorShapeId: initiator.shape_id,
      recipientHumanId: counterparty.human_id,
      recipientShapeId: counterparty.shape_id,
    });

    return session;
  }

  /**
   * §3.2 Consent flow
   */
  async respondToConsent(req: RespondConsentRequest): Promise<NegotiateSession> {
    const session = await this.repo.getSession(req.sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'pending_consent') {
      throw new Error(`Cannot respond to consent: session status is '${session.status}'`);
    }

    const participant = await this.repo.getParticipant(req.sessionId, req.participantId);
    if (!participant) throw new Error('Participant not found');

    if (!req.accept) {
      // On Decline: session -> expired, notify initiator plainly without guilt-tripping (§3.2)
      await this.repo.updateParticipantConsent(req.sessionId, req.participantId, 'declined');
      const updated = await this.repo.updateSessionStatus(req.sessionId, 'expired');
      await this.notify.sendResolutionNotify({
        sessionId: req.sessionId,
        outcome: 'expired',
        divergenceNotes: 'Counterparty declined to participate in negotiation.',
        participants: await this.repo.getParticipantsBySession(req.sessionId),
      });
      return updated!;
    }

    // If accepted, validate that terms are provided
    if (!req.floor || !req.ceiling || !req.priorities) {
      throw new Error('Must provide private floor, ceiling, and priorities when accepting consent.');
    }

    // Run pre-session sanity check for counterparty (§5.5)
    const sanity = await this.llm.checkConstraintsSanity(session.shared_facts, req.floor, req.ceiling);
    if (!sanity.valid) {
      throw new Error(`Sanity check failed for counterparty constraints: ${sanity.reason}`);
    }

    // Capture private constraints
    await this.repo.createPrivateConstraints(req.sessionId, req.participantId, req.floor, req.ceiling, req.priorities);
    await this.repo.updateParticipantConsent(req.sessionId, req.participantId, 'accepted');

    // Both accepted -> activate session (§3.3)
    const updated = await this.repo.updateSessionStatus(req.sessionId, 'active');
    return updated!;
  }

  /**
   * §3.3 & §5.3: Negotiation loop with strict server-enforced alternation and turn lock
   */
  async executeNextTurn(sessionId: string): Promise<{ turn: NegotiateTurn; sessionStatus: SessionStatus; resolution?: NegotiateResolution }> {
    const session = await this.repo.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'active') {
      throw new Error(`Cannot execute turn: session status is '${session.status}'`);
    }

    // Strict Rule §5.3: Acquire turn lock with 60s TTL to prevent out-of-order execution or concurrent turns
    const acquired = await this.lock.acquire(sessionId, 60000);
    if (!acquired) {
      throw new Error(`Turn currently in progress for session '${sessionId}'. Strict turn sequencing lock active.`);
    }

    // Heartbeat renewal: extend TTL every 10s while LLM call is in flight to prevent mid-flight expiration
    const heartbeatTimer = setInterval(() => {
      this.lock.extend(sessionId, 60000).catch(() => {});
    }, 10000);

    try {
      const turns = await this.repo.getVisibleTurns(sessionId);
      const turnNumber = turns.length + 1;

      // Strict alternation: Turn 1 (odd) = initiator, Turn 2 (even) = counterparty
      const isInitiatorTurn = turnNumber % 2 !== 0;
      const targetRole = isInitiatorTurn ? 'initiator' : 'counterparty';
      const participants = await this.repo.getParticipantsBySession(sessionId);
      const activeParticipant = participants.find(p => p.role === targetRole);
      if (!activeParticipant) {
        throw new Error(`No participant found with role '${targetRole}' in session '${sessionId}'`);
      }

      // Generate turn via single LLM call (§5.3)
      const turnResp = await this.llm.generateTurn(sessionId, activeParticipant.id, this.repo);

      // Compute gap snapshot for live gap meter (§3.3 & §7.2)
      let gapAfter: Record<string, any> | undefined;
      const prevTurn = turns.length > 0 ? turns[turns.length - 1] : undefined;
      if (prevTurn && prevTurn.offer && turnResp.offer) {
        const currAmount = turnResp.offer.amount;
        const prevAmount = prevTurn.offer.amount;
        if (typeof currAmount === 'number' && typeof prevAmount === 'number') {
          gapAfter = {
            amountGap: Math.abs(currAmount - prevAmount),
            currency: turnResp.offer.currency || 'USD',
          };
        }
      }

      const turn = await this.repo.createTurn(
        sessionId,
        activeParticipant.id,
        turnNumber,
        turnResp.offer,
        turnResp.rationale,
        gapAfter
      );

      await this.notify.sendTurnNotify({
        sessionId,
        turnNumber,
        turn,
        participant: activeParticipant,
      });

      // Check termination conditions (§3.3)
      let newStatus: SessionStatus = 'active';
      let resolutionOutcome: 'converged' | 'impasse' | 'timeout' | undefined;
      let divergenceNotes: string | undefined;
      let confidence = 0.9;

      const baseAmount = Number(
        session.shared_facts?.amount ??
        session.shared_facts?.total ??
        session.shared_facts?.rent ??
        session.shared_facts?.salary ??
        session.shared_facts?.baseSalary ??
        session.shared_facts?.budget ??
        100
      );
      const tolerance = Math.max(5, baseAmount * 0.05);

      if (turnResp.flag_impasse) {
        newStatus = 'impasse';
        resolutionOutcome = 'impasse';
        divergenceNotes = turnResp.rationale || `Shape ${activeParticipant.shape_id} flagged impasse: no further movement possible within constraints.`;
      } else if (gapAfter && typeof gapAfter.amountGap === 'number' && gapAfter.amountGap <= tolerance) {
        // Convergence tolerance band (§3.3)
        newStatus = 'converged';
        resolutionOutcome = 'converged';
      } else if (turnNumber >= session.max_turns) {
        newStatus = 'timeout';
        resolutionOutcome = 'timeout';
        divergenceNotes = `Maximum turn limit (${session.max_turns}) reached without convergence.`;
      }

      let resolution: NegotiateResolution | undefined;
      if (newStatus !== 'active' && resolutionOutcome) {
        await this.repo.updateSessionStatus(sessionId, newStatus);
        resolution = await this.repo.createResolution(
          sessionId,
          resolutionOutcome,
          turnResp.offer,
          confidence,
          divergenceNotes
        );
        await this.notify.sendResolutionNotify({
          sessionId,
          outcome: resolutionOutcome,
          finalTerms: turnResp.offer,
          divergenceNotes,
          participants,
        });
      }

      return { turn, sessionStatus: newStatus, resolution };
    } finally {
      clearInterval(heartbeatTimer);
      await this.lock.release(sessionId);
    }
  }

  /**
   * §3.4 Resolution handling by humans (accept / counter / ignore)
   */
  async handleHumanResolution(sessionId: string, humanId: string, action: 'accept' | 'counter' | 'ignore', counterOffer?: Record<string, any>): Promise<{ status: string; message: string }> {
    const session = await this.repo.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    
    // Log resolution outcome for future tuning (§3.4)
    await this.repo.createHumanResolution(sessionId, humanId, action, counterOffer);
    console.log(`[orchestrator] Human ${humanId} took action '${action}' on session ${sessionId}`, counterOffer || '');
    return {
      status: 'recorded',
      message: `Action '${action}' recorded for human ${humanId}.`,
    };
  }
}

export const defaultOrchestrator = new NegotiationOrchestrator();
