import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryNegotiationRepository } from '../../../db/repository';
import { ConstraintIsolationError } from '../../../db/types';
import { buildTurnContext, assertNoCrossShapeConstraintLeak } from '../buildContext';

describe('Constraint Isolation Test (§1.1, §5.2, §9.2)', () => {
  let repo: InMemoryNegotiationRepository;
  let sessionId: string;
  let pAId: string;
  let pBId: string;

  const SECRET_FLOOR_B = 'SECRET_FLOOR_VALUE_FOR_SHAPE_B_99999';
  const SECRET_CEILING_B = 'SECRET_CEILING_VALUE_FOR_SHAPE_B_88888';
  const SECRET_PRIORITY_KEY_B = 'secret_priority_key_only_for_b';

  beforeEach(async () => {
    repo = new InMemoryNegotiationRepository();
    const session = await repo.createSession('Confidential Salary Negotiation', { baseSalary: 100000 });
    sessionId = session.id;

    const pA = await repo.createParticipant(sessionId, 'human-A', 'shape-A', 'initiator');
    const pB = await repo.createParticipant(sessionId, 'human-B', 'shape-B', 'counterparty');
    pAId = pA.id;
    pBId = pB.id;

    await repo.createPrivateConstraints(
      sessionId,
      pAId,
      { minAcceptable: 110000 },
      { maxAsk: 130000 },
      { salary: 1.0 }
    );

    await repo.createPrivateConstraints(
      sessionId,
      pBId,
      { minOffer: SECRET_FLOOR_B },
      { maxOffer: SECRET_CEILING_B },
      { [SECRET_PRIORITY_KEY_B]: 1.0 }
    );
  });

  it('should never include any key or value from Shape B in Shape A context via deep object inspection', async () => {
    const contextA = await buildTurnContext(sessionId, pAId, repo);

    // Verify Shape A's own constraints are present
    expect(contextA.ownFloor).toEqual({ minAcceptable: 110000 });
    expect(contextA.ownCeiling).toEqual({ maxAsk: 130000 });

    // Deep inspection test: assert zero forbidden keys/values exist in contextA
    const forbiddenList = [SECRET_FLOOR_B, SECRET_CEILING_B, SECRET_PRIORITY_KEY_B];
    expect(() => assertNoCrossShapeConstraintLeak(contextA, forbiddenList)).not.toThrow();

    // Verify JSON string representation has zero matches
    const jsonStr = JSON.stringify(contextA);
    for (const forbidden of forbiddenList) {
      expect(jsonStr).not.toContain(forbidden);
    }
  });

  it('assertNoCrossShapeConstraintLeak should throw if a forbidden string is injected', () => {
    const leakedContext = {
      topic: 'Test',
      someNestedObject: {
        leakedField: SECRET_FLOOR_B
      }
    };
    expect(() => assertNoCrossShapeConstraintLeak(leakedContext, [SECRET_FLOOR_B])).toThrow(/Constraint Leak Detected/);
  });

  it('should prevent cross-shape database fetch attempts during context building', async () => {
    // Attempting to fetch Shape B's constraints while claiming to build context for Shape A
    await expect(
      repo.getPrivateConstraints(sessionId, pBId, 'shape-B', 'shape-A')
    ).rejects.toThrow(ConstraintIsolationError);
  });
});
