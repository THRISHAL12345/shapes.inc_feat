export type SessionStatus =
  | 'pending_consent'
  | 'active'
  | 'converged'
  | 'impasse'
  | 'expired'
  | 'timeout';

export type SessionVisibility = 'participants_only' | 'participants_and_groups';

export type ConsentStatus = 'pending' | 'accepted' | 'declined';

export type ResolutionOutcome = 'converged' | 'impasse' | 'timeout';

export interface NegotiateSession {
  id: string;
  topic: string;
  shared_facts: Record<string, any>;
  status: SessionStatus;
  visibility: SessionVisibility;
  max_turns: number;
  created_at: Date;
  resolved_at?: Date;
}

export interface NegotiateParticipant {
  id: string;
  session_id: string;
  human_id: string;
  shape_id: string;
  role: 'initiator' | 'counterparty';
  consent_status: ConsentStatus;
}

export interface NegotiatePrivateConstraints {
  id: string;
  session_id: string;
  participant_id: string;
  floor_value: Record<string, any>;
  ceiling_value: Record<string, any>;
  priority_weights: Record<string, any>;
  created_at: Date;
}

export interface NegotiateTurn {
  id: string;
  session_id: string;
  participant_id: string;
  turn_number: number;
  offer: Record<string, any>;
  rationale: string;
  gap_after?: Record<string, any>;
  created_at: Date;
}

export interface NegotiateResolution {
  session_id: string;
  outcome: ResolutionOutcome;
  final_terms?: Record<string, any>;
  confidence?: number;
  divergence_notes?: string;
  created_at: Date;
}

export interface NegotiateHumanResolution {
  id: string;
  session_id: string;
  human_id: string;
  action: 'accept' | 'counter' | 'ignore';
  counter_offer?: Record<string, any>;
  created_at: Date;
}

export class ConstraintIsolationError extends Error {
  constructor(message: string) {
    super(`[ConstraintIsolationError] ${message}`);
    this.name = 'ConstraintIsolationError';
  }
}
