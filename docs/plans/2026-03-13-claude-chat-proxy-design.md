# Claude Chat Proxy — Design Document

> Date: 2026-03-13
> Status: Approved (Parts 1-3)
> Approach: A+C Hybrid — SDK Proxy (main) + Line Notifications (backup)

---

## Problem Statement

Using Claude Remote Control via `claude.ai/new` has critical limitations:
1. Browser tab must stay open — cannot work in background
2. Sessions cannot be resumed after restart — context lost
3. Mobile APP redirects prevent model switching on web
4. No self-recovery when sessions crash

User requirement: **Mobile-first** browser control that works even when the page is closed, with session persistence and self-recovery.

---

## Part 1: Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React)                        │
│   monitor.ko.unieai.com/chat                              │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │ Session List │  │   Chat UI    │  │ Model Selector │   │
│  │  + 命名      │  │  (Messages)  │  │ + Tool Config  │   │
│  └─────────────┘  └──────────────┘  └───────────────┘   │
│        Mobile-first RWD (touch-friendly, 44px targets)    │
└────────────────────────┬─────────────────────────────────┘
                         │ SSE + REST
                         ▼
┌────────────────────────────────────────────────────────────┐
│                Backend (Express.js)                          │
│   /api/chat/*  endpoints                                     │
│                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │ SessionStore  │  │ ClaudeRunner  │  │ HealthMonitor   │ │
│  │ (JSON file)   │  │ (child_proc)  │  │ (auto-restart)  │ │
│  └──────────────┘  └───────────────┘  └─────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│            claude -p --resume $ID                             │
│            --model $MODEL                                    │
│            --output-format stream-json                       │
│            --allowedTools "..."                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Optional: Line Notify  (push notifications)           │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                         │ SSH
                         ▼
            ┌─────────────────────────┐
            │  Remote Server A / B     │
            │  claude CLI (headless)   │
            └─────────────────────────┘
```

### Key Decisions

- **Headless mode** (`claude -p`): No browser tab needed, runs as background process
- **`--resume $SESSION_ID`**: Session persistence across restarts
- **`--model $MODEL`**: Switch models freely (sonnet/opus/haiku)
- **`--output-format stream-json`**: Real-time streaming for chat UI
- **Runs on existing monitor pod**: No new infrastructure needed
- **Mobile-first design**: All UI designed for phone-sized screens first

---

## Part 2: Backend API Design

Base path: `/api/chat`

### Session Management

#### `GET /api/chat/sessions`
List all sessions with metadata.

```json
{
  "sessions": [
    {
      "id": "abc-123",
      "sessionName": "投資策略優化",
      "serverIp": "172.31.6.240",
      "model": "sonnet",
      "status": "running",
      "createdAt": "2026-03-13T10:00:00Z",
      "lastActivity": "2026-03-13T10:30:00Z",
      "messageCount": 42
    }
  ]
}
```

#### `POST /api/chat/sessions`
Create a new session.

```json
// Request
{
  "serverIp": "172.31.6.240",
  "model": "sonnet",
  "sessionName": "投資策略優化",
  "allowedTools": ["Read", "Edit", "Bash", "Write"],
  "systemPrompt": "(optional)"
}

// Response
{
  "id": "abc-123",
  "sessionName": "投資策略優化",
  "status": "starting"
}
```

#### `DELETE /api/chat/sessions/:id`
Stop and archive a session.

#### `PATCH /api/chat/sessions/:id`
Update session config (model, name, tools).

```json
{
  "model": "opus",
  "sessionName": "新名稱"
}
```

### Messaging

#### `POST /api/chat/sessions/:id/message`
Send message, receive SSE stream.

```json
// Request
{
  "content": "請幫我優化這個策略的回測邏輯"
}

// Response: SSE stream
event: assistant_text
data: {"text": "我來看看..."}

event: tool_use
data: {"tool": "Read", "input": {"file_path": "/home/..."}}

event: tool_result
data: {"tool": "Read", "output": "..."}

event: done
data: {"messageCount": 43}
```

#### `GET /api/chat/sessions/:id/history`
Retrieve conversation history.

```json
{
  "messages": [
    {
      "role": "user",
      "content": "...",
      "timestamp": "2026-03-13T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "...",
      "timestamp": "2026-03-13T10:00:05Z",
      "toolUse": [...]
    }
  ]
}
```

### Server & Model

#### `GET /api/chat/servers`
List available servers (reuse existing `servers.json`).

#### `GET /api/chat/models`
List available models.

```json
{
  "models": [
    { "id": "sonnet", "name": "Claude Sonnet 4.5", "default": true },
    { "id": "opus", "name": "Claude Opus 4.6" },
    { "id": "haiku", "name": "Claude Haiku 4.5" }
  ]
}
```

### Health

#### `GET /api/chat/sessions/:id/health`
Session health check (process alive, memory usage).

### Backend Implementation Details

**ClaudeRunner** — Core class managing `claude -p` child processes:
- Spawns `claude` via SSH on target server
- Parses `stream-json` output into SSE events
- Tracks process PID for health monitoring
- Handles `--resume` for session persistence

**SessionStore** — JSON file persistence (`/data/chat-sessions.json`):
- Session metadata (id, name, server, model, created, lastActivity)
- Maps session ID → Claude session ID for `--resume`
- Message count tracking (actual messages stored on remote server)

**HealthMonitor** — Background checks every 60s:
- Verifies Claude process is alive via SSH
- Auto-restarts crashed sessions
- Pushes Line notification on failure/recovery

---

## Part 3: Frontend Chat UI Design

### Mobile-First Principles

- **All touch targets >= 44px** (Apple HIG standard)
- **No hover-only interactions** — everything works with tap
- **Bottom-anchored input** — thumb-reachable on phone
- **Collapsible panels** — maximize chat area on small screens
- **Safe area insets** — respect notch/home indicator

### Page Structure

```
┌─────────────────────────────────────┐
│ ☰  投資策略優化    sonnet  ▼  ⚙️   │  ← Compact header
├─────────────────────────────────────┤
│                                     │
│  👤 請幫我優化回測邏輯               │
│                                     │
│  🤖 我來看看這個策略...             │
│     📄 Reading: strategy.py         │
│     > line 42: def backtest()       │
│     ✅ 我建議以下修改...             │
│                                     │
│  👤 好的，請執行                     │
│                                     │
│  🤖 ⏳ Running Bash command...      │
│     $ python backtest.py            │
│     [streaming output...]           │
│                                     │
├─────────────────────────────────────┤
│  [  Type message...        ] [Send] │  ← Bottom-anchored
└─────────────────────────────────────┘
```

### Component Breakdown

#### 1. ChatPage (`/chat`)
- Route: `monitor.ko.unieai.com/chat`
- Mobile: Full-screen chat, session drawer via hamburger menu
- Desktop: Side panel for session list

#### 2. SessionDrawer (mobile) / SessionSidebar (desktop)
- Session list with name, model badge, last activity time
- "New Session" button with server/model selection
- Tap session name to rename inline
- Swipe-to-delete on mobile

#### 3. ChatHeader
- Session name (tappable to rename)
- Model selector dropdown (sonnet/opus/haiku)
- Settings gear icon → tools config panel
- Hamburger menu on mobile → opens SessionDrawer

#### 4. MessageList
- Auto-scroll to bottom on new messages
- User messages: right-aligned, blue bubble
- Assistant messages: left-aligned, dark bubble
- Tool usage: collapsible cards showing tool name + output
  - File reads: syntax-highlighted code preview
  - Bash: terminal-style output with green/red for success/error
- Streaming indicator: typing dots animation during response

#### 5. MessageInput
- Fixed to bottom of viewport
- Multiline textarea that grows (max 4 lines)
- Send button (disabled during streaming)
- "Stop" button appears during streaming (sends SIGINT)

#### 6. ModelSelector
- Compact dropdown in header
- Shows current model with color badge:
  - Sonnet: blue
  - Opus: purple
  - Haiku: green
- Changing model takes effect on next message

#### 7. NewSessionModal
- Server selection (Server A / Server B)
- Model selection
- Session name input
- Allowed tools checkboxes (Read, Edit, Bash, Write, Glob, Grep)
- Optional system prompt textarea

### Mobile-Specific UX

- **Keyboard handling**: Input stays visible when keyboard opens (viewport adjustment)
- **Pull-to-refresh**: Reload session list
- **Long-press message**: Copy text
- **Haptic feedback**: On send (if supported)
- **Offline indicator**: Banner when connection lost
- **Reconnect**: Auto-reconnect SSE on network restore

### Navigation Integration

Add to existing Navigation component:
```jsx
{ path: '/chat', label: 'Chat', icon: '💬' }
```

---

## Line Notifications (Phase 2)

- Push notification when:
  - Session crashes and auto-recovers
  - Long-running task completes
  - Session idle timeout warning (30 min)
- Uses Line Notify API (simple token-based, no bot SDK needed)
- Configured via environment variable `LINE_NOTIFY_TOKEN`

---

## Data Flow

### Send Message Flow
```
User types → POST /api/chat/sessions/:id/message
  → Backend SSH exec: claude -p "message" --resume $ID --model $MODEL --output-format stream-json
  → Parse stream-json lines → SSE events to frontend
  → Frontend renders messages in real-time
  → On "result" event → save message count, update lastActivity
```

### Resume Session Flow
```
User opens /chat → GET /api/chat/sessions
  → Frontend shows session list
  → User taps session → GET /api/chat/sessions/:id/history
  → Load previous messages
  → Ready for new messages (--resume $ID ensures Claude remembers context)
```

### Auto-Recovery Flow
```
HealthMonitor detects dead process
  → Attempts restart: claude -p "" --resume $ID
  → If success: update status, push Line notification "Session recovered"
  → If fail 3x: mark as "crashed", push Line notification "Session needs attention"
```

---

## File Structure (New Files)

```
server/
  modules/
    claudeRunner.js      # Core: spawn & manage claude -p processes
    chatSessionStore.js   # JSON-based session persistence
    chatHealthMonitor.js  # Background health checks + auto-recovery
  routes/
    chatRoutes.js         # Express router for /api/chat/*

client/
  src/
    pages/
      ChatPage.jsx        # Main chat page
    components/
      chat/
        SessionDrawer.jsx   # Mobile session list drawer
        SessionSidebar.jsx  # Desktop session list sidebar
        ChatHeader.jsx      # Header with model selector
        MessageList.jsx     # Message display with streaming
        MessageInput.jsx    # Bottom-anchored input
        MessageBubble.jsx   # Individual message component
        ToolCard.jsx        # Collapsible tool usage display
        ModelSelector.jsx   # Model dropdown
        NewSessionModal.jsx # Create session dialog
```

---

## Deployment Notes

- Runs on existing `system-monitor` pod (no new deployment needed)
- Claude CLI must be installed on remote servers (already is)
- SSH key auth already configured in `servers.json`
- Session data stored in pod volume (survives restarts)
- Docker image: same `localhost:30500/system-monitor:latest`
