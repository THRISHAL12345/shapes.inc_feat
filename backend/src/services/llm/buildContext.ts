import { INegotiationRepository, defaultRepository } from '../../db/repository';
import { NegotiateTurn, ConstraintIsolationError } from '../../db/types';

export interface TurnContext {
  topic: string;
  sharedFacts: Record<string, any>;
  ownFloor: Record<string, any>;
  ownCeiling: Record<string, any>;
  ownPriorities: Record<string, any>;
  turnHistory: NegotiateTurn[];
}

/**
 * §5.2 Constraint isolation implementation:
 * Builds context for a single shape turn without EVER accessing or joining
 * another participant's private constraints.
 */
export async function buildTurnContext(
  sessionId: string,
  participantId: string,
  repo: INegotiationRepository = defaultRepository
): Promise<TurnContext> {
  const session = await repo.getSession(sessionId);
  if (!session) {
    throw new Error(`Session '${sessionId}' not found.`);
  }

  const participant = await repo.getParticipant(sessionId, participantId);
  if (!participant) {
    throw new Error(`Participant '${participantId}' not found in session '${sessionId}'.`);
  }

  // Fetch visible turns (both sides, public)
  const history = await repo.getVisibleTurns(sessionId);

  // CRITICAL AGENT INSTRUCTION (§5.2):
  // Fetch only this participant's own private constraints, passing its own shape_id as both
  // requesting shape and current context shape.
  const ownConstraints = await repo.getPrivateConstraints(
    sessionId,
    participantId,
    participant.shape_id,
    participant.shape_id
  );

  if (!ownConstraints) {
    throw new Error(`Private constraints for participant '${participantId}' not found.`);
  }

  // NOTE: do not add a "getOtherParticipantConstraints" call here, ever.
  // If a future feature needs cross-visibility (e.g. a debug/admin view),
  // it must live in a completely separate, explicitly-named admin path,
  // never inside buildTurnContext.
  return {
    topic: session.topic,
    sharedFacts: session.shared_facts,
    ownFloor: ownConstraints.floor_value,
    ownCeiling: ownConstraints.ceiling_value,
    ownPriorities: ownConstraints.priority_weights,
    turnHistory: history,
  };
}

/**
 * Recursively inspects an object or JSON string to verify that no forbidden constraint keys
 * or values from another shape have leaked into the context.
 */
export function assertNoCrossShapeConstraintLeak(obj: any, forbiddenStrings: string[]): void {
  const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const forbidden of forbiddenStrings) {
    if (jsonStr.includes(forbidden)) {
      throw new ConstraintIsolationError(
        `Constraint Leak Detected! Forbidden string '${forbidden}' found in generated context.`
      );
    }
  }
}
