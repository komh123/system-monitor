# Claude Chat Proxy — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpower-executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first chat UI at `monitor.ko.unieai.com/chat` that proxies Claude CLI headless mode (`claude -p --resume`) via SSH, enabling persistent sessions, model switching, and background execution without a browser tab.

**Architecture:** Express.js backend spawns `claude -p` processes on remote servers via existing SSH pool, parses `stream-json` output into SSE events for the React frontend. Session metadata persisted in JSON file. Health monitor auto-restarts crashed sessions.

**Tech Stack:** Express.js (backend), React 18 + Tailwind CSS (frontend), SSH2 (existing), Claude CLI 2.1.x (`-p --resume --output-format stream-json`), SSE (server-sent events)

**Design doc:** `docs/plans/2026-03-13-claude-chat-proxy-design.md`

**Mobile-first constraint:** All touch targets >= 44px, bottom-anchored input, no hover-only interactions, `active:` states for tap feedback, safe area insets.

---

## Task 1: ChatSessionStore — JSON Persistence Layer

**Files:**
- Create: `server/modules/chatSessionStore.js`

**Step 1: Write ChatSessionStore module**

```javascript
// server/modules/chatSessionStore.js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CHAT_DATA_DIR || path.join(__dirname, '../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'chat-sessions.json');

class ChatSessionStore {
  constructor() {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    this.sessions = this._load();
  }

  _load() {
    try {
      if (existsSync(SESSIONS_FILE)) {
        return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('[ChatSessionStore] Failed to load:', err.message);
    }
    return {};
  }

  _save() {
    try {
      writeFileSync(SESSIONS_FILE, JSON.stringify(this.sessions, null, 2));
    } catch (err) {
      console.error('[ChatSessionStore] Failed to save:', err.message);
    }
  }

  create({ serverIp, model, sessionName, allowedTools, systemPrompt }) {
    const id = randomUUID();
    const session = {
      id,
      sessionName: sessionName || `Session ${Object.keys(this.sessions).length + 1}`,
      serverIp,
      model: model || 'sonnet',
      allowedTools: allowedTools || ['Read', 'Edit', 'Bash', 'Write'],
      systemPrompt: systemPrompt || null,
      status: 'starting',       // starting | running | stopped | crashed
      claudeSessionId: null,    // From claude CLI output for --resume
      pid: null,                // Remote process PID
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
      messages: []              // Store messages locally for history
    };
    this.sessions[id] = session;
    this._save();
    return session;
  }

  get(id) {
    return this.sessions[id] || null;
  }

  list() {
    return Object.values(this.sessions)
      .filter(s => s.status !== 'archived')
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  }

  update(id, updates) {
    if (!this.sessions[id]) return null;
    Object.assign(this.sessions[id], updates);
    this._save();
    return this.sessions[id];
  }

  addMessage(id, role, content, toolUse = null) {
    if (!this.sessions[id]) return;
    this.sessions[id].messages.push({
      role,
      content,
      toolUse,
      timestamp: new Date().toISOString()
    });
    this.sessions[id].messageCount = this.sessions[id].messages.length;
    this.sessions[id].lastActivity = new Date().toISOString();
    this._save();
  }

  getMessages(id) {
    return this.sessions[id]?.messages || [];
  }

  archive(id) {
    return this.update(id, { status: 'archived' });
  }

  delete(id) {
    delete this.sessions[id];
    this._save();
  }
}

let instance = null;
export function getChatSessionStore() {
  if (!instance) instance = new ChatSessionStore();
  return instance;
}
export { ChatSessionStore };
```

**Step 2: Verify file loads without error**

Run: `cd /home/ubuntu/system-monitor && node -e "import('./server/modules/chatSessionStore.js').then(m => { const store = m.getChatSessionStore(); console.log('OK, sessions:', store.list().length); })"`
Expected: `OK, sessions: 0`

**Step 3: Commit**

```bash
git add server/modules/chatSessionStore.js server/data/.gitkeep
git commit -m "feat(chat): add ChatSessionStore for session persistence"
```

---

## Task 2: ClaudeRunner — SSH Process Manager

**Files:**
- Create: `server/modules/claudeRunner.js`

**Step 1: Write ClaudeRunner module**

This is the core module. It spawns `claude -p` via SSH and streams output.

```javascript
// server/modules/claudeRunner.js
import { getSSHPool } from './sshPool.js';
import { getChatSessionStore } from './chatSessionStore.js';
import { EventEmitter } from 'events';

class ClaudeRunner extends EventEmitter {
  constructor() {
    super();
    this.activeProcesses = new Map(); // sessionId -> { sshStream, pid }
  }

  /**
   * Send a message to a Claude session and stream the response.
   * Returns an EventEmitter that emits: 'data' (SSE events), 'error', 'end'
   */
  async sendMessage(sessionId, content) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) throw new Error('Session not found');

    const sshPool = getSSHPool();
    const { serverIp, model, claudeSessionId, allowedTools, systemPrompt } = session;

    // Build claude command
    const args = ['-p'];

    // Resume existing session if we have a Claude session ID
    if (claudeSessionId) {
      args.push('--resume', claudeSessionId);
    }

    args.push('--model', model);
    args.push('--output-format', 'stream-json');
    args.push('--permission-mode', 'bypassPermissions');

    if (allowedTools && allowedTools.length > 0) {
      args.push('--allowedTools', `"${allowedTools.join(',')}"`);
    }

    if (systemPrompt && !claudeSessionId) {
      // Only set system prompt on first message (not on resume)
      args.push('--system-prompt', JSON.stringify(systemPrompt));
    }

    // Escape the user message for shell
    const escapedContent = content.replace(/'/g, "'\\''");
    const claudePath = await this._detectClaudePath(serverIp);
    const fullCommand = `cd /home/ubuntu/agent-skill && ${claudePath} ${args.join(' ')} '${escapedContent}'`;

    console.log(`[ClaudeRunner] Executing on ${serverIp}: ${claudePath} ${args.join(' ')} '<message>'`);

    // Save user message
    store.addMessage(sessionId, 'user', content);

    // Execute via SSH and stream output
    const emitter = new EventEmitter();

    try {
      const pool = getSSHPool();
      const connection = pool.connections?.get(serverIp);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`No active SSH connection to ${serverIp}`);
      }

      const client = connection.client;

      client.exec(fullCommand, (err, stream) => {
        if (err) {
          emitter.emit('error', err);
          return;
        }

        let fullResponse = '';
        let extractedSessionId = null;
        let buffer = '';

        stream.on('data', (data) => {
          buffer += data.toString();

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const parsed = JSON.parse(line);
              // Extract Claude session ID from the first response
              if (parsed.session_id && !extractedSessionId) {
                extractedSessionId = parsed.session_id;
                store.update(sessionId, {
                  claudeSessionId: extractedSessionId,
                  status: 'running'
                });
              }

              // Map stream-json events to our SSE format
              if (parsed.type === 'assistant' && parsed.message) {
                // Text content from assistant
                const textBlocks = (parsed.message.content || [])
                  .filter(b => b.type === 'text')
                  .map(b => b.text)
                  .join('');
                if (textBlocks) {
                  fullResponse += textBlocks;
                  emitter.emit('data', {
                    event: 'assistant_text',
                    data: { text: textBlocks }
                  });
                }

                // Tool use blocks
                const toolBlocks = (parsed.message.content || [])
                  .filter(b => b.type === 'tool_use');
                for (const tool of toolBlocks) {
                  emitter.emit('data', {
                    event: 'tool_use',
                    data: { tool: tool.name, input: tool.input, id: tool.id }
                  });
                }
              }

              if (parsed.type === 'content_block_delta') {
                if (parsed.delta?.type === 'text_delta') {
                  fullResponse += parsed.delta.text;
                  emitter.emit('data', {
                    event: 'assistant_text',
                    data: { text: parsed.delta.text }
                  });
                }
              }

              if (parsed.type === 'result') {
                // Final result - extract session ID if present
                if (parsed.session_id) {
                  store.update(sessionId, {
                    claudeSessionId: parsed.session_id,
                    status: 'running'
                  });
                }
                emitter.emit('data', {
                  event: 'result',
                  data: {
                    sessionId: parsed.session_id,
                    costUsd: parsed.cost_usd,
                    durationMs: parsed.duration_ms,
                    numTurns: parsed.num_turns
                  }
                });
              }

            } catch (parseErr) {
              // Not JSON, might be raw text output
              if (line.trim()) {
                fullResponse += line;
                emitter.emit('data', {
                  event: 'assistant_text',
                  data: { text: line }
                });
              }
            }
          }
        });

        stream.stderr.on('data', (data) => {
          const errText = data.toString();
          console.error(`[ClaudeRunner] stderr: ${errText}`);
          // Don't emit errors for common stderr noise (progress indicators etc.)
          if (errText.includes('Error') || errText.includes('error')) {
            emitter.emit('data', {
              event: 'error',
              data: { message: errText.trim() }
            });
          }
        });

        stream.on('close', (code) => {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer);
              if (parsed.type === 'result' && parsed.session_id) {
                store.update(sessionId, {
                  claudeSessionId: parsed.session_id,
                  status: 'running'
                });
              }
            } catch {
              // Ignore
            }
          }

          // Save assistant response
          if (fullResponse) {
            store.addMessage(sessionId, 'assistant', fullResponse);
          }

          store.update(sessionId, { lastActivity: new Date().toISOString() });

          emitter.emit('data', {
            event: 'done',
            data: { exitCode: code, messageCount: store.get(sessionId)?.messageCount }
          });
          emitter.emit('end');
        });

        // Store reference to stream for potential cancellation
        this.activeProcesses.set(sessionId, { stream, pid: null });
      });

    } catch (err) {
      emitter.emit('error', err);
    }

    return emitter;
  }

  /**
   * Stop a running message/process for a session.
   */
  async stopSession(sessionId) {
    const active = this.activeProcesses.get(sessionId);
    if (active?.stream) {
      active.stream.signal('SIGINT');
      this.activeProcesses.delete(sessionId);
    }
  }

  /**
   * Check if a session's Claude process is alive on the remote server.
   */
  async checkHealth(sessionId) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) return { alive: false, reason: 'Session not found' };

    try {
      const sshPool = getSSHPool();
      // Check if claude process is running
      await sshPool.exec(session.serverIp, 'pgrep -f "claude"', { timeout: 5000 });
      return { alive: true };
    } catch {
      return { alive: false, reason: 'Process not found' };
    }
  }

  async _detectClaudePath(ip) {
    const sshPool = getSSHPool();
    try {
      const result = await sshPool.exec(ip, 'which claude', { timeout: 5000 });
      return result.trim();
    } catch {
      // Fallback paths
      for (const p of ['/home/ubuntu/.local/bin/claude', '/usr/local/bin/claude']) {
        try {
          await sshPool.exec(ip, `test -f ${p}`, { timeout: 3000 });
          return p;
        } catch { /* continue */ }
      }
      return 'claude'; // Hope it's in PATH
    }
  }
}

let instance = null;
export function getClaudeRunner() {
  if (!instance) instance = new ClaudeRunner();
  return instance;
}
export { ClaudeRunner };
```

**Step 2: Verify module loads**

Run: `cd /home/ubuntu/system-monitor && node -e "import('./server/modules/claudeRunner.js').then(m => { console.log('ClaudeRunner loaded OK'); })"`
Expected: `ClaudeRunner loaded OK`

**Step 3: Commit**

```bash
git add server/modules/claudeRunner.js
git commit -m "feat(chat): add ClaudeRunner for SSH-based claude -p execution"
```

---

## Task 3: Chat API Routes

**Files:**
- Create: `server/routes/chatRoutes.js`
- Modify: `server/index.js` (add 2 lines to import and mount router)

**Step 1: Write chat routes**

```javascript
// server/routes/chatRoutes.js
import { Router } from 'express';
import { getChatSessionStore } from '../modules/chatSessionStore.js';
import { getClaudeRunner } from '../modules/claudeRunner.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Available models
const MODELS = [
  { id: 'sonnet', name: 'Claude Sonnet 4.5', default: true },
  { id: 'opus', name: 'Claude Opus 4.6' },
  { id: 'haiku', name: 'Claude Haiku 4.5' }
];

// GET /api/chat/models
router.get('/models', (req, res) => {
  res.json({ models: MODELS });
});

// GET /api/chat/servers — reuse existing servers.json
router.get('/servers', (req, res) => {
  try {
    const configPath = process.env.SERVERS_CONFIG_PATH ||
      path.join(__dirname, '../config/servers.json');
    const servers = JSON.parse(readFileSync(configPath, 'utf-8'));
    res.json({
      servers: servers.map(s => ({
        ip: s.ip,
        alias: s.alias,
        hostname: s.hostname
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/sessions
router.get('/sessions', (req, res) => {
  const store = getChatSessionStore();
  const sessions = store.list().map(s => ({
    id: s.id,
    sessionName: s.sessionName,
    serverIp: s.serverIp,
    model: s.model,
    status: s.status,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    messageCount: s.messageCount
  }));
  res.json({ sessions });
});

// POST /api/chat/sessions
router.post('/sessions', (req, res) => {
  const { serverIp, model, sessionName, allowedTools, systemPrompt } = req.body;
  if (!serverIp) {
    return res.status(400).json({ error: 'serverIp is required' });
  }

  const store = getChatSessionStore();
  const session = store.create({ serverIp, model, sessionName, allowedTools, systemPrompt });
  res.json({
    id: session.id,
    sessionName: session.sessionName,
    status: session.status
  });
});

// PATCH /api/chat/sessions/:id
router.patch('/sessions/:id', (req, res) => {
  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const allowed = ['model', 'sessionName', 'allowedTools', 'systemPrompt'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const updated = store.update(req.params.id, updates);
  res.json({ success: true, session: updated });
});

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Stop any running process
  const runner = getClaudeRunner();
  await runner.stopSession(req.params.id);

  store.archive(req.params.id);
  res.json({ success: true });
});

// GET /api/chat/sessions/:id/history
router.get('/sessions/:id/history', (req, res) => {
  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  res.json({ messages: store.getMessages(req.params.id) });
});

// POST /api/chat/sessions/:id/message — SSE streaming response
router.post('/sessions/:id/message', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });

  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  try {
    const runner = getClaudeRunner();
    const emitter = await runner.sendMessage(req.params.id, content);

    emitter.on('data', (event) => {
      res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    });

    emitter.on('error', (err) => {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      res.end();
    });

    emitter.on('end', () => {
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      // Don't stop the claude process — let it finish in background
      emitter.removeAllListeners();
    });

  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/chat/sessions/:id/stop — Stop streaming
router.post('/sessions/:id/stop', async (req, res) => {
  try {
    const runner = getClaudeRunner();
    await runner.stopSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/sessions/:id/health
router.get('/sessions/:id/health', async (req, res) => {
  try {
    const runner = getClaudeRunner();
    const health = await runner.checkHealth(req.params.id);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

**Step 2: Mount router in server/index.js**

Add these 2 lines near the top imports (after line 10):
```javascript
import chatRoutes from './routes/chatRoutes.js';
```

Add this line after the middleware setup (after `app.use(express.json())`):
```javascript
app.use('/api/chat', chatRoutes);
```

**Step 3: Verify server starts**

Run: `cd /home/ubuntu/system-monitor && timeout 5 node server/index.js 2>&1 || true`
Expected: Should print `System Monitor API running on port 3000` without import errors.

**Step 4: Commit**

```bash
mkdir -p server/routes server/data
touch server/data/.gitkeep
git add server/routes/chatRoutes.js server/data/.gitkeep server/index.js
git commit -m "feat(chat): add /api/chat/* REST + SSE routes"
```

---

## Task 4: Frontend — Navigation + Chat Route

**Files:**
- Modify: `client/src/components/Navigation.jsx` (add Chat nav item)
- Modify: `client/src/App.jsx` (add Chat route)
- Create: `client/src/pages/ChatPage.jsx` (shell page)

**Step 1: Add Chat to navigation**

In `Navigation.jsx`, add to `navItems` array:
```javascript
{ path: '/chat', label: 'Chat', icon: '💬' }
```

**Step 2: Create ChatPage shell and add route**

Create `client/src/pages/ChatPage.jsx`:
```jsx
import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/chat';

function ChatPage() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <p className="text-slate-400">Chat UI — {sessions.length} sessions loaded</p>
      <p className="text-slate-500 text-sm mt-2">Full UI coming next...</p>
    </div>
  );
}

export default ChatPage;
```

In `App.jsx`, add import and route:
```jsx
import ChatPage from './pages/ChatPage';
// Inside <Routes>:
<Route path="/chat" element={<ChatPage />} />
```

**Step 3: Build and verify**

Run: `cd /home/ubuntu/system-monitor && npm run build`
Expected: Build succeeds without errors.

**Step 4: Commit**

```bash
git add client/src/pages/ChatPage.jsx client/src/App.jsx client/src/components/Navigation.jsx
git commit -m "feat(chat): add /chat route with shell page and navigation"
```

---

## Task 5: Frontend — MessageInput (Bottom-Anchored)

**Files:**
- Create: `client/src/components/chat/MessageInput.jsx`

**Step 1: Write MessageInput component**

```jsx
// client/src/components/chat/MessageInput.jsx
import React, { useState, useRef, useEffect } from 'react';

function MessageInput({ onSend, disabled, onStop, isStreaming }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  // Auto-resize textarea (max 4 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'; // ~4 lines max
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-2 sm:p-3 safe-area-bottom z-40">
      <div className="max-w-4xl mx-auto flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-blue-500 placeholder-slate-500 disabled:opacity-50"
          style={{ minHeight: '44px' }}
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="shrink-0 h-11 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="shrink-0 h-11 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

export default MessageInput;
```

**Step 2: Add safe-area CSS**

In `client/src/index.css`, add:
```css
/* Safe area for mobile notch/home indicator */
.safe-area-bottom {
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
}
```

**Step 3: Commit**

```bash
mkdir -p client/src/components/chat
git add client/src/components/chat/MessageInput.jsx client/src/index.css
git commit -m "feat(chat): add MessageInput with bottom-anchored layout"
```

---

## Task 6: Frontend — MessageBubble + ToolCard

**Files:**
- Create: `client/src/components/chat/MessageBubble.jsx`
- Create: `client/src/components/chat/ToolCard.jsx`

**Step 1: Write ToolCard**

```jsx
// client/src/components/chat/ToolCard.jsx
import React, { useState } from 'react';

function ToolCard({ tool, input, output }) {
  const [expanded, setExpanded] = useState(false);

  const toolIcons = {
    Read: '📄', Edit: '✏️', Write: '📝',
    Bash: '🖥️', Glob: '🔍', Grep: '🔎'
  };

  return (
    <div className="my-1.5 border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/50 text-left text-xs sm:text-sm btn-inline"
      >
        <span>{toolIcons[tool] || '🔧'}</span>
        <span className="font-medium text-slate-300">{tool}</span>
        {input?.file_path && (
          <span className="text-slate-500 truncate flex-1 font-mono text-[10px] sm:text-xs">
            {input.file_path.split('/').pop()}
          </span>
        )}
        {input?.command && (
          <span className="text-slate-500 truncate flex-1 font-mono text-[10px] sm:text-xs">
            $ {input.command.substring(0, 40)}
          </span>
        )}
        <span className="text-slate-500 shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && output && (
        <div className="px-3 py-2 bg-slate-900/50 border-t border-slate-700 max-h-48 overflow-y-auto">
          <pre className="text-[10px] sm:text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
            {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ToolCard;
```

**Step 2: Write MessageBubble**

```jsx
// client/src/components/chat/MessageBubble.jsx
import React from 'react';
import ToolCard from './ToolCard.jsx';

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${
        isUser
          ? 'bg-blue-600 text-white rounded-2xl rounded-br-md'
          : 'bg-slate-800 text-slate-200 rounded-2xl rounded-bl-md border border-slate-700'
      } px-3.5 py-2.5`}>
        {/* Text content */}
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* Tool usage */}
        {message.toolUse && message.toolUse.length > 0 && (
          <div className="mt-2">
            {message.toolUse.map((tool, i) => (
              <ToolCard
                key={i}
                tool={tool.name || tool.tool}
                input={tool.input}
                output={tool.output}
              />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className={`text-[10px] mt-1 ${isUser ? 'text-blue-200' : 'text-slate-500'}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
```

**Step 3: Commit**

```bash
git add client/src/components/chat/MessageBubble.jsx client/src/components/chat/ToolCard.jsx
git commit -m "feat(chat): add MessageBubble and ToolCard components"
```

---

## Task 7: Frontend — MessageList with Streaming

**Files:**
- Create: `client/src/components/chat/MessageList.jsx`

**Step 1: Write MessageList**

```jsx
// client/src/components/chat/MessageList.jsx
import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble.jsx';

function MessageList({ messages, streamingText }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 pb-20"
    >
      {messages.length === 0 && !streamingText && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-slate-400 text-sm">Send a message to start</p>
          <p className="text-slate-500 text-xs mt-1">Messages are preserved across sessions</p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {/* Streaming indicator */}
      {streamingText !== null && (
        <div className="flex justify-start mb-3">
          <div className="max-w-[85%] sm:max-w-[75%] bg-slate-800 text-slate-200 rounded-2xl rounded-bl-md border border-slate-700 px-3.5 py-2.5">
            <div className="text-sm whitespace-pre-wrap break-words">
              {streamingText || (
                <span className="inline-flex gap-1 text-slate-400">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
```

**Step 2: Commit**

```bash
git add client/src/components/chat/MessageList.jsx
git commit -m "feat(chat): add MessageList with streaming indicator"
```

---

## Task 8: Frontend — ChatHeader + ModelSelector + NewSessionModal

**Files:**
- Create: `client/src/components/chat/ChatHeader.jsx`
- Create: `client/src/components/chat/NewSessionModal.jsx`

**Step 1: Write ChatHeader with inline ModelSelector**

```jsx
// client/src/components/chat/ChatHeader.jsx
import React, { useState } from 'react';

const MODEL_COLORS = {
  sonnet: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  opus: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  haiku: 'bg-green-500/20 text-green-400 border-green-500/50'
};

function ChatHeader({ session, models, onMenuToggle, onModelChange, onRename }) {
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
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-700 active:bg-slate-600 transition-colors"
          >
            <span className="text-lg">☰</span>
          </button>
          <span className="text-slate-400 text-sm">Select a session</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-slate-800 border-b border-slate-700">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        <button
          onClick={onMenuToggle}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-700 active:bg-slate-600 transition-colors sm:hidden"
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
        {/* Model selector */}
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

        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          session.status === 'running' ? 'bg-green-400' :
          session.status === 'starting' ? 'bg-yellow-400 animate-pulse' :
          session.status === 'crashed' ? 'bg-red-400' :
          'bg-slate-500'
        }`} title={session.status} />
      </div>
    </div>
  );
}

export default ChatHeader;
```

**Step 2: Write NewSessionModal**

```jsx
// client/src/components/chat/NewSessionModal.jsx
import React, { useState, useEffect } from 'react';

const API_BASE = '/api/chat';

const DEFAULT_TOOLS = ['Read', 'Edit', 'Bash', 'Write', 'Glob', 'Grep'];

function NewSessionModal({ onClose, onCreate }) {
  const [servers, setServers] = useState([]);
  const [models, setModels] = useState([]);
  const [serverIp, setServerIp] = useState('');
  const [model, setModel] = useState('sonnet');
  const [sessionName, setSessionName] = useState('');
  const [tools, setTools] = useState(DEFAULT_TOOLS.slice(0, 4)); // Read, Edit, Bash, Write
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/servers`).then(r => r.json()),
      fetch(`${API_BASE}/models`).then(r => r.json())
    ]).then(([sData, mData]) => {
      setServers(sData.servers || []);
      setModels(mData.models || []);
      if (sData.servers?.length > 0) setServerIp(sData.servers[0].ip);
    });
  }, []);

  const handleCreate = async () => {
    if (!serverIp) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverIp,
          model,
          sessionName: sessionName || undefined,
          allowedTools: tools
        })
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      onCreate(data);
      onClose();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleTool = (t) => {
    setTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md border border-slate-700 p-4 sm:p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base sm:text-lg font-semibold mb-4">New Session</h2>

        {/* Session Name */}
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5">Session Name</label>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g. 投資策略優化"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Server */}
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5">Server</label>
          <select
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          >
            {servers.map(s => (
              <option key={s.ip} value={s.ip}>{s.alias} ({s.ip})</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5">Model</label>
          <div className="flex gap-2">
            {models.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  model === m.id
                    ? m.id === 'sonnet' ? 'bg-blue-600 text-white'
                    : m.id === 'opus' ? 'bg-purple-600 text-white'
                    : 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {m.id}
              </button>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div className="mb-6">
          <label className="block text-xs text-slate-400 mb-1.5">Allowed Tools</label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_TOOLS.map(t => (
              <button
                key={t}
                onClick={() => toggleTool(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tools.includes(t)
                    ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50'
                    : 'bg-slate-700 text-slate-400 border border-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!serverIp || creating}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewSessionModal;
```

**Step 3: Commit**

```bash
git add client/src/components/chat/ChatHeader.jsx client/src/components/chat/NewSessionModal.jsx
git commit -m "feat(chat): add ChatHeader with model selector and NewSessionModal"
```

---

## Task 9: Frontend — SessionDrawer (Mobile Sidebar)

**Files:**
- Create: `client/src/components/chat/SessionDrawer.jsx`

**Step 1: Write SessionDrawer**

```jsx
// client/src/components/chat/SessionDrawer.jsx
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
```

**Step 2: Commit**

```bash
git add client/src/components/chat/SessionDrawer.jsx
git commit -m "feat(chat): add SessionDrawer for mobile session navigation"
```

---

## Task 10: Frontend — Complete ChatPage Assembly

**Files:**
- Modify: `client/src/pages/ChatPage.jsx` (full rewrite)

**Step 1: Assemble ChatPage with all components**

Replace the entire ChatPage with:

```jsx
// client/src/pages/ChatPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ChatHeader from '../components/chat/ChatHeader.jsx';
import SessionDrawer from '../components/chat/SessionDrawer.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import MessageInput from '../components/chat/MessageInput.jsx';
import NewSessionModal from '../components/chat/NewSessionModal.jsx';

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

  // Fetch models
  useEffect(() => {
    fetch(`${API_BASE}/models`).then(r => r.json())
      .then(d => setModels(d.models || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    fetch(`${API_BASE}/sessions/${activeSessionId}/history`)
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
      .catch(() => setMessages([]));
  }, [activeSessionId]);

  // Send message
  const handleSend = async (content) => {
    if (!activeSessionId || isStreaming) return;

    // Optimistic user message
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
          if (line.startsWith('event: ')) {
            // Will be parsed with next data line
          } else if (line.startsWith('data: ')) {
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

      // Finalize: add assistant message
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
      fetchSessions(); // Refresh session metadata
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
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-5xl mb-4">💬</div>
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
    </div>
  );
}

export default ChatPage;
```

**Step 2: Fix MessageInput position**

The MessageInput uses `fixed` positioning which conflicts with the chat container. Change it to use `sticky` within the chat area. Update `MessageInput.jsx`:

Replace the outer div className:
```
FROM: "fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-2 sm:p-3 safe-area-bottom z-40"
TO:   "sticky bottom-0 bg-slate-900 border-t border-slate-700 p-2 sm:p-3 safe-area-bottom z-10"
```

And remove the `max-w-4xl mx-auto` from the inner div (not needed in contained layout).

Also update MessageList's `pb-20` to `pb-4` since input is now sticky, not fixed.

**Step 3: Build**

Run: `cd /home/ubuntu/system-monitor && npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add client/src/pages/ChatPage.jsx client/src/components/chat/MessageInput.jsx client/src/components/chat/MessageList.jsx
git commit -m "feat(chat): assemble complete ChatPage with all components"
```

---

## Task 11: Dockerfile + Data Volume

**Files:**
- Modify: `Dockerfile` (add data directory)

**Step 1: Update Dockerfile**

Add this line after `COPY docs ./docs`:
```dockerfile
RUN mkdir -p /app/server/data
```

This ensures the data directory exists for session persistence.

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat(chat): ensure data directory exists in Docker image"
```

---

## Task 12: Build, Deploy, and Smoke Test

**Step 1: Build frontend**

Run: `cd /home/ubuntu/system-monitor && npm run build`

**Step 2: Build Docker image**

Run: `cd /home/ubuntu/system-monitor && sudo docker build -t localhost:30500/system-monitor:latest -f Dockerfile .`

**Step 3: Push and deploy**

Run:
```bash
sudo docker push localhost:30500/system-monitor:latest
sudo kubectl rollout restart deployment/system-monitor -n deployer-dev
sudo kubectl rollout status deployment/system-monitor -n deployer-dev --timeout=60s
```

**Step 4: Smoke test**

1. Open `https://monitor.ko.unieai.com/chat` on phone
2. Verify navigation shows 4 tabs (CPU, Remote, Logs, Chat)
3. Verify "New Session" button works → modal opens with server/model selection
4. Create a session → verify it appears in session list
5. Send a test message → verify SSE streaming works
6. Close browser → reopen → verify session persists

**Step 5: Commit all if any fixes needed**

```bash
git add -A
git commit -m "feat(chat): complete Claude Chat Proxy v1.0 deployment"
```

---

## Summary

| Task | Component | Type | Files |
|------|-----------|------|-------|
| 1 | ChatSessionStore | Backend | `server/modules/chatSessionStore.js` |
| 2 | ClaudeRunner | Backend | `server/modules/claudeRunner.js` |
| 3 | Chat API Routes | Backend | `server/routes/chatRoutes.js`, `server/index.js` |
| 4 | Navigation + Route | Frontend | `Navigation.jsx`, `App.jsx`, `ChatPage.jsx` |
| 5 | MessageInput | Frontend | `chat/MessageInput.jsx`, `index.css` |
| 6 | MessageBubble + ToolCard | Frontend | `chat/MessageBubble.jsx`, `chat/ToolCard.jsx` |
| 7 | MessageList | Frontend | `chat/MessageList.jsx` |
| 8 | ChatHeader + NewSessionModal | Frontend | `chat/ChatHeader.jsx`, `chat/NewSessionModal.jsx` |
| 9 | SessionDrawer | Frontend | `chat/SessionDrawer.jsx` |
| 10 | ChatPage Assembly | Frontend | `ChatPage.jsx` (full rewrite) |
| 11 | Dockerfile | Infra | `Dockerfile` |
| 12 | Deploy + Smoke Test | DevOps | Build, push, deploy, verify |

**Phase 2 (future):** ChatHealthMonitor auto-recovery, Line Notify integration, swipe-to-delete sessions, syntax highlighting for code blocks.
