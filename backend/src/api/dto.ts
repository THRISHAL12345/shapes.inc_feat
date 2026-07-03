import {
  NegotiateSession,
  NegotiateParticipant,
  NegotiateTurn,
  NegotiateResolution,
} from '../db/types';

export interface PublicParticipantDTO {
  id: string;
  session_id: string;
  human_id: string;
  shape_id: string;
  role: 'initiator' | 'counterparty';
  consent_status: 'pending' | 'accepted' | 'declined';
}

export interface SessionResponseDTO {
  id: string;
  topic: string;
  shared_facts: Record<string, any>;
  status: string;
  visibility: string;
  max_turns: number;
  created_at: Date | string;
  resolved_at?: Date | string | null;
  participants: PublicParticipantDTO[];
  turns: NegotiateTurn[];
  resolution?: NegotiateResolution | null;
}

/**
 * §8 API surface:
 * All private-constraint fields are explicitly excluded from the GET /sessions/:id response schema —
 * enforce with a response DTO, not post-hoc field stripping.
 */
export function toSessionResponseDTO(
  session: NegotiateSession,
  participants: NegotiateParticipant[],
  turns: NegotiateTurn[],
  resolution?: NegotiateResolution | null
): SessionResponseDTO {
  const publicParticipants: PublicParticipantDTO[] = participants.map(p => ({
    id: p.id,
    session_id: p.session_id,
    human_id: p.human_id,
    shape_id: p.shape_id,
    role: p.role,
    consent_status: p.consent_status,
  }));

  return {
    id: session.id,
    topic: session.topic,
    shared_facts: session.shared_facts,
    status: session.status,
    visibility: session.visibility,
    max_turns: session.max_turns,
    created_at: session.created_at,
    resolved_at: session.resolved_at,
    participants: publicParticipants,
    turns,
    resolution: resolution || null,
  };
}
