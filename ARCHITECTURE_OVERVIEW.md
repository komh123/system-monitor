# Claude Remote Control Monitoring System - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express.js Server                           │
│                   (server/index.js)                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │           Monitor Orchestrator (534 lines)              │   │
│  │         (Coordination & Decision Layer)                 │   │
│  │                                                          │   │
│  │  • 30-second cron loop                                  │   │
│  │  • In-memory state management                           │   │
│  │  • Status transition detection                          │   │
│  │  • Email alert coordination                             │   │
│  │  • Recovery triggering                                  │   │
│  └─────────────┬──────────────┬──────────────┬─────────────┘   │
│                │              │              │                  │
│                ▼              ▼              ▼                  │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│    │ ClaudeRemote │  │ TmuxTracker  │  │   System     │      │
│    │   Monitor    │  │  (137 lines) │  │   Metrics    │      │
│    │ (235 lines)  │  │              │  │  (79 lines)  │      │
│    │              │  │ • Session    │  │              │      │
│    │ • Process    │  │   exists     │  │ • CPU usage  │      │
│    │   detection  │  │ • Window     │  │ • Memory     │      │
│    │ • API status │  │   count      │  │ • Network    │      │
│    │ • Session ID │  │ • Command    │  │   health     │      │
│    │ • Uptime     │  │   detection  │  │              │      │
│    │   tracking   │  │ • Freeze     │  │              │      │
│    │              │  │   detection  │  │              │      │
│    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│           │                 │                 │                │
│           └─────────────────┴─────────────────┘                │
│                             │                                  │
│                             ▼                                  │
│                    ┌──────────────────┐                        │
│                    │   SSH Pool       │                        │
│                    │  (353 lines)     │                        │
│                    │                  │                        │
│                    │ • Connection     │                        │
│                    │   pooling        │                        │
│                    │ • Heartbeat      │                        │
│                    │ • Auto-reconnect │                        │
│                    │ • Latency        │                        │
│                    │   tracking       │                        │
│                    └─────────┬────────┘                        │
│                              │                                 │
│           ┌──────────────────┼──────────────────┐             │
│           │                  │                  │             │
│           ▼                  ▼                  ▼             │
│    ┌────────────┐     ┌────────────┐     ┌────────────┐     │
│    │  Server A  │     │  Server B  │     │ Network    │     │
│    │ 172.31.6.240│    │172.31.6.187│     │ Health     │     │
│    │            │     │            │     │ (95 lines) │     │
│    │ • Claude   │     │ • Claude   │     │            │     │
│    │   Remote   │     │   Remote   │     │ • ICMP     │     │
│    │   Control  │     │   Control  │     │   ping     │     │
│    │ • Tmux     │     │ • Tmux     │     │ • HTTPS    │     │
│    │   session  │     │   session  │     │   test     │     │
│    └────────────┘     └────────────┘     │ • DNS      │     │
│                                           │   latency  │     │
│                                           └────────────┘     │
│                                                               │
│    ┌──────────────────────────────────────────────────┐     │
│    │         Auto-Recovery Module (257 lines)          │     │
│    │                                                    │     │
│    │  • Soft restart (tmux send-keys)                 │     │
│    │  • Hard restart (tmux kill + new session)        │     │
│    │  • Recovery verification                          │     │
│    │  • Failure counter & cooldown                     │     │
│    │  • Recovery log (circular buffer, 1000 entries)  │     │
│    └──────────────────────────────────────────────────┘     │
│                                                               │
│    ┌──────────────────────────────────────────────────┐     │
│    │         Email Alert System (Nodemailer)           │     │
│    │                                                    │     │
│    │  • Connection failure alerts                      │     │
│    │  • Degraded status alerts                         │     │
│    │  • Recovery success alerts                        │     │
│    │  • Recovery failure alerts                        │     │
│    │  • 1-hour cooldown per alert type                │     │
│    │  • Sensitive info filtering                       │     │
│    └──────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

## Module Hierarchy

### Tier 1: Coordination Layer
- **MonitorOrchestrator** (534 lines)
  - Central coordinator for all monitoring activities
  - Runs 30-second cron loop
  - Manages in-memory state for all servers
  - Triggers auto-recovery and email alerts
  - Exposes API interface for REST endpoints

### Tier 2: Data Collection Layer
- **ClaudeRemoteMonitor** (235 lines)
  - Monitors Claude Remote Control process
  - Parses tmux output for connection status
  - Extracts session ID and bridge ID
  - Tracks connection uptime

- **TmuxTracker** (137 lines)
  - Verifies tmux session existence
  - Counts windows and panes
  - Detects active commands
  - Identifies frozen sessions

- **SystemMetrics** (79 lines)
  - Collects CPU usage
  - Measures memory consumption
  - Integrates network health checks

- **NetworkHealth** (95 lines)
  - ICMP ping to api.anthropic.com
  - HTTPS connectivity test
  - DNS resolution latency

### Tier 3: Infrastructure Layer
- **SSHPool** (353 lines)
  - Maintains persistent SSH connections
  - Heartbeat mechanism (60-second interval)
  - Auto-reconnect with exponential backoff
  - Connection quality tracking (latency-based)
  - Pre-flight connectivity checks

- **SSHKeyLoader** (67 lines)
  - Loads SSH private keys
  - Validates file permissions
  - Supports multiple key formats

### Tier 4: Action Layer
- **AutoRecovery** (257 lines)
  - Soft restart (in tmux session)
  - Hard restart (recreate tmux session)
  - Recovery verification
  - Failure tracking and cooldown
  - Circular log buffer (1000 entries)

## Data Flow

### 1. Monitoring Cycle (Every 30 Seconds)
```
MonitorOrchestrator
    │
    ├─→ For each server (parallel):
    │   │
    │   ├─→ ClaudeRemoteMonitor.checkStatus(ip)
    │   │   └─→ SSHPool.exec("ps aux | grep claude")
    │   │   └─→ SSHPool.exec("tmux capture-pane...")
    │   │   └─→ Parse output → status
    │   │
    │   ├─→ TmuxTracker.checkSession(ip)
    │   │   └─→ SSHPool.exec("tmux ls")
    │   │   └─→ SSHPool.exec("tmux list-windows")
    │   │
    │   └─→ SystemMetrics.collectMetrics(ip)
    │       └─→ SSHPool.exec("top -bn1...")
    │       └─→ SSHPool.exec("free...")
    │       └─→ NetworkHealth.checkHealth(ip)
    │
    └─→ Update serverStates Map
    └─→ Detect status transitions
    └─→ Trigger recovery if needed
    └─→ Send email alerts
```

### 2. Auto-Recovery Flow
```
Status transition: healthy → failed
    │
    ├─→ MonitorOrchestrator.triggerRecovery(ip)
    │
    ├─→ AutoRecovery.recover(ip, reason)
    │   │
    │   ├─→ Attempt 1: softRestart()
    │   │   └─→ SSHPool.exec("tmux send-keys C-c")
    │   │   └─→ Sleep 2s
    │   │   └─→ SSHPool.exec("tmux send-keys 'claude remote-control'")
    │   │   └─→ Verify within 10s
    │   │
    │   ├─→ If failed: hardRestart()
    │   │   └─→ SSHPool.exec("tmux kill-session")
    │   │   └─→ SSHPool.exec("tmux new-session...")
    │   │   └─→ Verify within 15s
    │   │
    │   └─→ Return result
    │
    └─→ MonitorOrchestrator sends email:
        ├─→ Success → "✅ 已恢復" email
        ├─→ Failure (1-2) → Log only
        └─→ Failure (3+) → "🚨 需要手動介入" email
```

### 3. Email Alert Flow
```
Status transition detected
    │
    ├─→ Check if alert cooldown expired
    │   └─→ lastAlerts.get("ip:alertType")
    │
    ├─→ If cooldown OK, send email:
    │   │
    │   ├─→ Parse email list (comma/semicolon separated)
    │   ├─→ Filter sensitive info (use alias, not IP)
    │   ├─→ Send via nodemailer transporter
    │   └─→ Update lastAlerts Map
    │
    └─→ Log result
```

## State Management

### Server State Structure
```javascript
serverStates = Map {
  '172.31.6.240' => {
    hostname: 'ip-172-31-6-240',
    alias: 'Server A',
    status: 'healthy',  // healthy | degraded | failed | unknown
    lastCheck: '2026-02-28T10:30:00Z',

    claudeRemote: {
      running: true,
      sessionId: 'session_01Ncs...',
      bridgeId: 'env_02Abc...',
      apiConnected: true,
      status: 'healthy',
      uptime: 3600,  // seconds
      lastOutput: '·✔︎· Connected · ai-agent-skill · main',
      timestamp: '2026-02-28T10:30:00Z'
    },

    tmux: {
      exists: true,
      windowCount: 1,
      currentCommand: 'claude remote-control',
      frozen: false
    },

    system: {
      cpu: 25.3,  // percentage
      memory: 68.2,  // percentage
      networkReachable: true,
      networkHealth: {
        reachable: true,
        httpsAccessible: true,
        dnsLatency: 15,  // milliseconds
        dnsHealth: 'excellent'
      }
    },

    error: null
  },

  '172.31.6.187' => { /* same structure */ }
}
```

### Recovery Log Structure
```javascript
recoveryLog = [
  {
    timestamp: '2026-02-28T10:25:30Z',
    server: '172.31.6.240',
    event: 'recovery_started',
    reason: 'process_not_running',
    method: null,
    outcome: 'initiated'
  },
  {
    timestamp: '2026-02-28T10:25:35Z',
    server: '172.31.6.240',
    event: 'recovery_success',
    reason: 'process_not_running',
    method: 'soft_restart',
    outcome: 'completed'
  }
]
```

### Alert Cooldown Tracking
```javascript
lastAlerts = Map {
  '172.31.6.240:degraded' => 1709116800000,  // timestamp
  '172.31.6.187:failed' => 1709120400000
}
```

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Monitoring Interval | 30 seconds | Configurable via cron schedule |
| Cycle Duration | 500-1000ms | Parallel execution across servers |
| SSH Connection Pool | Persistent | Reused across all monitoring cycles |
| Heartbeat Interval | 60 seconds | Keeps SSH connections alive |
| Recovery Timeout | 10-15 seconds | Soft: 10s, Hard: 15s |
| Alert Cooldown | 1 hour | Per alert type per server |
| Memory Usage | ~5-10MB | In-memory state + logs |
| Recovery Log Size | 1000 entries | Circular buffer, oldest discarded |

## Security Features

1. **SSH Key Security**
   - Keys loaded from `/root/.ssh/id_ed25519`
   - File permissions validated (must be 600)
   - Never transmitted or logged

2. **Email Alert Filtering**
   - Server IPs replaced with aliases (Server A/B)
   - No hostnames included
   - No session URLs exposed
   - Only status information shared

3. **Error Sanitization**
   - Stack traces not included in emails
   - Error messages sanitized before logging
   - Sensitive paths removed

## Failure Handling

### SSH Connection Failures
- **Detection**: Heartbeat timeout or command execution failure
- **Action**: Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, 30s)
- **Max Attempts**: 5 reconnection attempts
- **Fallback**: Mark connection as `ssh_unreachable`

### Monitoring Cycle Errors
- **Handling**: Try-catch wraps each server's monitoring
- **Impact**: Other servers continue to be monitored
- **State Update**: Server marked as `unknown` with error message
- **Logging**: Error logged with context

### Auto-Recovery Failures
- **Attempt 1**: Soft restart (2s interruption)
- **Attempt 2**: Hard restart (5s interruption)
- **Attempt 3**: Increment failure counter
- **After 3 Failures**: 30-minute cooldown + critical alert email

### Email Delivery Failures
- **Handling**: Catch errors, log, continue monitoring
- **No Retry**: Email failures don't block monitoring
- **Visibility**: Error logged for debugging

## Configuration

### Server Configuration (`server/config/servers.json`)
```json
[
  {
    "ip": "172.31.6.240",
    "alias": "Server A",
    "hostname": "ip-172-31-6-240",
    "user": "ubuntu",
    "privateKeyPath": "/root/.ssh/id_ed25519"
  }
]
```

### Environment Variables
- `SMTP_HOST` - SMTP server (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP port (default: 587)
- `SMTP_USER` - Email username
- `SMTP_PASS` - Email password
- Alert email configured via orchestrator initialization

## Module Statistics

| Module | Lines | Exports | Dependencies |
|--------|-------|---------|--------------|
| MonitorOrchestrator | 534 | 2 | 6 internal |
| SSHPool | 353 | 2 | 2 external |
| AutoRecovery | 257 | 2 | 2 internal |
| ClaudeRemoteMonitor | 235 | 2 | 1 internal |
| TmuxTracker | 137 | 2 | 1 internal |
| NetworkHealth | 95 | 2 | 1 internal |
| SystemMetrics | 79 | 2 | 2 internal |
| SSHKeyLoader | 67 | 2 | 1 external |
| **Total** | **1,757** | **16** | - |

## Integration Points

### Express Server Integration
```javascript
import { getMonitorOrchestrator } from './modules/monitorOrchestrator.js';

// Initialize on server startup
const orchestrator = getMonitorOrchestrator();
await orchestrator.initialize(transporter, alertEmail);
orchestrator.start();

// API endpoints
app.get('/api/claude-remote/status', (req, res) => {
  res.json(orchestrator.getServerStates());
});

app.get('/api/claude-remote/logs', (req, res) => {
  const logs = orchestrator.getRecoveryLogs({ limit: 100 });
  res.json(logs);
});

app.post('/api/claude-remote/recover/:ip', async (req, res) => {
  const result = await orchestrator.manualRecover(req.params.ip);
  res.json(result);
});
```

## Next Steps for Deployment

1. ✅ Module implementation complete (Tasks 1-9)
2. ⏳ REST API endpoints (Task 10)
3. ⏳ Frontend UI (Tasks 11-13)
4. ⏳ K8s deployment config (Task 15)
5. ⏳ Testing and validation (Task 16)
6. ⏳ Documentation (Task 17)
7. ⏳ Production deployment (Task 18)

## Monitoring Loop Example

```
[2026-02-28 10:00:00] Starting monitoring cycle
[2026-02-28 10:00:00] Monitoring Server A (172.31.6.240)...
[2026-02-28 10:00:00] Monitoring Server B (172.31.6.187)...
[2026-02-28 10:00:00.523] Server A: healthy (previous: healthy)
[2026-02-28 10:00:00.687] Server B: healthy (previous: healthy)
[2026-02-28 10:00:00.687] Monitoring cycle completed in 687ms

[2026-02-28 10:00:30] Starting monitoring cycle
[2026-02-28 10:00:30] Monitoring Server A (172.31.6.240)...
[2026-02-28 10:00:30] Monitoring Server B (172.31.6.187)...
[2026-02-28 10:00:30.512] Server A: healthy (previous: healthy)
[2026-02-28 10:00:30.845] Server B: failed (previous: healthy)
[2026-02-28 10:00:30.845] Triggering auto-recovery for Server B (172.31.6.187)
[2026-02-28 10:00:30.845] Recovery reason: process_not_running
[2026-02-28 10:00:32.120] Soft restart completed for Server B
[2026-02-28 10:00:35.340] Recovery verification: success
[2026-02-28 10:00:35.450] Recovery successful for Server B: soft_restart
[2026-02-28 10:00:35.620] Email alert sent to 1 recipient(s) for Server B
[2026-02-28 10:00:35.620] Monitoring cycle completed in 5120ms
```

---

**Architecture designed for reliability, performance, and maintainability.**
