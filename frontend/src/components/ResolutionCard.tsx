import React, { useState } from 'react';

export interface ResolutionCardProps {
  outcome: 'converged' | 'impasse' | 'timeout' | string;
  finalTerms?: Record<string, any> | null;
  divergenceNotes?: string | null;
  onResolve: (action: 'accept' | 'counter' | 'ignore', counterOffer?: Record<string, any>) => void;
}

export const ResolutionCard: React.FC<ResolutionCardProps> = ({
  outcome,
  finalTerms,
  divergenceNotes,
  onResolve,
}) => {
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterAmount, setCounterAmount] = useState<string>('');
  const [resolvedAction, setResolvedAction] = useState<string | null>(null);

  const isConverged = outcome === 'converged';

  const handleAction = (action: 'accept' | 'counter' | 'ignore') => {
    if (action === 'counter' && !showCounterInput) {
      setShowCounterInput(true);
      return;
    }

    let counterPayload: Record<string, any> | undefined;
    if (action === 'counter') {
      const num = parseFloat(counterAmount);
      if (!isNaN(num)) {
        counterPayload = { amount: num, currency: '$' };
      }
    }

    setResolvedAction(action);
    onResolve(action, counterPayload);
  };

  const formatTerms = (terms?: Record<string, any> | null) => {
    if (!terms) return 'No terms finalized.';
    if (terms.amount !== undefined) return `Recommended Settlement: ${terms.currency || '$'}${terms.amount}`;
    if (terms.date || terms.time) return `Recommended Schedule: ${terms.date || ''} ${terms.time || ''}`.trim();
    return JSON.stringify(terms);
  };

  return (
    <div className="p-5 bg-shapes-surface-raised border border-[var(--shapes-border-strong)] rounded-shapes-lg shadow-shapes-glow m-4 transition-all duration-300">
      <div className="flex items-center space-x-2 mb-2">
        <span className={`w-3 h-3 rounded-full ${isConverged ? 'bg-shapes-success' : 'bg-shapes-warning'}`} />
        <h4 className="text-base font-bold text-shapes-text-primary uppercase tracking-wider">
          {isConverged ? 'Negotiation Converged' : `Negotiation ${outcome.charAt(0).toUpperCase() + outcome.slice(1)}`}
        </h4>
      </div>

      <div className="p-3 bg-shapes-void rounded-shapes-md border border-[var(--shapes-border-subtle)] my-3 text-center">
        <div className="text-lg font-extrabold text-shapes-violet-300 tracking-tight">
          {formatTerms(finalTerms)}
        </div>
      </div>

      {divergenceNotes && (
        <p className="text-xs text-shapes-text-secondary italic mb-4 bg-shapes-surface p-2 rounded border border-[var(--shapes-border-subtle)]">
          💡 {divergenceNotes}
        </p>
      )}

      {resolvedAction ? (
        <div className="text-center py-2 text-sm font-semibold text-shapes-success bg-shapes-void/50 rounded border border-shapes-success/30">
          ✓ Action recorded: <span className="uppercase">{resolvedAction}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {showCounterInput && (
            <div className="flex items-center space-x-2 bg-shapes-void p-2 rounded border border-[var(--shapes-border-strong)]">
              <span className="text-xs text-shapes-text-muted">New counter amount ($):</span>
              <input
                type="number"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                placeholder="e.g. 55"
                className="w-24 bg-shapes-surface text-shapes-text-primary px-2 py-1 rounded text-xs border border-[var(--shapes-border-strong)] focus:outline-none focus:border-shapes-violet-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-1">
            <button
              type="button"
              onClick={() => handleAction('ignore')}
              className="px-4 py-2 rounded-shapes-sm bg-shapes-void hover:bg-shapes-hover text-xs font-medium text-shapes-text-muted hover:text-shapes-text-secondary transition"
            >
              Ignore
            </button>
            <button
              type="button"
              onClick={() => handleAction('counter')}
              className="px-4 py-2 rounded-shapes-sm bg-shapes-surface hover:bg-shapes-hover border border-[var(--shapes-border-strong)] text-xs font-medium text-shapes-text-primary transition shadow-sm"
            >
              {showCounterInput ? 'Submit Counter' : 'Counter'}
            </button>
            <button
              type="button"
              onClick={() => handleAction('accept')}
              className="px-5 py-2 rounded-shapes-sm bg-shapes-violet-500 hover:bg-shapes-violet-700 text-xs font-bold text-white transition shadow-shapes-glow"
            >
              Accept Deal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
