import React from 'react';

function ContextIndicator({ percentage = 0, onCompact }) {
  // Color based on usage
  const getColor = () => {
    if (percentage >= 90) return 'text-red-400 bg-red-500/20 border-red-500/40';
    if (percentage >= 70) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/40';
    return 'text-green-400 bg-green-500/20 border-green-500/40';
  };

  const getBarColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="flex items-center gap-2">
      {/* Context percentage badge */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium ${getColor()}`}>
        <span className="text-[10px]">📊</span>
        <span>{percentage}%</span>
      </div>

      {/* Progress bar */}
      <div className="hidden sm:flex items-center gap-2 flex-1 max-w-32">
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
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
          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-medium transition-colors"
          title="Compress conversation context (~70% token reduction)"
        >
          Compact
        </button>
      )}
    </div>
  );
}

export default ContextIndicator;
