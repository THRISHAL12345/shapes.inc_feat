import React, { useState } from 'react';
import { NegotiationSubThread, LiveNegotiationView } from './components';
import { TurnItem } from './components/TranscriptView';

export default function App() {
  const [activeScenario, setActiveScenario] = useState<'converge' | 'impasse' | 'expired' | 'live'>('live');

  // Interactive state for scenario 1 (Happy path)
  const [happyStatus, setHappyStatus] = useState<string>('pending_consent');
  const [happyTurns, setHappyTurns] = useState<TurnItem[]>([]);
  const [happyGap, setHappyGap] = useState<number>(30);
  const [happyResolution, setHappyResolution] = useState<Record<string, any> | null>(null);

  // Fixture 2: Forced Impasse (§3.3, §3.4, §9.8)
  const impasseTurns: TurnItem[] = [
    {
      id: 'turn-1',
      turn_number: 1,
      participant_id: 'shape-A',
      role: 'initiator',
      offer: { amount: 80, currency: '$' },
      rationale: "My human prefers to pay $80 given the shorter stay duration.",
      created_at: new Date(Date.now() - 300000).toISOString(),
    },
    {
      id: 'turn-2',
      turn_number: 2,
      participant_id: 'shape-B',
      role: 'counterparty',
      offer: { amount: 150, currency: '$' },
      rationale: "My human requires at least $150 to cover the fixed cleaning and utility overhead.",
      created_at: new Date(Date.now() - 240000).toISOString(),
    },
    {
      id: 'turn-3',
      turn_number: 3,
      participant_id: 'shape-A',
      role: 'initiator',
      offer: { amount: 95, currency: '$' },
      rationale: "We can stretch to $95 as our absolute maximum budget.",
      created_at: new Date(Date.now() - 180000).toISOString(),
    },
    {
      id: 'turn-4',
      turn_number: 4,
      participant_id: 'shape-B',
      role: 'counterparty',
      offer: { amount: 140, currency: '$' },
      rationale: "I must flag impasse: no further movement is possible without breaching our private floor of $140.",
      created_at: new Date(Date.now() - 120000).toISOString(),
    },
  ];

  // Fixture 3: Expired / Consent Declined (§3.2)
  const expiredTurns: TurnItem[] = [];

  const handleConstraintSubmit = () => {
    setHappyStatus('active');
    setHappyTurns([
      {
        id: 'h-1',
        turn_number: 1,
        participant_id: 'shape-init',
        role: 'initiator',
        offer: { amount: 40, currency: '$' },
        rationale: "We propose splitting the Uber bill at $40 based on relative distance traveled.",
        created_at: new Date().toISOString(),
      },
    ]);
    setHappyGap(20);
  };

  const handleTriggerTurn = () => {
    if (happyTurns.length === 1) {
      setHappyTurns([
        ...happyTurns,
        {
          id: 'h-2',
          turn_number: 2,
          participant_id: 'shape-counter',
          role: 'counterparty',
          offer: { amount: 50, currency: '$' },
          rationale: "We counter with $50 to account for surge pricing during peak transit hours.",
          created_at: new Date().toISOString(),
        },
      ]);
      setHappyGap(10);
    } else if (happyTurns.length === 2) {
      const t3: TurnItem = {
        id: 'h-3',
        turn_number: 3,
        participant_id: 'shape-init',
        role: 'initiator',
        offer: { amount: 45, currency: '$' },
        rationale: "We agree to meet in the middle at $45, satisfying both humans' budget and fairness priorities.",
        created_at: new Date().toISOString(),
      };
      setHappyTurns([...happyTurns, t3]);
      setHappyGap(0);
      setHappyStatus('converged');
      setHappyResolution({
        final_terms: { amount: 45, currency: '$' },
        divergence_notes: "Both AI shapes converged cleanly within tolerance band.",
      });
    }
  };

  const handleResetHappy = () => {
    setHappyStatus('pending_consent');
    setHappyTurns([]);
    setHappyGap(30);
    setHappyResolution(null);
  };

  return (
    <div className="min-h-screen bg-shapes-void text-shapes-text-primary py-8 px-4">
      {/* Header Branding */}
      <header className="max-w-4xl mx-auto mb-8 text-center">
        <div className="inline-block px-3 py-1 bg-shapes-violet-900/60 border border-shapes-violet-500/40 rounded-full text-xs text-shapes-violet-300 font-semibold mb-3 shadow-shapes-glow">
          Shapes.inc AI Architecture
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-shapes-violet-300 to-shapes-cyan-400">
          Delegated Negotiation Spectator UI
        </h1>
        <p className="mt-2 text-sm text-shapes-text-secondary max-w-xl mx-auto">
          Visible, spectator-friendly sub-thread where AI shapes negotiate on behalf of their human partners with absolute constraint isolation (§0, §1, §7).
        </p>

        {/* Scenario Selector Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          <button
            type="button"
            onClick={() => setActiveScenario('live')}
            className={`px-4 py-2 rounded-shapes-sm text-xs font-bold transition-all ${
              activeScenario === 'live'
                ? 'bg-gradient-to-r from-shapes-violet-500 to-shapes-cyan-400 text-shapes-void font-extrabold shadow-shapes-glow'
                : 'bg-shapes-surface hover:bg-shapes-hover text-shapes-cyan-400 border border-[var(--shapes-border-strong)]'
            }`}
          >
            ⚡ Live API & Realtime SSE Mode
          </button>
          <button
            type="button"
            onClick={() => setActiveScenario('converge')}
            className={`px-4 py-2 rounded-shapes-sm text-xs font-bold transition-all ${
              activeScenario === 'converge'
                ? 'bg-shapes-violet-500 text-white shadow-shapes-glow'
                : 'bg-shapes-surface hover:bg-shapes-hover text-shapes-text-secondary border border-[var(--shapes-border-subtle)]'
            }`}
          >
            Scenario 1: Happy Path (Interactive)
          </button>
          <button
            type="button"
            onClick={() => setActiveScenario('impasse')}
            className={`px-4 py-2 rounded-shapes-sm text-xs font-bold transition-all ${
              activeScenario === 'impasse'
                ? 'bg-shapes-violet-500 text-white shadow-shapes-glow'
                : 'bg-shapes-surface hover:bg-shapes-hover text-shapes-text-secondary border border-[var(--shapes-border-subtle)]'
            }`}
          >
            Scenario 2: Forced Impasse Fixture
          </button>
          <button
            type="button"
            onClick={() => setActiveScenario('expired')}
            className={`px-4 py-2 rounded-shapes-sm text-xs font-bold transition-all ${
              activeScenario === 'expired'
                ? 'bg-shapes-violet-500 text-white shadow-shapes-glow'
                : 'bg-shapes-surface hover:bg-shapes-hover text-shapes-text-secondary border border-[var(--shapes-border-subtle)]'
            }`}
          >
            Scenario 3: Consent Declined
          </button>
        </div>
      </header>

      {/* Scenario Content Display */}
      <main className="max-w-4xl mx-auto">
        {activeScenario === 'live' && (
          <LiveNegotiationView />
        )}

        {activeScenario === 'converge' && (
          <div>
            <div className="text-center mb-3 flex justify-center items-center space-x-3">
              <span className="text-xs text-shapes-text-muted">Interactive demo of §3 initiation $\rightarrow$ consent $\rightarrow$ loop $\rightarrow$ convergence.</span>
              <button
                type="button"
                onClick={handleResetHappy}
                className="text-[11px] underline text-shapes-violet-300 hover:text-white"
              >
                Reset Simulation
              </button>
            </div>
            <NegotiationSubThread
              sessionId="happy-path-session"
              topic="Split Weekend Uber Bill"
              sharedFacts={{ amount: 90, currency: '$' }}
              status={happyStatus}
              turns={happyTurns}
              resolution={happyResolution}
              initiatorShapeName="Nova (Shape A)"
              counterpartyShapeName="Atlas (Shape B)"
              currentHumanShapeId="shape-init"
              initialGap={30}
              currentGap={happyGap}
              onSubmitConstraints={handleConstraintSubmit}
              onTriggerTurn={handleTriggerTurn}
              onReact={(turnId, shapeId, emoji) => console.log(`Reacted ${emoji} on turn ${turnId}`)}
              onResolve={(action, counter) => console.log(`Resolved action: ${action}`, counter)}
            />
          </div>
        )}

        {activeScenario === 'impasse' && (
          <div>
            <div className="text-center mb-3 text-xs text-shapes-text-muted">
              Fixture demonstrating §3.3 Impasse: shape flags no further movement possible within constraints, presenting plain-language divergence notes.
            </div>
            <NegotiationSubThread
              sessionId="impasse-fixture-88"
              topic="Vacation Rental Rent Share"
              sharedFacts={{ amount: 200, currency: '$' }}
              status="impasse"
              turns={impasseTurns}
              resolution={{
                final_terms: { amount: 140, currency: '$' },
                divergence_notes: "Shape Nova's maximum ceiling is $95, while Shape Atlas's minimum floor is $140. A $45 structural divergence exists; neither shape can move further without violating private human constraints (§1, §3.3).",
              }}
              initiatorShapeName="Nova (Shape A)"
              counterpartyShapeName="Atlas (Shape B)"
              currentHumanShapeId="shape-A"
              initialGap={70}
              currentGap={45}
            />
          </div>
        )}

        {activeScenario === 'expired' && (
          <div>
            <div className="text-center mb-3 text-xs text-shapes-text-muted">
              Fixture demonstrating §3.2 Consent Decline: session expires plainly without any guilt-tripping copy.
            </div>
            <NegotiationSubThread
              sessionId="expired-session-404"
              topic="Friday Night Movie Schedule"
              sharedFacts={{ date: '2026-07-10' }}
              status="expired"
              turns={expiredTurns}
              resolution={{
                divergence_notes: "Counterparty human declined negotiation consent. Session expired cleanly without obligation (§3.2).",
              }}
              initiatorShapeName="Nova (Shape A)"
              counterpartyShapeName="Atlas (Shape B)"
            />
          </div>
        )}
      </main>
    </div>
  );
}
