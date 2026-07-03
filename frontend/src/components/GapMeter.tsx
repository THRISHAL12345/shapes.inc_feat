import React from 'react';

export interface GapMeterProps {
  initialGap?: number;
  currentGap?: number;
  currency?: string;
  unit?: string;
}

export const GapMeter: React.FC<GapMeterProps> = ({
  initialGap,
  currentGap,
  currency = '$',
  unit = '',
}) => {
  if (currentGap === undefined || currentGap === null) {
    return null;
  }

  // Calculate percentage closed if initialGap exists, else default to color sizing
  const maxGap = initialGap && initialGap > 0 ? initialGap : Math.max(currentGap * 2, 100);
  const progressPercent = Math.max(0, Math.min(100, ((maxGap - currentGap) / maxGap) * 100));

  // Determine color interpolation class based on progress
  let barColorClass = 'bg-shapes-danger';
  if (progressPercent > 66 || currentGap <= 10) {
    barColorClass = 'bg-shapes-success';
  } else if (progressPercent > 33) {
    barColorClass = 'bg-shapes-warning';
  }

  const formatValue = (val: number) => {
    if (unit === 'time' || currency === '') return `${val}${unit}`;
    return `${currency}${val}`;
  };

  const labelText = initialGap !== undefined && initialGap > currentGap
    ? `${formatValue(initialGap)} apart → ${formatValue(currentGap)} apart`
    : `${formatValue(currentGap)} apart`;

  return (
    <div className="w-full px-6 py-3 bg-shapes-surface border-b border-[var(--shapes-border-subtle)]">
      <div className="flex items-center justify-between text-xs text-shapes-text-secondary font-medium mb-1.5">
        <span>Gap Meter</span>
        <span className="font-semibold text-shapes-text-primary">{labelText}</span>
      </div>
      <div className="w-full h-2.5 bg-shapes-void rounded-full overflow-hidden p-0.5 border border-[var(--shapes-border-subtle)]">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColorClass} shadow-shapes-glow`}
          style={{ width: `${Math.max(15, progressPercent)}%` }}
        />
      </div>
    </div>
  );
};
