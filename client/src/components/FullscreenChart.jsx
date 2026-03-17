import React, { useState } from 'react';

/**
 * Wraps any chart with a fullscreen toggle button.
 * On mobile, charts are small — tap the expand button to view fullscreen.
 */
function FullscreenChart({ title, children, height = 'h-40 sm:h-64' }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          <button
            onClick={() => setIsFullscreen(false)}
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-600 transition-colors text-lg"
            title="Exit fullscreen"
          >
            {'\u2715'}
          </button>
        </div>
        {/* Chart fills remaining space */}
        <div className="flex-1 p-3 sm:p-6 min-h-0">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Fullscreen button - always visible, prominent on mobile */}
      <button
        onClick={() => setIsFullscreen(true)}
        className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg bg-slate-700/80 hover:bg-slate-600 active:bg-slate-500 border border-slate-600 text-slate-300 hover:text-white transition-colors backdrop-blur-sm"
        title="View fullscreen"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
        </svg>
      </button>
      {/* Normal chart container */}
      <div className={height}>
        {children}
      </div>
    </div>
  );
}

export default FullscreenChart;
