import React from 'react';
import { NudgeReactions } from './NudgeReactions';

export interface TurnItem {
  id: string;
  turn_number: number;
  participant_id: string;
  role?: 'initiator' | 'counterparty';
  offer: Record<string, any>;
  rationale: string;
  created_at: string | Date;
}

export interface TranscriptViewProps {
  turns: TurnItem[];
  initiatorShapeName?: string;
  counterpartyShapeName?: string;
  currentHumanShapeId?: string;
  onReact?: (turnId: string, shapeId: string, emoji: string) => void;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  turns,
  initiatorShapeName = 'Shape A',
  counterpartyShapeName = 'Shape B',
  currentHumanShapeId,
  onReact,
}) => {
  if (!turns || turns.length === 0) {
    return (
      <div className="p-8 text-center bg-shapes-void text-shapes-text-muted text-sm italic border-b border-[var(--shapes-border-subtle)]">
        No negotiation turns yet. Awaiting initial shape offer...
      </div>
    );
  }

  const formatOfferHeadline = (offer: Record<string, any>) => {
    if (!offer || Object.keys(offer).length === 0) return 'No terms specified';
    if (offer.amount !== undefined) {
      const curr = offer.currency || '$';
      return `Offer: ${curr}${offer.amount}`;
    }
    if (offer.time || offer.date) {
      return `Proposed: ${offer.date || ''} ${offer.time || ''}`.trim();
    }
    return `Proposed Terms: ${JSON.stringify(offer)}`;
  };

  const formatTime = (timeVal: string | Date) => {
    try {
      const d = typeof timeVal === 'string' ? new Date(timeVal) : timeVal;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="p-4 bg-shapes-void space-y-4 max-h-[420px] overflow-y-auto border-b border-[var(--shapes-border-subtle)]">
      {turns.map((t) => {
        // Left-aligned for initiator's shape, right-aligned for counterparty's shape (§7.2)
        const isInitiator = t.turn_number % 2 !== 0 || t.role === 'initiator';
        const shapeName = isInitiator ? initiatorShapeName : counterpartyShapeName;
        const avatarColor = isInitiator ? 'bg-shapes-violet-500 text-white shadow-shapes-glow' : 'bg-shapes-cyan-400 text-shapes-void shadow-[0_0_16px_rgba(92,225,230,0.2)]';

        return (
          <div
            key={t.id || t.turn_number}
            className={`flex flex-col ${isInitiator ? 'items-start' : 'items-end'} w-full transition-all`}
          >
            <div className="flex items-center space-x-2 mb-1 px-1">
              {!isInitiator && <span className="text-[11px] text-shapes-text-muted">{formatTime(t.created_at)}</span>}
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${avatarColor}`}>
                {shapeName.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-semibold text-shapes-text-primary">{shapeName}</span>
              {isInitiator && <span className="text-[11px] text-shapes-text-muted">{formatTime(t.created_at)}</span>}
            </div>

            {/* Offer Card: background --shapes-bg-surface, border --shapes-border-subtle, --shapes-radius-md */}
            <div
              className={`max-w-[85%] p-3.5 bg-shapes-surface border border-[var(--shapes-border-subtle)] rounded-shapes-md shadow-sm ${
                isInitiator ? 'rounded-tl-none border-l-2 border-l-shapes-violet-500' : 'rounded-tr-none border-r-2 border-r-shapes-cyan-400'
              }`}
            >
              <div className="text-sm font-bold text-shapes-text-primary mb-1">
                {formatOfferHeadline(t.offer)}
              </div>
              <p className="text-xs text-shapes-text-secondary leading-relaxed font-normal">
                {t.rationale}
              </p>

              {/* Own-side Nudge Reactions (§7.2) */}
              <NudgeReactions
                shapeId={t.participant_id}
                isOwnShape={t.participant_id === currentHumanShapeId}
                onReact={(emoji) => onReact && onReact(t.id, t.participant_id, emoji)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
