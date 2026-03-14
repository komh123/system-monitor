import React from 'react';

const MODES = [
  {
    id: 'ask',
    label: 'Ask',
    description: 'Normal conversation mode',
    icon: '💬',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30'
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Planning mode - creates implementation plans',
    icon: '📋',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/40 hover:bg-purple-500/30'
  },
  {
    id: 'bypass',
    label: 'Bypass',
    description: 'Direct execution without permission checks',
    icon: '⚡',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
  }
];

function ModeSelector({ currentMode = 'ask', onModeChange }) {
  const currentModeObj = MODES.find(m => m.id === currentMode) || MODES[0];

  return (
    <div className="flex items-center gap-1">
      {MODES.map(mode => (
        <button
          key={mode.id}
          onClick={() => onModeChange(mode.id)}
          className={`px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
            currentMode === mode.id
              ? mode.color
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-300'
          }`}
          title={mode.description}
        >
          <span className="hidden sm:inline mr-1">{mode.icon}</span>
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export default ModeSelector;
