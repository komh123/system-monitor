import React, { useState, useEffect } from 'react';

const MODEL_BADGES = {
  sonnet: 'bg-blue-500/20 text-blue-400',
  opus: 'bg-purple-500/20 text-purple-400',
  haiku: 'bg-green-500/20 text-green-400'
};

function SessionDrawer({ open, sessions, activeId, onSelect, onNew, onClose, onDelete }) {
  // Collapsed state (desktop only) - saved to localStorage
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sessionDrawerCollapsed');
    return saved === 'true';
  });

  // Save collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('sessionDrawerCollapsed', collapsed);
  }, [collapsed]);

  const toggleCollapse = () => {
    setCollapsed(prev => !prev);
  };

  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 left-0 bottom-0 bg-slate-800 border-r border-slate-700 z-50 transform transition-all duration-200 ${
        // Mobile: slide in/out based on 'open' prop
        open ? 'translate-x-0' : '-translate-x-full'
      } sm:relative sm:translate-x-0 ${
        // Desktop: change width based on collapsed state
        collapsed ? 'sm:w-14' : 'sm:w-64'
      } w-72 sm:shrink-0`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`flex items-center p-3 border-b border-slate-700 ${
            collapsed ? 'sm:justify-center' : 'sm:justify-between'
          }`}>
            {!collapsed && (
              <h2 className="text-sm font-semibold">Sessions</h2>
            )}
            <button
              onClick={onNew}
              className={`px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-medium transition-colors ${
                collapsed ? 'sm:px-2' : ''
              }`}
              title={collapsed ? 'New session' : ''}
            >
              {collapsed ? (
                <span className="hidden sm:inline">+</span>
              ) : (
                '+ New'
              )}
            </button>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className={`text-center py-8 text-slate-500 text-xs ${
                collapsed ? 'hidden sm:block' : ''
              }`}>
                {collapsed ? '📭' : 'No sessions yet'}
              </div>
            ) : (
              sessions.map(s => (
                <div
                  key={s.id}
                  className={`w-full border-b border-slate-700/50 transition-colors ${
                    s.id === activeId ? 'bg-slate-700/50' : ''
                  }`}
                >
                  <div className="flex items-stretch">
                    <button
                      onClick={() => { onSelect(s.id); onClose(); }}
                      className={`flex-1 text-left transition-colors btn-inline ${
                        collapsed ? 'sm:px-2 sm:py-3 sm:justify-center' : 'px-3 py-3'
                      } ${
                        s.id === activeId
                          ? ''
                          : 'hover:bg-slate-700/30 active:bg-slate-700/50'
                      }`}
                      title={collapsed ? s.sessionName : ''}
                    >
                      {collapsed ? (
                        // Collapsed view: only show icon
                        <div className="hidden sm:flex flex-col items-center gap-1">
                          <span className="text-lg">{s.model === 'opus' ? '🟣' : s.model === 'haiku' ? '🟢' : '🔵'}</span>
                          <span className="text-[8px] text-slate-500">{s.messageCount}</span>
                        </div>
                      ) : (
                        // Expanded view: show full details
                        <>
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
                        </>
                      )}
                      {/* Mobile view (same as expanded) */}
                      <div className="sm:hidden">
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
                      </div>
                    </button>
                    {onDelete && !collapsed && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                        className="w-10 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
                        title="Delete session"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Toggle Button (desktop only) */}
          <div className="hidden sm:block border-t border-slate-700">
            <button
              onClick={toggleCollapse}
              className="w-full p-3 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex items-center justify-center"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="text-base">
                {collapsed ? '»' : '«'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default SessionDrawer;
