import React, { useState } from 'react';
import ContextIndicator from './ContextIndicator.jsx';
import ModeSelector from './ModeSelector.jsx';

const MODEL_COLORS = {
  sonnet: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  'sonnet[1m]': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  opus: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  'opus[1m]': 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  haiku: 'bg-green-500/20 text-green-400 border-green-500/50'
};

function ChatHeader({
  session,
  models,
  onMenuToggle,
  onModelChange,
  onRename,
  onOpenPalette,
  contextUsage = 0,
  contextTokens = { used: 0, total: 200000 },
  onCompact,
  mode = 'ask',
  onModeChange
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session?.sessionName || '');

  const handleRename = () => {
    if (name.trim() && name !== session?.sessionName) {
      onRename(name.trim());
    }
    setEditing(false);
  };

  if (!session) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={onMenuToggle}
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-700 active:bg-slate-600 transition-colors sm:hidden"
          >
            <span className="text-lg">☰</span>
          </button>
          <span className="text-slate-400 text-sm">Select a session</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-2 sm:px-3 py-2 bg-slate-800 border-b border-slate-700">
      {/* Top row: Session name and basic controls */}
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        <button
          onClick={onMenuToggle}
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-700 active:bg-slate-600 transition-colors sm:hidden"
        >
          <span className="text-lg">☰</span>
        </button>

        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm min-w-0 flex-1 focus:outline-none focus:border-blue-500"
          />
        ) : (
          <button
            onClick={() => { setName(session.sessionName); setEditing(true); }}
            className="text-sm font-medium truncate min-w-0 text-left btn-inline hover:text-blue-400 transition-colors"
            title="Tap to rename"
          >
            {session.sessionName}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Command Palette Button */}
        <button
          onClick={onOpenPalette}
          className="h-8 px-2 rounded border border-slate-600 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors flex items-center gap-1"
          title="Command Palette (Ctrl+K)"
        >
          <span>{'\u2315'}</span>
          <kbd className="hidden sm:inline text-xs">K</kbd>
        </button>

        <select
          value={session.model}
          onChange={(e) => onModelChange(e.target.value)}
          className={`px-2 py-1 rounded border text-xs font-medium appearance-none cursor-pointer bg-transparent ${MODEL_COLORS[session.model] || MODEL_COLORS.sonnet}`}
          style={{ minWidth: '70px', minHeight: '32px' }}
        >
          {(models || []).map(m => (
            <option key={m.id} value={m.id}>{m.id}</option>
          ))}
        </select>

        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          session.status === 'running' ? 'bg-green-400' :
          session.status === 'starting' ? 'bg-yellow-400 animate-pulse' :
          session.status === 'crashed' ? 'bg-red-400' :
          'bg-slate-500'
        }`} title={session.status} />
        </div>
      </div>

      {/* Bottom row: Mode selector and context indicator */}
      <div className="flex items-center justify-between gap-2">
        <ModeSelector currentMode={mode} onModeChange={onModeChange} />
        <ContextIndicator percentage={contextUsage} used={contextTokens.used} total={contextTokens.total} onCompact={onCompact} />
      </div>
    </div>
  );
}

export default ChatHeader;
