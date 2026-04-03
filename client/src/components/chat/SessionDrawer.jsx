import React, { useState, useEffect } from 'react';

const MODEL_BADGES = {
  sonnet: 'bg-blue-500/20 text-blue-400',
  opus: 'bg-purple-500/20 text-purple-400',
  haiku: 'bg-green-500/20 text-green-400'
};

function SessionDrawer({ open, sessions, activeId, onSelect, onNew, onClose, onDelete, projects, onProjectOpen, onNewProject, streamingSessionIds = new Set() }) {
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

  // Filter out project/deep-clean sessions from main session list
  const regularSessions = sessions.filter(s =>
    s.type !== 'deep-clean' && !s.type?.startsWith('project-')
  );

  // Check if a session is streaming (by session id)
  const isSessionStreaming = (sessionId) => streamingSessionIds.has(sessionId);

  // Check if a project is streaming (by looking up its sessionId)
  const isProjectStreaming = (proj) => proj.sessionId && streamingSessionIds.has(proj.sessionId);

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
        open ? 'translate-x-0' : '-translate-x-full'
      } sm:relative sm:translate-x-0 ${
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

          {/* Session List (regular sessions only) */}
          <div className="flex-1 overflow-y-auto">
            {regularSessions.length === 0 ? (
              <div className={`text-center py-8 text-slate-500 text-xs ${
                collapsed ? 'hidden sm:block' : ''
              }`}>
                {collapsed ? '\uD83D\uDCED' : 'No sessions yet'}
              </div>
            ) : (
              regularSessions.map(s => {
                const streaming = isSessionStreaming(s.id);
                return (
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
                          <div className="hidden sm:flex flex-col items-center gap-1 relative">
                            <span className="text-lg">{s.model === 'opus' || s.model?.startsWith('opus') ? '\uD83D\uDFE3' : s.model === 'haiku' ? '\uD83D\uDFE2' : '\uD83D\uDD35'}</span>
                            {streaming && (
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse" />
                            )}
                            <span className="text-[8px] text-slate-500">{s.messageCount}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between mb-1 gap-1">
                              <span className="text-sm font-medium truncate flex items-center gap-1.5">
                                {streaming && (
                                  <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse shrink-0" title="Streaming..." />
                                )}
                                {s.sessionName}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${MODEL_BADGES[s.model] || MODEL_BADGES[s.model?.split('[')[0]] || MODEL_BADGES.sonnet}`}>
                                  {s.model}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>{streaming ? 'Streaming...' : `${s.messageCount} msgs`}</span>
                              <span>{new Date(s.lastActivity).toLocaleDateString()}</span>
                            </div>
                          </>
                        )}
                        {/* Mobile view */}
                        <div className="sm:hidden">
                          <div className="flex items-center justify-between mb-1 gap-1">
                            <span className="text-sm font-medium truncate flex items-center gap-1.5">
                              {streaming && (
                                <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse shrink-0" />
                              )}
                              {s.sessionName}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${MODEL_BADGES[s.model] || MODEL_BADGES[s.model?.split('[')[0]] || MODEL_BADGES.sonnet}`}>
                                {s.model}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{streaming ? 'Streaming...' : `${s.messageCount} msgs`}</span>
                            <span>{new Date(s.lastActivity).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </button>
                      {onDelete && !collapsed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                          className="w-11 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
                          title="Delete session"
                          style={{ minHeight: '44px' }}
                        >
                          {'\uD83D\uDDD1\uFE0F'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Projects Section */}
          <div className="border-t border-slate-700">
            {!collapsed && (
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Projects</span>
                {onNewProject && (
                  <button
                    onClick={onNewProject}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    title="New project"
                  >
                    + Project
                  </button>
                )}
              </div>
            )}
            {collapsed && onNewProject && (
              <button
                onClick={onNewProject}
                className="w-full p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center justify-center"
                title="New project"
              >
                <span className="text-[10px]">{'\u2795'}</span>
              </button>
            )}

            {projects && projects.map(proj => {
              const projStreaming = isProjectStreaming(proj);
              return (
                <button
                  key={proj.slug}
                  onClick={() => onProjectOpen(proj.slug)}
                  className={`w-full transition-colors flex items-center ${
                    collapsed
                      ? 'p-3 justify-center'
                      : 'px-3 py-2 gap-2'
                  } ${
                    proj.sessionId && proj.sessionId === activeId
                      ? 'bg-slate-700/50 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/30 active:bg-slate-700/50'
                  }`}
                  title={collapsed ? proj.name : ''}
                >
                  <span className="text-base relative">
                    {proj.emoji}
                    {projStreaming && collapsed && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse" />
                    )}
                  </span>
                  {!collapsed && (
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <span className="text-xs font-medium truncate flex items-center gap-1.5">
                        {projStreaming && (
                          <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse shrink-0" title="Streaming..." />
                        )}
                        {proj.name}
                      </span>
                      {proj.messageCount > 0 && !projStreaming && (
                        <span className="text-[10px] text-slate-500 shrink-0 ml-1">{proj.messageCount}</span>
                      )}
                      {projStreaming && (
                        <span className="text-[10px] text-blue-400 shrink-0 ml-1">...</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Toggle Button (desktop only) */}
          <div className="hidden sm:block border-t border-slate-700">
            <button
              onClick={toggleCollapse}
              className="w-full p-3 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex items-center justify-center"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="text-base">
                {collapsed ? '\u00BB' : '\u00AB'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default SessionDrawer;
