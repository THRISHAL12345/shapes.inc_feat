import React, { useState } from 'react';

export interface NudgeReactionsProps {
  shapeId: string;
  isOwnShape: boolean;
  onReact?: (emoji: string) => void;
}

export const NudgeReactions: React.FC<NudgeReactionsProps> = ({
  shapeId,
  isOwnShape,
  onReact,
}) => {
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  // Strict Rule §7.2: small emoji reaction row under ONLY your shape's cards (never under the other shape's cards)
  if (!isOwnShape) {
    return null;
  }

  const emojis = ['👍', '👎', '❤️', '🔥', '🙏', '⚡'];

  const handleEmojiClick = (emoji: string) => {
    setSelectedEmoji(emoji);
    if (onReact) {
      onReact(emoji);
    }
  };

  return (
    <div className="flex items-center space-x-1.5 mt-2 pt-1 border-t border-[var(--shapes-border-subtle)]">
      <span className="text-[10px] text-shapes-text-muted font-medium mr-1 uppercase tracking-wider">
        Nudge:
      </span>
      {emojis.map((emoji) => {
        const isSelected = selectedEmoji === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handleEmojiClick(emoji)}
            className={`text-xs px-1.5 py-0.5 rounded transition-all duration-150 ${
              isSelected
                ? 'bg-shapes-violet-500/30 border border-shapes-violet-500 text-white scale-110 shadow-shapes-glow'
                : 'bg-shapes-void/60 hover:bg-shapes-hover text-shapes-text-secondary border border-transparent'
            }`}
            title="React to guide your shape's next turn privately"
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
};
