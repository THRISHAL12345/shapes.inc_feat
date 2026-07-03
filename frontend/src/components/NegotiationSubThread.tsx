import React, { useState } from 'react';
import { HeaderBar } from './HeaderBar';
import { GapMeter } from './GapMeter';
import { TranscriptView, TurnItem } from './TranscriptView';
import { ResolutionCard } from './ResolutionCard';
import { ConstraintModal } from './ConstraintModal';

export interface NegotiationSubThreadProps {
  sessionId?: string;
  topic: string;
  sharedFacts?: Record<string, any>;
  status: string;
  turns: TurnItem[];
  resolution?: Record<string, any> | null;
  initiatorShapeName?: string;
  counterpartyShapeName?: string;
  currentHumanShapeId?: string;
  initialGap?: number;
  currentGap?: number;
  onReact?: (turnId: string, shapeId: string, emoji: string) => void;
  onResolve?: (action: 'accept' | 'counter' | 'ignore', counterOffer?: Record<string, any>) => void;
  onSubmitConstraints?: (floor: Record<string, any>, ceiling: Record<string, any>, priorities: Record<string, any>) => void;
  onTriggerTurn?: () => void;
}

export const NegotiationSubThread: React.FC<NegotiationSubThreadProps> = ({
  sessionId = 'test-session',
  topic,
  sharedFacts = { amount: 100 },
  status,
  turns,
  resolution,
  initiatorShapeName = 'Shape A',
  counterpartyShapeName = 'Shape B',
  currentHumanShapeId,
  initialGap = 50,
  currentGap = 20,
  onReact,
  onResolve,
  onSubmitConstraints,
  onTriggerTurn,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleModalSubmit = (floor: Record<string, any>, ceiling: Record<string, any>, priorities: Record<string, any>) => {
    setIsModalOpen(false);
    if (onSubmitConstraints) {
      onSubmitConstraints(floor, ceiling, priorities);
    }
  };

  const isResolved = status === 'converged' || status === 'impasse' || status === 'timeout' || status === 'expired';

  return (
    <div className="w-full max-w-2xl mx-auto my-6 bg-shapes-surface border border-[var(--shapes-border-strong)] rounded-shapes-lg shadow-shapes-glow overflow-hidden font-sans">
      {/* 1. Header Bar (§7.2) */}
      <HeaderBar
        topic={topic}
        initiatorShapeName={initiatorShapeName}
        counterpartyShapeName={counterpartyShapeName}
        status={status}
      />

      {/* 2. Gap Meter (§7.2) */}
      <GapMeter
        initialGap={initialGap}
        currentGap={currentGap}
        currency={sharedFacts.currency || '$'}
      />

      {/* 3. Action / Control Bar for test fixtures and constraints */}
      <div className="px-4 py-2 bg-shapes-void/70 border-b border-[var(--shapes-border-subtle)] flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="text-shapes-text-muted">Session ID: <code className="text-[10px] bg-shapes-surface px-1 py-0.5 rounded text-shapes-violet-300">{sessionId}</code></span>
        </div>
        <div className="flex items-center space-x-2">
          {status === 'pending_consent' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-2.5 py-1 rounded bg-shapes-violet-500 hover:bg-shapes-violet-700 text-white font-medium shadow-sm transition"
            >
              Set Private Constraints (§7.3)
            </button>
          )}
          {status === 'active' && onTriggerTurn && (
            <button
              type="button"
              onClick={onTriggerTurn}
              className="px-2.5 py-1 rounded bg-shapes-cyan-400 text-shapes-void hover:bg-cyan-300 font-bold shadow-sm transition"
            >
              ⚡ Trigger Next AI Turn (§3.3)
            </button>
          )}
        </div>
      </div>

      {/* 4. Transcript (§7.2) */}
      <TranscriptView
        turns={turns}
        initiatorShapeName={initiatorShapeName}
        counterpartyShapeName={counterpartyShapeName}
        currentHumanShapeId={currentHumanShapeId}
        onReact={onReact}
      />

      {/* 5. Resolution Card (§7.2) */}
      {isResolved && (
        <ResolutionCard
          outcome={status}
          finalTerms={resolution?.final_terms || (turns.length > 0 ? turns[turns.length - 1].offer : null)}
          divergenceNotes={resolution?.divergence_notes || (status === 'impasse' ? 'Both shapes reached constraints boundary without overlap.' : null)}
          onResolve={(action, counterOffer) => onResolve && onResolve(action, counterOffer)}
        />
      )}

      {/* 6. Private Constraint Modal (§7.3) */}
      <ConstraintModal
        isOpen={isModalOpen}
        topic={topic}
        sharedAmount={sharedFacts.amount || 100}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
};
