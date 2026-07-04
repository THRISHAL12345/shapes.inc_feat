import React, { useState, useEffect } from 'react';
import { NegotiationSubThread } from './NegotiationSubThread';
import * as api from '../services/api';
import { TurnItem } from './TranscriptView';

export const LiveNegotiationView: React.FC = () => {
  const [session, setSession] = useState<api.SessionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Form State
  const [topic, setTopic] = useState<string>('split the dinner bill');
  const [amount, setAmount] = useState<number>(120);
  const [initFloor, setInitFloor] = useState<number>(40);
  const [initCeiling, setInitCeiling] = useState<number>(70);
  const [counterFloor, setCounterFloor] = useState<number>(50);
  const [counterCeiling, setCounterCeiling] = useState<number>(80);

  // Computed gap for UI meter
  const [currentGap, setCurrentGap] = useState<number>(Math.abs(counterFloor - initCeiling));

  // Subscribe to SSE whenever session is active or pending
  useEffect(() => {
    if (!session || !session.id) return;

    console.log(`[SSE] Subscribing to stream for session ${session.id}...`);
    const unsubscribe = api.subscribeToSessionStream(
      session.id,
      (event) => {
        console.log(`[SSE] Received event: ${event.type}`, event.data);
        // Refresh session data when an event is pushed from backend
        api.getSession(session.id)
          .then((updated) => {
            setSession(updated);
            updateGapFromTurns(updated.turns || []);
          })
          .catch((err) => console.error('Failed to refresh session on SSE event:', err));
      },
      (err) => {
        console.warn('[SSE] Connection error / closed:', err);
      }
    );

    return () => {
      console.log(`[SSE] Unsubscribing from session ${session.id}`);
      unsubscribe();
    };
  }, [session?.id]);

  const updateGapFromTurns = (turns: TurnItem[]) => {
    if (turns.length >= 2) {
      const last = turns[turns.length - 1];
      const prev = turns[turns.length - 2];
      if (last.offer?.amount && prev.offer?.amount) {
        setCurrentGap(Math.abs(last.offer.amount - prev.offer.amount));
      }
    } else if (turns.length === 1) {
      setCurrentGap(Math.abs(amount - turns[0].offer.amount));
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const created = await api.createSession({
        topic,
        sharedFacts: { amount, total: amount, currency: '$' },
        initiatorHumanId: 'human-nova',
        initiatorShapeId: 'shape-nova',
        counterpartyHumanId: 'human-atlas',
        counterpartyShapeId: 'shape-atlas',
        initiatorFloor: { amount: initFloor },
        initiatorCeiling: { amount: initCeiling },
        initiatorPriorities: { budget: 1 },
      });
      setSession(created);
      setCurrentGap(Math.abs(counterFloor - initCeiling));
      setInfoMessage(`Session created! Waiting for Shape Atlas (Counterparty) consent...`);
    } catch (err: any) {
      setError(err.message || 'Failed to create session. Is backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptConsent = async () => {
    if (!session) return;
    const counterparty = session.participants.find((p) => p.role === 'counterparty');
    if (!counterparty) return;

    setLoading(true);
    setError(null);
    try {
      const updated = await api.submitConsent(session.id, {
        participantId: counterparty.id,
        accept: true,
        floor: { amount: counterFloor },
        ceiling: { amount: counterCeiling },
        priorities: { fairness: 1 },
      });
      setSession(updated);
      setInfoMessage('Consent accepted! Session active. Click "Trigger AI Turn" to watch shapes negotiate.');
    } catch (err: any) {
      setError(err.message || 'Failed to submit consent');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerTurn = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.triggerTurn(session.id);
      setSession(updated);
      updateGapFromTurns(updated.turns || []);
      setInfoMessage(`Turn #${(updated.turns || []).length} generated!`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate turn. Maybe session is already resolved or locked?');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (action: 'accept' | 'counter' | 'ignore', counterOffer?: Record<string, any>) => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await api.resolveSession(session.id, {
        humanId: 'human-nova',
        action,
        counterOffer,
      });
      setInfoMessage(`Action '${action}' recorded via backend: ${res.message}`);
    } catch (err: any) {
      setError(err.message || 'Failed to record resolution');
    } finally {
      setLoading(false);
    }
  };

  const handleReact = async (turnId: string, shapeId: string, emoji: string) => {
    if (!session) return;
    try {
      await api.submitReaction(session.id, shapeId, emoji);
      setInfoMessage(`Reaction ${emoji} recorded on backend for shape ${shapeId}!`);
    } catch (err: any) {
      console.error('Failed to send reaction:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-shapes-surface p-4 rounded-shapes-md border border-[var(--shapes-border-subtle)]">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-shapes-violet-300 to-shapes-cyan-400 uppercase tracking-wider">
              ⚡ Live API & Realtime SSE Stream Mode
            </h2>
            <p className="text-xs text-shapes-text-secondary mt-1">
              Directly connected to Node.js backend endpoints (`/api/negotiate/*`) and Server-Sent Events (`EventSource`).
            </p>
          </div>
          {session && (
            <button
              type="button"
              onClick={() => { setSession(null); setError(null); setInfoMessage(null); }}
              className="text-xs text-shapes-violet-300 hover:text-white underline"
            >
              Start New Live Session
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-3 py-2 rounded-shapes-sm text-xs mb-4">
            <strong>API Error:</strong> {error}
          </div>
        )}

        {infoMessage && (
          <div className="bg-shapes-violet-900/40 border border-shapes-violet-500/50 text-shapes-violet-100 px-3 py-2 rounded-shapes-sm text-xs mb-4 flex justify-between items-center">
            <span>{infoMessage}</span>
            <button onClick={() => setInfoMessage(null)} className="text-xs hover:text-white ml-2">✕</button>
          </div>
        )}

        {!session ? (
          <form onSubmit={handleCreateSession} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-shapes-text-secondary mb-1">Negotiation Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-shapes-void border border-[var(--shapes-border-strong)] rounded-shapes-sm p-2 text-shapes-text-primary focus:outline-none focus:border-shapes-violet-500"
                  required
                />
              </div>
              <div>
                <label className="block text-shapes-text-secondary mb-1">Shared Amount ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-shapes-void border border-[var(--shapes-border-strong)] rounded-shapes-sm p-2 text-shapes-text-primary focus:outline-none focus:border-shapes-violet-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--shapes-border-subtle)]">
              <div className="p-3 bg-shapes-void rounded-shapes-sm border border-[var(--shapes-border-subtle)]">
                <div className="font-bold text-shapes-violet-300 mb-2">Initiator Human (Nova) Private Constraints</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-shapes-text-muted mb-1">Floor ($)</label>
                    <input
                      type="number"
                      value={initFloor}
                      onChange={(e) => setInitFloor(Number(e.target.value))}
                      className="w-full bg-shapes-surface border border-[var(--shapes-border-strong)] rounded p-1.5 text-shapes-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-shapes-text-muted mb-1">Ceiling ($)</label>
                    <input
                      type="number"
                      value={initCeiling}
                      onChange={(e) => setInitCeiling(Number(e.target.value))}
                      className="w-full bg-shapes-surface border border-[var(--shapes-border-strong)] rounded p-1.5 text-shapes-text-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-shapes-void rounded-shapes-sm border border-[var(--shapes-border-subtle)]">
                <div className="font-bold text-shapes-cyan-400 mb-2">Counterparty Human (Atlas) Private Constraints</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-shapes-text-muted mb-1">Floor ($)</label>
                    <input
                      type="number"
                      value={counterFloor}
                      onChange={(e) => setCounterFloor(Number(e.target.value))}
                      className="w-full bg-shapes-surface border border-[var(--shapes-border-strong)] rounded p-1.5 text-shapes-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-shapes-text-muted mb-1">Ceiling ($)</label>
                    <input
                      type="number"
                      value={counterCeiling}
                      onChange={(e) => setCounterCeiling(Number(e.target.value))}
                      className="w-full bg-shapes-surface border border-[var(--shapes-border-strong)] rounded p-1.5 text-shapes-text-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-shapes-violet-500 hover:bg-shapes-violet-700 text-white font-bold py-2 px-6 rounded-shapes-sm shadow-shapes-glow transition-all disabled:opacity-50"
              >
                {loading ? 'Initiating Session...' : '🚀 Launch Live Negotiation Session'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {session.status === 'pending_consent' && (
              <div className="bg-shapes-void p-4 rounded-shapes-md border border-[var(--shapes-border-strong)] flex flex-col sm:flex-row justify-between items-center gap-3">
                <div>
                  <div className="text-xs font-bold text-shapes-cyan-400 uppercase">Awaiting Consent</div>
                  <p className="text-xs text-shapes-text-secondary mt-1">
                    Shape Atlas received a DM card. Consent required before AI negotiation spawns (§1.2, §3.2).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAcceptConsent}
                  disabled={loading}
                  className="bg-shapes-cyan-400 hover:bg-cyan-500 text-shapes-void font-bold py-2 px-4 rounded-shapes-sm text-xs transition-all whitespace-nowrap"
                >
                  {loading ? 'Submitting...' : '✓ Accept Consent as Atlas'}
                </button>
              </div>
            )}

            {session.status === 'active' && (
              <div className="bg-shapes-void p-3 rounded-shapes-md border border-[var(--shapes-border-subtle)] flex justify-between items-center">
                <span className="text-xs text-shapes-text-secondary">
                  Session Live. Server turn alternation enforced by Redis lock (§5.3).
                </span>
                <button
                  type="button"
                  onClick={handleTriggerTurn}
                  disabled={loading}
                  className="bg-shapes-violet-500 hover:bg-shapes-violet-700 text-white font-bold py-2 px-4 rounded-shapes-sm text-xs shadow-shapes-glow transition-all"
                >
                  {loading ? '🤖 Shape Thinking...' : '🤖 Trigger Next AI Turn'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {session && (
        <NegotiationSubThread
          sessionId={session.id}
          topic={session.topic}
          sharedFacts={session.shared_facts || { amount, currency: '$' }}
          status={session.status}
          turns={session.turns || []}
          resolution={session.resolution}
          initiatorShapeName="Nova (Shape A)"
          counterpartyShapeName="Atlas (Shape B)"
          currentHumanShapeId="shape-nova"
          initialGap={Math.abs(counterFloor - initFloor)}
          currentGap={currentGap}
          onTriggerTurn={handleTriggerTurn}
          onReact={handleReact}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
};
