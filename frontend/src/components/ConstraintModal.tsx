import React, { useState } from 'react';

export interface ConstraintModalProps {
  isOpen: boolean;
  topic: string;
  sharedAmount?: number;
  onClose: () => void;
  onSubmit: (floor: Record<string, any>, ceiling: Record<string, any>, priorities: Record<string, any>) => void;
}

export const ConstraintModal: React.FC<ConstraintModalProps> = ({
  isOpen,
  topic,
  sharedAmount = 100,
  onClose,
  onSubmit,
}) => {
  const [floorVal, setFloorVal] = useState<number>(Math.round(sharedAmount * 0.3));
  const [ceilingVal, setCeilingVal] = useState<number>(Math.round(sharedAmount * 0.6));
  const [priority, setPriority] = useState<string>('fairness');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(
      { amount: floorVal, currency: '$' },
      { amount: ceilingVal, currency: '$' },
      { [priority]: 1 }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-shapes-void/80 backdrop-blur-sm p-4">
      {/* Modal style: --shapes-bg-surface-raised, inputs with --shapes-border-strong focus rings in --shapes-violet-500 (§7.3) */}
      <div className="w-full max-w-md bg-shapes-surface-raised border border-[var(--shapes-border-strong)] rounded-shapes-lg shadow-shapes-glow p-6 transition-all">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--shapes-border-subtle)] mb-4">
          <h3 className="text-base font-bold text-shapes-text-primary tracking-wide">
            Private Constraint Capture
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-shapes-text-muted hover:text-shapes-text-primary font-bold text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <p className="text-xs text-shapes-text-secondary mb-5 leading-relaxed">
          Set your private terms for <strong className="text-shapes-violet-300">"{topic}"</strong>. Never shown to the other shape or human (§1).
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Floor Slider/Stepper (§7.3: structured, never open free-text) */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-shapes-text-primary">
              <label htmlFor="floor-input">Minimum Floor ($):</label>
              <span className="text-shapes-violet-300 font-bold">${floorVal}</span>
            </div>
            <input
              id="floor-input"
              type="range"
              min="0"
              max={sharedAmount * 1.5}
              step="5"
              value={floorVal}
              onChange={(e) => setFloorVal(Number(e.target.value))}
              className="w-full accent-shapes-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-shapes-text-muted">
              <span>$0</span>
              <span>${sharedAmount * 1.5}</span>
            </div>
          </div>

          {/* Ceiling Slider/Stepper */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-shapes-text-primary">
              <label htmlFor="ceiling-input">Maximum Ceiling ($):</label>
              <span className="text-shapes-cyan-400 font-bold">${ceilingVal}</span>
            </div>
            <input
              id="ceiling-input"
              type="range"
              min="0"
              max={sharedAmount * 1.5}
              step="5"
              value={ceilingVal}
              onChange={(e) => setCeilingVal(Number(e.target.value))}
              className="w-full accent-shapes-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-shapes-text-muted">
              <span>$0</span>
              <span>${sharedAmount * 1.5}</span>
            </div>
          </div>

          {/* Priority Ranking Single-Select (§7.3) */}
          <div className="space-y-1.5">
            <label htmlFor="priority-select" className="block text-xs font-semibold text-shapes-text-primary">
              Primary Optimization Priority:
            </label>
            <select
              id="priority-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-shapes-surface text-shapes-text-primary text-xs p-2.5 rounded-shapes-sm border border-[var(--shapes-border-strong)] focus:outline-none focus:ring-2 focus:ring-shapes-violet-500 transition"
            >
              <option value="fairness">Equal Fairness (Split Evenly)</option>
              <option value="cost">Minimize Personal Cost</option>
              <option value="speed">Fastest Agreement</option>
              <option value="relationship">Preserve Relationship Harmony</option>
            </select>
          </div>

          <div className="pt-3 flex justify-end space-x-3 border-t border-[var(--shapes-border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-shapes-sm bg-shapes-void hover:bg-shapes-hover text-xs font-medium text-shapes-text-secondary transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-shapes-sm bg-shapes-violet-500 hover:bg-shapes-violet-700 text-xs font-bold text-white transition shadow-shapes-glow"
            >
              Lock in Private Constraints
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
