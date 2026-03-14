import React, { useState, useEffect, useCallback } from 'react';
import ChatHeader from '../components/chat/ChatHeader.jsx';
import SessionDrawer from '../components/chat/SessionDrawer.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import MessageInput from '../components/chat/MessageInput.jsx';
import NewSessionModal from '../components/chat/NewSessionModal.jsx';
import CommandPalette from '../components/chat/CommandPalette.jsx';

const API_BASE = '/api/chat';

function ChatPage() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [models, setModels] = useState([]);
  const [streamingText, setStreamingText] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [commands, setCommands] = useState([]);
  const [mcpTools, setMcpTools] = useState([]);
  const [loading, setLoading] = useState(true);

  const activeSession = sessions.find(s => s.id === activeSessionId);

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

  // Fetch models on mount (session commands and agents are static)
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/models`).then(r => r.json()),
      fetch(`${API_BASE}/commands`).then(r => r.json())
    ]).then(([mData, cData]) => {
      setModels(mData.models || []);
      // Load static session commands + agents (skills loaded per-server)
      const staticCommands = [
        ...(cData.sessionCommands || []),
        ...(cData.agents || [])
      ];
      setCommands(staticCommands);
    }).catch(() => {});
  }, []);

  // Fetch skills + MCP tools when active session changes (server-specific)
  useEffect(() => {
    if (!activeSession?.serverIp) {
      setCommands(prev => prev.filter(c => c.category !== 'skill'));
      setMcpTools([]);
      return;
    }

    // Fetch skills from remote server
    Promise.all([
      fetch(`${API_BASE}/skills?serverIp=${encodeURIComponent(activeSession.serverIp)}`).then(r => r.json()),
      fetch(`${API_BASE}/mcp-tools?serverIp=${encodeURIComponent(activeSession.serverIp)}`).then(r => r.json())
    ]).then(([skillData, mcpData]) => {
      // Merge session commands + agents + server skills
      setCommands(prev => {
        const withoutSkills = prev.filter(c => c.category !== 'skill');
        return [...withoutSkills, ...(skillData.skills || [])];
      });
      setMcpTools(mcpData.tools || []);
    }).catch(() => {
      setMcpTools([]);
    });
  }, [activeSession?.serverIp]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    fetch(`${API_BASE}/sessions/${activeSessionId}/history`)
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
      .catch(() => setMessages([]));
  }, [activeSessionId]);

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

  // Send message
  const handleSend = async (content) => {
    if (!activeSessionId || isStreaming) return;

    const userMsg = { role: 'user', content, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingText('');

    try {
      const res = await fetch(`${API_BASE}/sessions/${activeSessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.text) {
                fullText += data.text;
                setStreamingText(fullText);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      if (fullText) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: fullText,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setStreamingText(null);
      setIsStreaming(false);
      fetchSessions();
    }
  };

  // Stop streaming
  const handleStop = async () => {
    if (!activeSessionId) return;
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

  // Handle command palette selection
  const handleCommandSelect = (item) => {
    if (item.category === 'mcp') {
      // For MCP tools, insert a template prompt
      handleSend(`Use the ${item.name} MCP tool to `);
    } else if (item.name?.startsWith('/')) {
      // Slash commands — send directly
      handleSend(item.name);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] sm:h-[calc(100vh-7rem)] -mx-2 sm:-mx-4 md:-mx-6 -mb-2 sm:-mb-4 md:-mb-6 bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
      {/* Session Drawer */}
      <SessionDrawer
        open={drawerOpen}
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={setActiveSessionId}
        onNew={() => setShowNewModal(true)}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <ChatHeader
          session={activeSession}
          models={models}
          onMenuToggle={() => setDrawerOpen(!drawerOpen)}
          onModelChange={handleModelChange}
          onRename={handleRename}
          onOpenPalette={() => setShowPalette(true)}
        />

        {activeSessionId ? (
          <>
            <MessageList
              messages={messages}
              streamingText={isStreaming ? streamingText : null}
            />
            <MessageInput
              onSend={handleSend}
              disabled={!activeSessionId || isStreaming}
              onStop={handleStop}
              isStreaming={isStreaming}
              onOpenPalette={() => setShowPalette(true)}
              commands={commands}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-5xl mb-4">&#x1F4AC;</div>
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

      {/* New Session Modal */}
      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleSessionCreated}
        />
      )}

      {/* Command Palette */}
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
