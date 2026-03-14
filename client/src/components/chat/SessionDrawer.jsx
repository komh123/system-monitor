import React from 'react';

const MODEL_BADGES = {
  sonnet: 'bg-blue-500/20 text-blue-400',
  opus: 'bg-purple-500/20 text-purple-400',
  haiku: 'bg-green-500/20 text-green-400'
};

function SessionDrawer({ open, sessions, activeId, onSelect, onNew, onClose, onDelete }) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 left-0 bottom-0 w-72 bg-slate-800 border-r border-slate-700 z-50 transform transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } sm:relative sm:translate-x-0 sm:w-64 sm:shrink-0 sm:block ${!open && 'sm:block hidden'}`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-700">
            <h2 className="text-sm font-semibold">Sessions</h2>
            <button
              onClick={onNew}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-medium transition-colors"
            >
              + New
            </button>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No sessions yet
              </div>
            ) : (
              sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onSelect(s.id); onClose(); }}
                  className={`w-full text-left px-3 py-3 border-b border-slate-700/50 transition-colors btn-inline ${
                    s.id === activeId
                      ? 'bg-slate-700/50'
                      : 'hover:bg-slate-700/30 active:bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{s.sessionName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MODEL_BADGES[s.model] || MODEL_BADGES.sonnet}`}>
                      {s.model}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{s.messageCount} msgs</span>
                    <span>{new Date(s.lastActivity).toLocaleDateString()}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default SessionDrawer;
