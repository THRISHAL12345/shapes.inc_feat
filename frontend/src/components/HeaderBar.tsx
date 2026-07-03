import React from 'react';

export interface HeaderBarProps {
  topic: string;
  initiatorShapeName?: string;
  counterpartyShapeName?: string;
  status: 'pending_consent' | 'active' | 'converged' | 'impasse' | 'expired' | 'timeout' | string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  topic,
  initiatorShapeName = 'Shape A',
  counterpartyShapeName = 'Shape B',
  status,
}) => {
  const getStatusLabel = () => {
    switch (status) {
      case 'pending_consent': return 'Pending';
      case 'active': return 'Live';
      case 'converged': return 'Converged';
      case 'impasse': return 'Impasse';
      case 'expired': return 'Expired';
      case 'timeout': return 'Timeout';
      default: return status;
    }
  };

  const isLive = status === 'active';

  return (
    <div className="flex items-center justify-between p-4 bg-shapes-surface border-b border-[var(--shapes-border-subtle)] rounded-t-shapes-lg">
      {/* Initiator Shape Avatar (left) */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-shapes-violet-500 flex items-center justify-center text-white font-bold border border-[var(--shapes-border-strong)] shadow-shapes-glow">
          {initiatorShapeName.charAt(0).toUpperCase()}
        </div>
        <span className="text-shapes-text-primary font-medium text-sm">{initiatorShapeName}</span>
      </div>

      {/* Topic and Status Pill */}
      <div className="flex flex-col items-center">
        <h3 className="text-shapes-text-primary font-semibold text-base tracking-wide">{topic}</h3>
        <div className="mt-1 flex items-center space-x-1.5">
          {isLive && (
            <span className="w-2 h-2 rounded-full bg-shapes-success animate-pulse shadow-[0_0_8px_var(--shapes-success)]" />
          )}
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              isLive
                ? 'bg-shapes-violet-900 text-shapes-violet-300 border border-[var(--shapes-border-strong)] shadow-shapes-glow animate-pulse'
                : status === 'converged'
                ? 'bg-green-900/40 text-shapes-success border border-green-500/30'
                : status === 'impasse'
                ? 'bg-red-900/40 text-shapes-danger border border-red-500/30'
                : 'bg-shapes-hover text-shapes-text-secondary'
            }`}
          >
            {getStatusLabel()}
          </span>
        </div>
      </div>

      {/* Counterparty Shape Avatar (right, mirror layout) */}
      <div className="flex items-center space-x-3 flex-row-reverse space-x-reverse">
        <div className="w-10 h-10 rounded-full bg-shapes-cyan-400 flex items-center justify-center text-shapes-void font-bold border border-[var(--shapes-border-strong)] shadow-[0_0_24px_rgba(92,225,230,0.25)]">
          {counterpartyShapeName.charAt(0).toUpperCase()}
        </div>
        <span className="text-shapes-text-primary font-medium text-sm">{counterpartyShapeName}</span>
      </div>
    </div>
  );
};
