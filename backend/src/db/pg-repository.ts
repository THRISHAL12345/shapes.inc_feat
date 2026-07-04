import { Pool } from 'pg';
import {
  INegotiationRepository,
} from './repository';
import {
  NegotiateSession,
  NegotiateParticipant,
  NegotiatePrivateConstraints,
  NegotiateTurn,
  NegotiateResolution,
  NegotiateHumanResolution,
  NegotiateReaction,
  SessionStatus,
  SessionVisibility,
  ConsentStatus,
  ResolutionOutcome,
  ConstraintIsolationError,
} from './types';

export class PostgresNegotiationRepository implements INegotiationRepository {
  constructor(private pool: Pool) {}

  async createSession(
    topic: string,
    sharedFacts: Record<string, any>,
    visibility: SessionVisibility = 'participants_and_groups',
    maxTurns: number = 12
  ): Promise<NegotiateSession> {
    const res = await this.pool.query(
      `INSERT INTO negotiate_sessions (topic, shared_facts, visibility, max_turns, status)
       VALUES ($1, $2, $3, $4, 'pending_consent')
       RETURNING *`,
      [topic, JSON.stringify(sharedFacts), visibility, maxTurns]
    );
    return res.rows[0];
  }

  async getSession(sessionId: string): Promise<NegotiateSession | null> {
    const res = await this.pool.query(
      `SELECT * FROM negotiate_sessions WHERE id = $1`,
      [sessionId]
    );
    return res.rows[0] || null;
  }

  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<NegotiateSession | null> {
    let query = `UPDATE negotiate_sessions SET status = $1 WHERE id = $2 RETURNING *`;
    if (['converged', 'impasse', 'timeout', 'expired'].includes(status)) {
      query = `UPDATE negotiate_sessions SET status = $1, resolved_at = now() WHERE id = $2 RETURNING *`;
    }
    const res = await this.pool.query(query, [status, sessionId]);
    return res.rows[0] || null;
  }

  async createParticipant(
    sessionId: string,
    humanId: string,
    shapeId: string,
    role: 'initiator' | 'counterparty'
  ): Promise<NegotiateParticipant> {
    const consentStatus: ConsentStatus = role === 'initiator' ? 'accepted' : 'pending';
    const res = await this.pool.query(
      `INSERT INTO negotiate_participants (session_id, human_id, shape_id, role, consent_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, humanId, shapeId, role, consentStatus]
    );
    return res.rows[0];
  }

  async getParticipant(sessionId: string, participantId: string): Promise<NegotiateParticipant | null> {
    const res = await this.pool.query(
      `SELECT * FROM negotiate_participants WHERE id = $1 AND session_id = $2`,
      [participantId, sessionId]
    );
    return res.rows[0] || null;
  }

  async getParticipantsBySession(sessionId: string): Promise<NegotiateParticipant[]> {
    const res = await this.pool.query(
      `SELECT * FROM negotiate_participants WHERE session_id = $1`,
      [sessionId]
    );
    return res.rows;
  }

  async updateParticipantConsent(
    sessionId: string,
    participantId: string,
    consentStatus: ConsentStatus
  ): Promise<NegotiateParticipant | null> {
    const res = await this.pool.query(
      `UPDATE negotiate_participants SET consent_status = $1 WHERE id = $2 AND session_id = $3 RETURNING *`,
      [consentStatus, participantId, sessionId]
    );
    return res.rows[0] || null;
  }

  async createPrivateConstraints(
    sessionId: string,
    participantId: string,
    floorValue: Record<string, any>,
    ceilingValue: Record<string, any>,
    priorityWeights: Record<string, any>
  ): Promise<NegotiatePrivateConstraints> {
    const res = await this.pool.query(
      `INSERT INTO negotiate_private_constraints (session_id, participant_id, floor_value, ceiling_value, priority_weights)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, participantId, JSON.stringify(floorValue), JSON.stringify(ceilingValue), JSON.stringify(priorityWeights)]
    );
    return res.rows[0];
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

    const res = await this.pool.query(
      `SELECT * FROM negotiate_private_constraints WHERE session_id = $1 AND participant_id = $2`,
      [sessionId, participantId]
    );
    return res.rows[0] || null;
  }

  async createTurn(
    sessionId: string,
    participantId: string,
    turnNumber: number,
    offer: Record<string, any>,
    rationale: string,
    gapAfter?: Record<string, any>
  ): Promise<NegotiateTurn> {
    const res = await this.pool.query(
      `INSERT INTO negotiate_turns (session_id, participant_id, turn_number, offer, rationale, gap_after)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sessionId, participantId, turnNumber, JSON.stringify(offer), rationale, gapAfter ? JSON.stringify(gapAfter) : null]
    );
    return res.rows[0];
  }

  async getVisibleTurns(sessionId: string): Promise<NegotiateTurn[]> {
    const res = await this.pool.query(
      `SELECT * FROM negotiate_turns WHERE session_id = $1 ORDER BY turn_number ASC`,
      [sessionId]
    );
    return res.rows;
  }

  async createResolution(
    sessionId: string,
    outcome: ResolutionOutcome,
    finalTerms?: Record<string, any>,
    confidence?: number,
    divergenceNotes?: string
  ): Promise<NegotiateResolution> {
    const res = await this.pool.query(
      `INSERT INTO negotiate_resolutions (session_id, outcome, final_terms, confidence, divergence_notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, outcome, finalTerms ? JSON.stringify(finalTerms) : null, confidence, divergenceNotes]
    );
    return res.rows[0];
  }

  async getResolution(sessionId: string): Promise<NegotiateResolution | null> {
    const res = await this.pool.query(
      `SELECT * FROM negotiate_resolutions WHERE session_id = $1`,
      [sessionId]
    );
    return res.rows[0] || null;
  }

  async createHumanResolution(
    sessionId: string,
    humanId: string,
    action: 'accept' | 'counter' | 'ignore',
    counterOffer?: Record<string, any>
  ): Promise<NegotiateHumanResolution> {
    const res = await this.pool.query(
      `INSERT INTO negotiate_human_resolutions (session_id, human_id, action, counter_offer)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sessionId, humanId, action, counterOffer ? JSON.stringify(counterOffer) : null]
    );
    return res.rows[0];
  }

  async getHumanResolutionsBySession(sessionId: string): Promise<NegotiateHumanResolution[]> {
    const res = await this.pool.query(
      `SELECT * FROM negotiate_human_resolutions WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );
    return res.rows;
  }

  async createReaction(sessionId: string, shapeId: string, emoji: string): Promise<NegotiateReaction> {
    const res = await this.pool.query(
      `INSERT INTO negotiate_reactions (session_id, shape_id, emoji)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [sessionId, shapeId, emoji]
    );
    return res.rows[0];
  }

  async getReactionsBySessionAndShape(sessionId: string, shapeId: string): Promise<NegotiateReaction[]> {
    const res = await this.pool.query(
      `SELECT * FROM negotiate_reactions WHERE session_id = $1 AND shape_id = $2 ORDER BY created_at ASC`,
      [sessionId, shapeId]
    );
    return res.rows;
  }
}
