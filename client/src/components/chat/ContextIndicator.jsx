import React from 'react';

function ContextIndicator({ percentage = 0, used = 0, total = 200000, onCompact }) {
  // Color based on usage
  const getColor = () => {
    if (percentage >= 95) return 'text-red-300 bg-red-600/30 border-red-400/60 animate-pulse';
    if (percentage >= 90) return 'text-red-400 bg-red-500/20 border-red-500/40';
    if (percentage >= 70) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/40';
    return 'text-green-400 bg-green-500/20 border-green-500/40';
  };

  const getBarColor = () => {
    if (percentage >= 95) return 'bg-red-500 animate-pulse';
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Format tokens: 150000 → "150K", 1000000 → "1M"
  const formatTokens = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  };

  const is1M = total >= 1000000;

  return (
    <div className="flex items-center gap-2">
      {/* Context percentage badge */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium ${getColor()}`}
        title={`${used.toLocaleString()} / ${total.toLocaleString()} tokens`}
      >
        {percentage >= 95 && <span className="hidden sm:inline">Context</span>}
        <span>{percentage.toFixed(1)}%</span>
        {/* Show token count on desktop */}
        <span className="hidden md:inline text-[10px] opacity-70">
          {formatTokens(used)}/{formatTokens(total)}
        </span>
        {/* 1M badge */}
        {is1M && (
          <span className="hidden sm:inline text-[9px] bg-violet-500/30 text-violet-300 px-1 rounded">1M</span>
        )}
      </div>

      {/* Progress bar (visible on all sizes, smaller on mobile) */}
      <div className="flex items-center gap-2 flex-1 max-w-16 sm:max-w-32">
        <div className="flex-1 h-1 sm:h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Compact button (show when >= 70%) */}
      {percentage >= 70 && onCompact && (
        <button
          onClick={onCompact}
          className="px-2.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-medium transition-colors"
          title="Compress conversation context (~70% token reduction)"
        >
          Compact
        </button>
      )}
    </div>
  );
}

export default ContextIndicator;
