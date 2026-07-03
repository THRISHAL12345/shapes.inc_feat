import {
  NegotiateSession,
  NegotiateParticipant,
  NegotiatePrivateConstraints,
  NegotiateTurn,
  NegotiateResolution,
  NegotiateHumanResolution,
  SessionStatus,
  SessionVisibility,
  ConsentStatus,
  ResolutionOutcome,
  ConstraintIsolationError,
} from './types';
import { randomUUID } from 'crypto';

export interface INegotiationRepository {
  createSession(topic: string, sharedFacts: Record<string, any>, visibility?: SessionVisibility, maxTurns?: number): Promise<NegotiateSession>;
  getSession(sessionId: string): Promise<NegotiateSession | null>;
  updateSessionStatus(sessionId: string, status: SessionStatus): Promise<NegotiateSession | null>;
  
  createParticipant(sessionId: string, humanId: string, shapeId: string, role: 'initiator' | 'counterparty'): Promise<NegotiateParticipant>;
  getParticipant(sessionId: string, participantId: string): Promise<NegotiateParticipant | null>;
  getParticipantsBySession(sessionId: string): Promise<NegotiateParticipant[]>;
  updateParticipantConsent(sessionId: string, participantId: string, consentStatus: ConsentStatus): Promise<NegotiateParticipant | null>;
  
  createPrivateConstraints(sessionId: string, participantId: string, floorValue: Record<string, any>, ceilingValue: Record<string, any>, priorityWeights: Record<string, any>): Promise<NegotiatePrivateConstraints>;
  getPrivateConstraints(sessionId: string, participantId: string, requestingShapeId: string, currentContextShapeId?: string): Promise<NegotiatePrivateConstraints | null>;
  
  createTurn(sessionId: string, participantId: string, turnNumber: number, offer: Record<string, any>, rationale: string, gapAfter?: Record<string, any>): Promise<NegotiateTurn>;
  getVisibleTurns(sessionId: string): Promise<NegotiateTurn[]>;
  
  createResolution(sessionId: string, outcome: ResolutionOutcome, finalTerms?: Record<string, any>, confidence?: number, divergenceNotes?: string): Promise<NegotiateResolution>;
  getResolution(sessionId: string): Promise<NegotiateResolution | null>;

  createHumanResolution(sessionId: string, humanId: string, action: 'accept' | 'counter' | 'ignore', counterOffer?: Record<string, any>): Promise<NegotiateHumanResolution>;
  getHumanResolutionsBySession(sessionId: string): Promise<NegotiateHumanResolution[]>;
}

export class InMemoryNegotiationRepository implements INegotiationRepository {
  private sessions: Map<string, NegotiateSession> = new Map();
  private participants: Map<string, NegotiateParticipant> = new Map();
  private constraints: Map<string, NegotiatePrivateConstraints> = new Map();
  private turns: Map<string, NegotiateTurn[]> = new Map();
  private resolutions: Map<string, NegotiateResolution> = new Map();
  private humanResolutions: Map<string, NegotiateHumanResolution[]> = new Map();

  async createSession(topic: string, sharedFacts: Record<string, any>, visibility: SessionVisibility = 'participants_and_groups', maxTurns: number = 12): Promise<NegotiateSession> {
    const session: NegotiateSession = {
      id: randomUUID(),
      topic,
      shared_facts: sharedFacts,
      status: 'pending_consent',
      visibility,
      max_turns: maxTurns,
      created_at: new Date(),
    };
    this.sessions.set(session.id, session);
    this.turns.set(session.id, []);
    this.humanResolutions.set(session.id, []);
    return session;
  }

  async getSession(sessionId: string): Promise<NegotiateSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<NegotiateSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.status = status;
    if (status === 'converged' || status === 'impasse' || status === 'timeout' || status === 'expired') {
      session.resolved_at = new Date();
    }
    this.sessions.set(sessionId, session);
    return session;
  }

  async createParticipant(sessionId: string, humanId: string, shapeId: string, role: 'initiator' | 'counterparty'): Promise<NegotiateParticipant> {
    const participant: NegotiateParticipant = {
      id: randomUUID(),
      session_id: sessionId,
      human_id: humanId,
      shape_id: shapeId,
      role,
      consent_status: role === 'initiator' ? 'accepted' : 'pending',
    };
    this.participants.set(participant.id, participant);
    return participant;
  }

  async getParticipant(sessionId: string, participantId: string): Promise<NegotiateParticipant | null> {
    const p = this.participants.get(participantId);
    if (p && p.session_id === sessionId) return p;
    return null;
  }

  async getParticipantsBySession(sessionId: string): Promise<NegotiateParticipant[]> {
    const list: NegotiateParticipant[] = [];
    for (const p of this.participants.values()) {
      if (p.session_id === sessionId) list.push(p);
    }
    return list;
  }

  async updateParticipantConsent(sessionId: string, participantId: string, consentStatus: ConsentStatus): Promise<NegotiateParticipant | null> {
    const p = this.participants.get(participantId);
    if (!p || p.session_id !== sessionId) return null;
    p.consent_status = consentStatus;
    this.participants.set(participantId, p);
    return p;
  }

  async createPrivateConstraints(
    sessionId: string,
    participantId: string,
    floorValue: Record<string, any>,
    ceilingValue: Record<string, any>,
    priorityWeights: Record<string, any>
  ): Promise<NegotiatePrivateConstraints> {
    const constraint: NegotiatePrivateConstraints = {
      id: randomUUID(),
      session_id: sessionId,
      participant_id: participantId,
      floor_value: floorValue,
      ceiling_value: ceilingValue,
      priority_weights: priorityWeights,
      created_at: new Date(),
    };
    this.constraints.set(`${sessionId}:${participantId}`, constraint);
    return constraint;
  }

  async getPrivateConstraints(
    sessionId: string,
    participantId: string,
    requestingShapeId: string,
    currentContextShapeId?: string
  ): Promise<NegotiatePrivateConstraints | null> {
    if (currentContextShapeId && currentContextShapeId !== requestingShapeId) {
      throw new ConstraintIsolationError(
        `Strict Rule §5.2 Violation: Attempting to fetch private constraints for shape ${requestingShapeId} during context build for different shape ${currentContextShapeId}. Cross-shape constraint leakage prevented.`
      );
    }

    const participant = await this.getParticipant(sessionId, participantId);
    if (!participant) return null;
    if (participant.shape_id !== requestingShapeId) {
      throw new ConstraintIsolationError(
        `Strict Rule §5.2 Violation: Shape ${requestingShapeId} is not authorized to access private constraints of participant ${participantId} (owned by shape ${participant.shape_id}).`
      );
    }

    return this.constraints.get(`${sessionId}:${participantId}`) || null;
  }

  async createTurn(
    sessionId: string,
    participantId: string,
    turnNumber: number,
    offer: Record<string, any>,
    rationale: string,
    gapAfter?: Record<string, any>
  ): Promise<NegotiateTurn> {
    const turn: NegotiateTurn = {
      id: randomUUID(),
      session_id: sessionId,
      participant_id: participantId,
      turn_number: turnNumber,
      offer,
      rationale,
      gap_after: gapAfter,
      created_at: new Date(),
    };
    const list = this.turns.get(sessionId) || [];
    list.push(turn);
    this.turns.set(sessionId, list);
    return turn;
  }

  async getVisibleTurns(sessionId: string): Promise<NegotiateTurn[]> {
    return (this.turns.get(sessionId) || []).sort((a, b) => a.turn_number - b.turn_number);
  }

  async createResolution(sessionId: string, outcome: ResolutionOutcome, finalTerms?: Record<string, any>, confidence?: number, divergenceNotes?: string): Promise<NegotiateResolution> {
    const res: NegotiateResolution = {
      session_id: sessionId,
      outcome,
      final_terms: finalTerms,
      confidence,
      divergence_notes: divergenceNotes,
      created_at: new Date(),
    };
    this.resolutions.set(sessionId, res);
    return res;
  }

  async getResolution(sessionId: string): Promise<NegotiateResolution | null> {
    return this.resolutions.get(sessionId) || null;
  }

  async createHumanResolution(sessionId: string, humanId: string, action: 'accept' | 'counter' | 'ignore', counterOffer?: Record<string, any>): Promise<NegotiateHumanResolution> {
    const hr: NegotiateHumanResolution = {
      id: randomUUID(),
      session_id: sessionId,
      human_id: humanId,
      action,
      counter_offer: counterOffer,
      created_at: new Date(),
    };
    const list = this.humanResolutions.get(sessionId) || [];
    list.push(hr);
    this.humanResolutions.set(sessionId, list);
    return hr;
  }

  async getHumanResolutionsBySession(sessionId: string): Promise<NegotiateHumanResolution[]> {
    return this.humanResolutions.get(sessionId) || [];
  }
}

export const defaultRepository = new InMemoryNegotiationRepository();
