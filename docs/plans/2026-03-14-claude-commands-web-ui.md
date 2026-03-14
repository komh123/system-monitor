# Claude Code Commands in Web UI — Design Document

> Date: 2026-03-14
> Goal: Replicate Claude Code CLI slash commands, MCP tools, and session management in web chat interface

## Problem Statement

The Claude Chat Proxy currently only supports basic message send/receive. The full Claude Code CLI has powerful commands like:
- `/compact` — Compress conversation context
- `/cost` — Show API usage costs
- `/context` — View context window usage
- `/clear` — Clear conversation
- MCP server integration (Obsidian, Chrome DevTools, etc.)
- Slash command/skill invocation

**User needs**: Access ALL Claude Code features from the web interface, not just chat.

---

## Research Summary

### Claude Code Command Categories

Based on [Claude Code Docs](https://code.claude.com/docs/en/slash-commands) and [SmartScope reference](https://smartscope.blog/en/generative-ai/claude/claude-code-reference-guide/):

1. **Session Management**
   - `/compact` — Compress context (reduces tokens by ~70%)
   - `/clear` — Clear conversation
   - `/context` — Show context usage
   - `/cost` — Show API costs
   - `/release-notes` — View changelog

2. **Skills/Slash Commands** (60+ available)
   - `/debug`, `/simplify`, `/batch`, `/loop`
   - `/ui-ux-pro-max`, `/code-review-expert`
   - `/superpower:*` family (brainstorm, tdd, debug, etc.)
   - `/opsx:*` family (propose, apply, verify, etc.)

3. **MCP Integration** ([MCP Connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector))
   - Connect to external tools (GitHub, Slack, Databases)
   - Already configured in `~/.claude/mcp_settings.json`
   - Includes: `mcp-obsidian`, `chrome-devtools`

4. **Agents**
   - `general-purpose`, `Explore`, `Plan`, `claude-code-guide`

---

## Design

### Architecture

```
┌─────────────────────────────────────────────────┐
│              Web Chat UI                         │
│  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ Message Box │  │  Command Palette (Cmd+K)  │ │
│  │  /compact   │  │  • Session commands       │ │
│  │  /cost      │  │  • Skills list            │ │
│  │  /context   │  │  • MCP tools              │ │
│  └─────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────┘
                      │ API
                      ▼
┌─────────────────────────────────────────────────┐
│              Backend (Express)                   │
│  ┌──────────────────────────────────────────┐  │
│  │ ClaudeRunner                               │  │
│  │  • Parse slash commands from messages      │  │
│  │  • /compact → append to claude args        │  │
│  │  • /cost → parse result from stream        │  │
│  │  • /mcp → expose available MCP tools       │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                      │ SSH + PTY
                      ▼
              claude -p --resume
              (with slash command support)
```

### Key Insight

Claude CLI **natively supports** slash commands when run in `-p` mode. We just need to:
1. **Pass them through** in the message (e.g., `/compact`)
2. **Parse special responses** for commands that return structured data (`/cost`, `/context`)
3. **Expose MCP tools** as selectable options in UI

---

## Implementation Plan

### Phase 1: Slash Command Pass-Through

**Goal**: Let users type `/compact`, `/cost`, `/context` in the message box

**Changes**:
- **Backend**: No changes needed — slash commands work as-is when passed to `claude -p`
- **Frontend**: Add slash command autocomplete in `MessageInput.jsx`

**Example**:
```
User types: /compact
→ Sent to claude -p --resume SESSION_ID "/compact"
→ Claude compresses context, responds with confirmation
```

### Phase 2: Command Palette (Cmd+K)

**Goal**: Searchable command menu like VS Code

**UI**:
```
┌─────────────────────────────────────────┐
│ 🔍 Search commands...                   │
├─────────────────────────────────────────┤
│ 📊 /context    Show context usage       │
│ 💰 /cost       Show API costs           │
│ 🗜️  /compact    Compress conversation    │
│ 🗑️  /clear      Clear session            │
│ ───────────────────────────────────────  │
│ Skills                                   │
│ 🧪 /superpower:tdd  Test-driven dev     │
│ 🎨 /ui-ux-pro-max   UI/UX design        │
│ 🔍 /opsx:explore    Explore mode        │
│ ───────────────────────────────────────  │
│ MCP Tools                                │
│ 📝 Obsidian    Access notes             │
│ 🌐 Chrome      Browser automation       │
└─────────────────────────────────────────┘
```

**New Component**: `CommandPalette.jsx`
- Triggered by `Cmd+K` or `/` in message input
- Fetches available commands from backend
- Inserts selected command into message box

**New API**: `GET /api/chat/commands`
```json
{
  "commands": [
    {"id": "compact", "name": "/compact", "description": "Compress context", "category": "session"},
    {"id": "cost", "name": "/cost", "description": "Show API costs", "category": "session"},
    ...
  ],
  "skills": [...],
  "mcpTools": [...]
}
```

### Phase 3: Structured Command Responses

**Goal**: Parse `/cost`, `/context` responses and show them in nice UI

**Challenge**: `/cost` and `/context` output is currently plain text in stream

**Solution**: Parse known patterns from assistant response

**Example** (`/context`):
```
Assistant response: "Context usage: 45,234 / 200,000 tokens (22%)"
→ Parse → Show progress bar in UI
```

**New Component**: `CommandResult.jsx`
- Detects command responses
- Renders them as cards (not chat bubbles)

### Phase 4: MCP Tool Discovery

**Goal**: Show available MCP tools from `~/.claude/mcp_settings.json`

**New API**: `GET /api/chat/mcp-tools`
```json
{
  "tools": [
    {
      "name": "mcp-obsidian",
      "command": "npx mcp-obsidian",
      "description": "Access Obsidian notes",
      "status": "connected"
    },
    {
      "name": "chrome-devtools",
      "command": "npx chrome-devtools-mcp",
      "description": "Browser automation",
      "status": "connected"
    }
  ]
}
```

**Usage**: User selects "Obsidian" from palette → inserts template:
```
Search my Obsidian notes for [topic]
```

---

## Mobile Considerations

**Command Palette on Mobile**:
- Trigger via `/` button next to Send
- Full-screen modal (not dropdown)
- Large touch targets (60px)
- Grouped by category (Session / Skills / MCP)

**Keyboard shortcuts** (desktop only):
- `Cmd+K` — Open palette
- `Esc` — Close
- `↑↓` — Navigate
- `Enter` — Select

---

## File Structure

```
server/
  routes/
    chatRoutes.js              # Add: GET /commands, GET /mcp-tools
  modules/
    claudeCommandParser.js     # NEW: Parse /cost, /context responses

client/src/
  components/chat/
    CommandPalette.jsx         # NEW: Cmd+K searchable menu
    CommandResult.jsx          # NEW: Render structured command output
    MessageInput.jsx           # MODIFY: Add / trigger, autocomplete
```

---

## API Endpoints (New)

### `GET /api/chat/commands`
Returns available slash commands, skills, and agents.

```json
{
  "sessionCommands": [
    {"id": "compact", "name": "/compact", "description": "Compress context"},
    {"id": "cost", "name": "/cost", "description": "Show API costs"},
    {"id": "context", "name": "/context", "description": "Show token usage"},
    {"id": "clear", "name": "/clear", "description": "Clear conversation"}
  ],
  "skills": [
    {"id": "superpower:tdd", "name": "/superpower:tdd", "description": "Test-driven development"},
    {"id": "ui-ux-pro-max", "name": "/ui-ux-pro-max", "description": "UI/UX design"}
  ],
  "agents": [
    {"id": "general-purpose", "name": "General Purpose Agent"},
    {"id": "Explore", "name": "Explore Agent"}
  ]
}
```

### `GET /api/chat/mcp-tools`
Returns MCP servers from `~/.claude/mcp_settings.json`.

```json
{
  "tools": [
    {"name": "mcp-obsidian", "description": "Access Obsidian vault", "status": "connected"},
    {"name": "chrome-devtools", "description": "Browser automation", "status": "connected"}
  ]
}
```

---

## Testing Plan

1. **Basic slash commands**: Type `/compact`, `/cost`, `/context` → verify they work
2. **Command palette**: Press `Cmd+K` → search → select → verify inserted
3. **MCP tools**: Verify MCP servers listed, can be referenced in prompts
4. **Mobile**: Verify `/` button opens full-screen palette
5. **Structured responses**: `/cost` → verify parsed and shown as card

---

## Implementation Phases

| Phase | Feature | Complexity | Impact |
|-------|---------|------------|--------|
| 1 | Slash command pass-through | Low | High (enables /compact, /cost immediately) |
| 2 | Command palette (Cmd+K) | Medium | High (discoverability++) |
| 3 | Structured command parsing | Medium | Medium (nicer UX for /cost, /context) |
| 4 | MCP tool discovery | Low | Medium (exposes existing MCP servers) |

**Recommended**: Start with Phase 1 (quick win) → Phase 2 (best UX improvement)

---

## References

- [Claude Code Slash Commands](https://code.claude.com/docs/en/slash-commands)
- [MCP Integration Guide](https://code.claude.com/docs/en/mcp)
- [Claude Code Complete Reference](https://smartscope.blog/en/generative-ai/claude/claude-code-reference-guide/)
- [MCP Connector API](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Model Context Protocol](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
