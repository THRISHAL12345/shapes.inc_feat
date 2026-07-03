import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryNegotiationRepository } from '../repository';
import { ConstraintIsolationError } from '../types';

describe('InMemoryNegotiationRepository', () => {
  let repo: InMemoryNegotiationRepository;

  beforeEach(() => {
    repo = new InMemoryNegotiationRepository();
  });

  it('should create a session and participants', async () => {
    const session = await repo.createSession('Splitting Dinner Bill', { total: 120 });
    expect(session.id).toBeDefined();
    expect(session.status).toBe('pending_consent');

    const pA = await repo.createParticipant(session.id, 'human-1', 'shape-A', 'initiator');
    const pB = await repo.createParticipant(session.id, 'human-2', 'shape-B', 'counterparty');

    expect(pA.consent_status).toBe('accepted');
    expect(pB.consent_status).toBe('pending');
  });

  it('should strictly enforce constraint isolation per §1.1 and §5.2', async () => {
    const session = await repo.createSession('Trip Budget', { currency: 'USD' });
    const pA = await repo.createParticipant(session.id, 'human-1', 'shape-A', 'initiator');
    const pB = await repo.createParticipant(session.id, 'human-2', 'shape-B', 'counterparty');

    await repo.createPrivateConstraints(session.id, pA.id, { floor: 500 }, { ceiling: 1000 }, { price: 1 });
    await repo.createPrivateConstraints(session.id, pB.id, { floor: 800 }, { ceiling: 1500 }, { location: 1 });

    // Shape A requesting its own constraints without context override -> OK
    const constraintsA = await repo.getPrivateConstraints(session.id, pA.id, 'shape-A');
    expect(constraintsA).not.toBeNull();
    expect(constraintsA?.floor_value).toEqual({ floor: 500 });

    // Shape B attempting to request Shape A's private constraints -> MUST throw ConstraintIsolationError
    await expect(
      repo.getPrivateConstraints(session.id, pA.id, 'shape-B')
    ).rejects.toThrow(ConstraintIsolationError);

    // Any shape attempting to request Shape A's private constraints while building context for Shape B -> MUST throw
    await expect(
      repo.getPrivateConstraints(session.id, pA.id, 'shape-A', 'shape-B')
    ).rejects.toThrow(ConstraintIsolationError);
  });
});
