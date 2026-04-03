import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ChatHeader from '../components/chat/ChatHeader.jsx';
import SessionDrawer from '../components/chat/SessionDrawer.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import MessageInput from '../components/chat/MessageInput.jsx';
import QuickActionPanel from '../components/chat/QuickActionPanel.jsx';
import NewSessionModal from '../components/chat/NewSessionModal.jsx';
import CommandPalette from '../components/chat/CommandPalette.jsx';

const API_BASE = '/api/chat';

/**
 * Per-session streaming state stored in a ref (not React state).
 * Each entry: { fullText, toolSteps, contextUsed, contextTotal, reader, abortController }
 * React state `streamingVersion` is bumped to trigger re-renders.
 */

function ChatPage() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [models, setModels] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [commands, setCommands] = useState([]);
  const [mcpTools, setMcpTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommand, setSelectedCommand] = useState(null);
  const [contextUsage, setContextUsage] = useState(0);
  const [contextTokens, setContextTokens] = useState({ used: 0, total: 200000 });
  const [mode, setMode] = useState('ask');
  const [projects, setProjects] = useState([]);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const autoCompactingRef = useRef(false);

  // Per-session streaming map: sessionId → { fullText, toolSteps, done }
  const streamMapRef = useRef(new Map());
  // Bump this counter to re-render when streaming state changes
  const [streamTick, setStreamTick] = useState(0);
  // Debounce timer for streaming text updates
  const flushTimerRef = useRef(null);
  // Per-session messages cache for background sessions
  const bgMessagesRef = useRef(new Map());

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Derived: is the ACTIVE session streaming?
  const activeStreamState = streamMapRef.current.get(activeSessionId);
  const isStreaming = !!activeStreamState && !activeStreamState.done;
  const streamingText = isStreaming ? (activeStreamState.fullText || '') : null;
  const toolSteps = isStreaming ? (activeStreamState.toolSteps || []) : [];

  // How many total sessions are currently streaming (for sidebar indicator)
  const streamingSessionIds = useMemo(() => {
    const ids = new Set();
    for (const [sid, state] of streamMapRef.current) {
      if (!state.done) ids.add(sid);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamTick]);

  // Flush streaming state to React (debounced ~50ms for text, immediate for tools)
  const flushStream = useCallback((immediate = false) => {
    if (immediate) {
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
      setStreamTick(t => t + 1);
    } else if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        setStreamTick(t => t + 1);
      }, 50);
    }
  }, []);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  }, []);

  // Fetch models on mount
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/models`).then(r => r.json()),
      fetch(`${API_BASE}/commands`).then(r => r.json())
    ]).then(([mData, cData]) => {
      setModels(mData.models || []);
      const staticCommands = [
        ...(cData.sessionCommands || []),
        ...(cData.skills || []),
        ...(cData.agents || [])
      ];
      setCommands(staticCommands);
    }).catch(() => {});
  }, []);

  // Fetch MCP tools when active session changes
  useEffect(() => {
    if (!activeSession?.serverIp) {
      setMcpTools([]);
      return;
    }
    fetch(`${API_BASE}/mcp-tools?serverIp=${encodeURIComponent(activeSession.serverIp)}`)
      .then(r => r.json())
      .then(mcpData => setMcpTools(mcpData.tools || []))
      .catch(() => setMcpTools([]));
  }, [activeSession?.serverIp]);

  useEffect(() => {
    fetchSessions();
    fetchProjects();
  }, [fetchSessions, fetchProjects]);

  // Load messages when active session changes + auto-set mode for projects
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    fetch(`${API_BASE}/sessions/${activeSessionId}/history`)
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
      .catch(() => setMessages([]));
    // Auto-set bypass mode for project/deep-clean sessions
    const session = sessions.find(s => s.id === activeSessionId);
    if (session?.type && (session.type.startsWith('project-') || session.type === 'deep-clean')) {
      setMode('bypass');
    }
  }, [activeSessionId, sessions]);

  // Global keyboard shortcut: Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Refresh skills from server
  const handleRefreshSkills = async () => {
    if (!activeSession?.serverIp) return;
    try {
      const skillData = await fetch(`${API_BASE}/skills?serverIp=${encodeURIComponent(activeSession.serverIp)}`).then(r => r.json());
      setCommands(prev => {
        const withoutSkills = prev.filter(c => c.category !== 'skill');
        return [...withoutSkills, ...(skillData.skills || [])];
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `\u2705 Skills refreshed! Loaded ${skillData.skills?.length || 0} skills from ${activeSession.serverIp}`,
        timestamp: new Date().toISOString()
      }]);
    } catch (err) {
      console.error('Failed to refresh skills:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '\u274C Failed to refresh skills. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  /**
   * Send message — supports concurrent sessions.
   * Each session gets its own streaming state in streamMapRef.
   * The fetch runs independently; switching sessions won't kill it.
   */
  const handleSend = async (content, images) => {
    if (!activeSessionId) return;
    // Block only if THIS session is already streaming
    const existingStream = streamMapRef.current.get(activeSessionId);
    if (existingStream && !existingStream.done) return;

    if (content.trim() === '/refresh-skills') {
      await handleRefreshSkills();
      return;
    }

    const targetSessionId = activeSessionId;

    const userMsg = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      hasImages: !!(images && images.length > 0),
      imageCount: images?.length || 0
    };
    setMessages(prev => [...prev, userMsg]);

    // Initialize streaming state for this session
    const abortController = new AbortController();
    const streamState = {
      fullText: '',
      toolSteps: [],
      done: false,
      abortController,
    };
    streamMapRef.current.set(targetSessionId, streamState);
    flushStream(true);

    let collectedToolSteps = [];

    try {
      const body = { content, mode };
      if (images && images.length > 0) body.images = images;

      const res = await fetch(`${API_BASE}/sessions/${targetSessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let currentEvent = 'assistant_text';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        let textChanged = false;
        let toolsChanged = false;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              switch (currentEvent) {
                case 'assistant_text':
                  if (data.text) {
                    fullText += data.text;
                    streamState.fullText = fullText;
                    textChanged = true;
                  }
                  break;
                case 'tool_use': {
                  const step = {
                    tool: data.tool || data.name,
                    input: data.input || {},
                    output: null,
                    status: 'running'
                  };
                  collectedToolSteps = [...collectedToolSteps, step];
                  streamState.toolSteps = [...collectedToolSteps];
                  toolsChanged = true;
                  break;
                }
                case 'tool_progress':
                  if (collectedToolSteps.length > 0 && data) {
                    const last = collectedToolSteps.length - 1;
                    collectedToolSteps[last] = { ...collectedToolSteps[last], progress: data };
                    streamState.toolSteps = [...collectedToolSteps];
                    toolsChanged = true;
                  }
                  break;
                case 'tool_summary':
                  if (collectedToolSteps.length > 0) {
                    const last = collectedToolSteps.length - 1;
                    collectedToolSteps[last] = {
                      ...collectedToolSteps[last],
                      output: data.summary || data.output || data.result || data,
                      status: 'complete'
                    };
                    streamState.toolSteps = [...collectedToolSteps];
                    toolsChanged = true;
                  }
                  break;
                case 'result':
                  if (data.contextUsed !== undefined) {
                    const total = data.contextTotal || 200000;
                    // Only update context UI if this is the active session
                    if (targetSessionId === activeSessionId) {
                      setContextTokens({ used: data.contextUsed, total });
                      setContextUsage(Math.round((data.contextUsed / total) * 100));
                    }
                  }
                  break;
              }
            } catch { /* ignore parse errors */ }
          }
        }

        // Debounced flush for text, immediate for tool changes
        if (toolsChanged) {
          flushStream(true);
        } else if (textChanged) {
          flushStream(false);
        }
      }

      collectedToolSteps = collectedToolSteps.map(step =>
        step.status === 'running' ? { ...step, status: 'complete' } : step
      );

      const assistantMsg = (fullText || collectedToolSteps.length > 0) ? {
        role: 'assistant',
        content: fullText || '',
        timestamp: new Date().toISOString(),
        toolUse: collectedToolSteps.length > 0 ? collectedToolSteps : undefined
      } : null;

      // If still viewing this session, append to messages directly
      if (targetSessionId === activeSessionId) {
        if (assistantMsg) setMessages(prev => [...prev, assistantMsg]);
      } else {
        // Background session completed — cache the message for when user switches back
        if (assistantMsg) {
          const cached = bgMessagesRef.current.get(targetSessionId) || [];
          cached.push(assistantMsg);
          bgMessagesRef.current.set(targetSessionId, cached);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Send failed:', err);
      }
    } finally {
      // Mark this session's stream as done
      streamState.done = true;
      // Clean up after a short delay so UI can see final state
      setTimeout(() => {
        streamMapRef.current.delete(targetSessionId);
        flushStream(true);
      }, 100);
      flushStream(true);
      fetchSessions();
      fetchProjects();
    }
  };

  // When switching sessions, merge any background messages
  useEffect(() => {
    if (!activeSessionId) return;
    const cached = bgMessagesRef.current.get(activeSessionId);
    if (cached && cached.length > 0) {
      // Reload full history from server to stay in sync
      fetch(`${API_BASE}/sessions/${activeSessionId}/history`)
        .then(r => r.json())
        .then(d => setMessages(d.messages || []))
        .catch(() => {});
      bgMessagesRef.current.delete(activeSessionId);
    }
  }, [activeSessionId]);

  // Stop streaming for active session
  const handleStop = async () => {
    if (!activeSessionId) return;
    const state = streamMapRef.current.get(activeSessionId);
    if (state?.abortController) {
      state.abortController.abort();
    }
    try {
      await fetch(`${API_BASE}/sessions/${activeSessionId}/stop`, { method: 'POST' });
    } catch { /* ignore */ }
  };

  // Model change
  const handleModelChange = async (model) => {
    if (!activeSessionId) return;
    await fetch(`${API_BASE}/sessions/${activeSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    fetchSessions();
  };

  // Rename session
  const handleRename = async (name) => {
    if (!activeSessionId) return;
    await fetch(`${API_BASE}/sessions/${activeSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName: name })
    });
    fetchSessions();
  };

  // Session created
  const handleSessionCreated = (newSession) => {
    fetchSessions();
    setActiveSessionId(newSession.id);
  };

  // Delete session
  const handleDeleteSession = async (sessionId) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete session');
      if (sessionId === activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
      fetchSessions();
      fetchProjects();
    } catch (err) {
      console.error('Delete session failed:', err);
      alert('Failed to delete session');
    }
  };

  // Open project
  const handleProjectOpen = async (slug) => {
    try {
      const res = await fetch(`${API_BASE}/projects/${slug}/open`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to open project');
      const data = await res.json();

      await fetchSessions();
      await fetchProjects();
      setActiveSessionId(data.id);
      setMode('bypass'); // Projects default to bypass mode
      setDrawerOpen(false);

      // First open: auto-send review prompt
      if (data.isNew && data.reviewPrompt) {
        setTimeout(() => { handleSend(data.reviewPrompt); }, 300);
      } else if (data.isNew && slug === 'deep-clean') {
        setTimeout(() => {
          handleSend(
            '請幫我分析目前的磁碟使用狀況：\n' +
            '1. df -h / 整體使用\n' +
            '2. du -sh /* 2>/dev/null | sort -rh | head -15 (top 目錄)\n' +
            '3. find / -xdev -size +100M -type f 2>/dev/null (大檔案)\n' +
            '4. docker system df (Docker 使用)\n' +
            '5. 根據分析給出清理建議和預估可釋放空間'
          );
        }, 300);
      }
    } catch (err) {
      console.error('Project open failed:', err);
    }
  };

  // Create new project
  const handleNewProject = () => {
    setShowNewProjectInput(true);
    setNewProjectName('');
  };

  const handleNewProjectSubmit = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to create project');
        return;
      }
      const data = await res.json();
      setShowNewProjectInput(false);
      setNewProjectName('');
      await handleProjectOpen(data.slug);
    } catch (err) {
      console.error('Create project failed:', err);
    }
  };

  // Handle command palette selection
  const handleCommandSelect = (item) => {
    if (item.category === 'session' || item.category === 'agent') {
      handleSend(item.name);
      setShowPalette(false);
    } else if (item.category === 'skill') {
      setSelectedCommand(item);
    } else if (item.category === 'mcp') {
      handleSend(`Use the ${item.name} MCP tool to `);
      setShowPalette(false);
    }
  };

  // Handle compact
  const handleCompact = async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${activeSessionId}/compact`, { method: 'POST' });
      if (!res.ok) throw new Error('Compact failed');
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || '\u2705 Context compacted successfully',
        timestamp: new Date().toISOString()
      }]);
      await fetchContextUsage();
    } catch (err) {
      console.error('[Compact] Failed:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '\u274C Failed to compact context. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  // Handle mode change — skip system message during streaming to avoid disrupting display
  const handleModeChange = (newMode) => {
    setMode(newMode);
    if (!isStreaming) {
      const modeLabels = { ask: 'Ask Mode', plan: 'Plan Mode', bypass: 'Bypass Mode' };
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `\uD83D\uDD04 Switched to ${modeLabels[newMode]}`,
        timestamp: new Date().toISOString()
      }]);
    }
  };

  // Auto-compact when context usage >= 90%
  useEffect(() => {
    if (contextUsage >= 90 && activeSessionId && !isStreaming && !autoCompactingRef.current) {
      autoCompactingRef.current = true;
      handleCompact().finally(() => {
        setTimeout(() => { autoCompactingRef.current = false; }, 60000);
      });
    }
  }, [contextUsage, activeSessionId, isStreaming]);

  // Fetch context usage
  const fetchContextUsage = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${activeSessionId}/context`);
      if (!res.ok) throw new Error('Failed to fetch context');
      const data = await res.json();
      setContextUsage(data.percentage || 0);
      setContextTokens({ used: data.used || 0, total: data.total || 200000 });
    } catch (err) {
      console.error('[Context] Failed to fetch:', err);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    fetchContextUsage();
  }, [activeSessionId, fetchContextUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] sm:h-[calc(100dvh-7rem)] -mx-2 sm:-mx-4 md:-mx-6 -mb-20 sm:-mb-4 md:-mb-6 bg-slate-900 rounded-none sm:rounded-lg overflow-hidden border-0 sm:border border-slate-700">
      <SessionDrawer
        open={drawerOpen}
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={setActiveSessionId}
        onNew={() => setShowNewModal(true)}
        onClose={() => setDrawerOpen(false)}
        onDelete={handleDeleteSession}
        projects={projects}
        onProjectOpen={handleProjectOpen}
        onNewProject={handleNewProject}
        streamingSessionIds={streamingSessionIds}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <ChatHeader
          session={activeSession}
          models={models}
          onMenuToggle={() => setDrawerOpen(!drawerOpen)}
          onModelChange={handleModelChange}
          onRename={handleRename}
          onOpenPalette={() => setShowPalette(true)}
          contextUsage={contextUsage}
          contextTokens={contextTokens}
          onCompact={handleCompact}
          mode={mode}
          onModeChange={handleModeChange}
        />

        {activeSessionId ? (
          <>
            <MessageList
              messages={messages}
              streamingText={streamingText}
              toolSteps={toolSteps}
              onRefresh={fetchContextUsage}
            />
            {activeSession?.type === 'deep-clean' && (
              <QuickActionPanel
                onAction={(prompt) => handleSend(prompt)}
                disabled={isStreaming}
              />
            )}
            <MessageInput
              onSend={handleSend}
              disabled={!activeSessionId || isStreaming}
              onStop={handleStop}
              isStreaming={isStreaming}
              onOpenPalette={() => setShowPalette(true)}
              commands={commands}
              selectedCommand={selectedCommand}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-5xl mb-4">{'\uD83D\uDCAC'}</div>
            <p className="text-slate-400 text-sm mb-4">Select a session or create a new one</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              + New Session
            </button>
          </div>
        )}
      </div>

      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleSessionCreated}
        />
      )}

      {showNewProjectInput && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setShowNewProjectInput(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-4">New Project</h3>
            <input
              type="text"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNewProjectSubmit(); if (e.key === 'Escape') setShowNewProjectInput(false); }}
              placeholder="Project name..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewProjectInput(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewProjectSubmit}
                disabled={!newProjectName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        onSelect={handleCommandSelect}
        commands={commands}
        mcpTools={mcpTools}
      />
    </div>
  );
}

export default ChatPage;
