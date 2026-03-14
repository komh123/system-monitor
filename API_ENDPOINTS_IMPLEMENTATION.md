# Claude Remote Control Monitoring - API Endpoints Implementation

## Overview

This document describes the 6 REST API endpoints added to the system-monitor project for Claude Remote Control monitoring.

## Completed Tasks (10.1-10.7)

All REST API endpoints have been successfully implemented in `/home/ubuntu/system-monitor/server/index.js`.

---

## API Endpoints

### 1. GET /api/claude-remote/status

**Description**: Get current status of all monitored servers

**Request**:
```bash
GET /api/claude-remote/status
```

**Response** (200 OK):
```json
{
  "success": true,
  "servers": {
    "172.31.6.240": {
      "hostname": "ip-172-31-6-240",
      "alias": "Server A",
      "status": "healthy",
      "lastCheck": "2026-02-28T10:30:00Z",
      "claudeRemote": {
        "running": true,
        "sessionId": "01Ncs...",
        "bridgeId": "env_abc...",
        "apiConnected": true,
        "uptime": 3600,
        "lastOutput": "Connected · ai-agent-skill · main"
      },
      "system": {
        "cpu": 25.3,
        "memory": 68.2,
        "networkReachable": true
      }
    },
    "172.31.6.187": { /* ... */ }
  },
  "timestamp": "2026-02-28T10:30:00Z"
}
```

**Error Response** (500):
```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2026-02-28T10:30:00Z"
}
```

---

### 2. GET /api/claude-remote/logs

**Description**: Get recovery event logs

**Request**:
```bash
GET /api/claude-remote/logs?limit=100
```

**Query Parameters**:
- `limit` (optional): Number of log entries to return (1-1000, default: 100)

**Response** (200 OK):
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2026-02-28T10:25:30Z",
      "server": "172.31.6.240",
      "event": "recovery_started",
      "reason": "process_not_running",
      "method": null,
      "outcome": "initiated"
    },
    {
      "timestamp": "2026-02-28T10:25:35Z",
      "server": "172.31.6.240",
      "event": "recovery_success",
      "reason": "process_not_running",
      "method": "soft_restart",
      "outcome": "completed"
    }
  ],
  "count": 2,
  "timestamp": "2026-02-28T10:30:00Z"
}
```

**Error Response** (400):
```json
{
  "success": false,
  "error": "Limit must be between 1 and 1000"
}
```

---

### 3. POST /api/claude-remote/recover/:ip

**Description**: Manually trigger recovery for a specific server

**Request**:
```bash
POST /api/claude-remote/recover/172.31.6.240
```

**Response** (200 OK):
```json
{
  "success": true,
  "result": {
    "success": true,
    "method": "soft_restart"
  },
  "timestamp": "2026-02-28T10:30:00Z"
}
```

**Error Response** (400):
```json
{
  "success": false,
  "error": "Invalid IP address format"
}
```

**Error Response** (500):
```json
{
  "success": false,
  "error": "Server 172.31.6.240 not found in configuration",
  "timestamp": "2026-02-28T10:30:00Z"
}
```

---

### 4. GET /api/claude-remote/health/:ip

**Description**: Get detailed health check for a single server

**Request**:
```bash
GET /api/claude-remote/health/172.31.6.240
```

**Response** (200 OK):
```json
{
  "success": true,
  "health": {
    "hostname": "ip-172-31-6-240",
    "alias": "Server A",
    "status": "healthy",
    "lastCheck": "2026-02-28T10:30:00Z",
    "claudeRemote": {
      "running": true,
      "sessionId": "01Ncs...",
      "bridgeId": "env_abc...",
      "apiConnected": true,
      "uptime": 3600,
      "lastOutput": "Connected"
    },
    "system": {
      "cpu": 25.3,
      "memory": 68.2,
      "networkReachable": true
    }
  },
  "timestamp": "2026-02-28T10:30:00Z"
}
```

**Error Response** (404):
```json
{
  "success": false,
  "error": "Server 172.31.6.240 not found in configuration"
}
```

---

### 5. POST /api/claude-remote/test-ssh/:ip

**Description**: Test SSH connectivity to a server (admin endpoint)

**Request**:
```bash
POST /api/claude-remote/test-ssh/172.31.6.240
```

**Response** (200 OK):
```json
{
  "success": true,
  "connected": true,
  "latency": 45,
  "user": "ubuntu",
  "message": "SSH connection successful (45ms)",
  "timestamp": "2026-02-28T10:30:00Z"
}
```

**Error Response** (503):
```json
{
  "success": false,
  "connected": false,
  "latency": 5000,
  "error": "Connection timeout",
  "message": "SSH connection failed: Connection timeout",
  "timestamp": "2026-02-28T10:30:00Z"
}
```

---

### 6. GET /api/claude-remote/config

**Description**: Get monitoring configuration

**Request**:
```bash
GET /api/claude-remote/config
```

**Response** (200 OK):
```json
{
  "success": true,
  "config": {
    "servers": [
      {
        "ip": "172.31.6.240",
        "alias": "Server A",
        "hostname": "ip-172-31-6-240"
      },
      {
        "ip": "172.31.6.187",
        "alias": "Server B",
        "hostname": "ip-172-31-6-187"
      }
    ],
    "monitoring": {
      "interval": 30,
      "enabled": true
    },
    "autoRecovery": {
      "enabled": true,
      "maxAttempts": 3,
      "cooldownDuration": 1800
    },
    "alerts": {
      "email": "cuppot123@gmail.com",
      "cooldownDuration": 3600
    }
  },
  "timestamp": "2026-02-28T10:30:00Z"
}
```

---

## Implementation Details

### Error Handling (10.7)

All endpoints include comprehensive error handling:

1. **Input Validation**:
   - IP address format validation using regex
   - Query parameter validation (limit: 1-1000)
   - Server existence validation

2. **Error Responses**:
   - 400: Bad Request (invalid input)
   - 404: Not Found (server not in configuration)
   - 500: Internal Server Error (unexpected errors)
   - 503: Service Unavailable (SSH connection failed)

3. **Error Logging**:
   - All errors are logged to console with context
   - Errors include descriptive messages for debugging

4. **Graceful Degradation**:
   - Monitoring continues even if individual checks fail
   - SSH connection failures don't crash the server

### Integration with Monitoring Orchestrator

The API endpoints integrate seamlessly with the monitoring orchestrator:

1. **Singleton Pattern**: Uses `getMonitorOrchestrator()` to access the shared instance
2. **State Management**: Reads from in-memory `serverStates` Map
3. **Recovery Module**: Delegates recovery operations to `AutoRecovery` module
4. **Real-time Data**: Returns current state without additional database queries

### Server Initialization

The monitoring orchestrator is initialized on server startup:

```javascript
// In server/index.js
async function initializeClaudeRemoteMonitoring() {
  try {
    const orchestrator = getMonitorOrchestrator();
    await orchestrator.initialize(transporter, alertEmail);
    orchestrator.start();
    console.log('✓ Claude Remote Control monitoring started');
  } catch (error) {
    console.error('Failed to initialize:', error.message);
  }
}

app.listen(PORT, '0.0.0.0', async () => {
  // ...
  await initializeClaudeRemoteMonitoring();
});
```

---

## Testing

### Manual Testing Commands

```bash
# 1. Get status of all servers
curl http://localhost:3000/api/claude-remote/status

# 2. Get recovery logs (last 50 entries)
curl "http://localhost:3000/api/claude-remote/logs?limit=50"

# 3. Manually trigger recovery
curl -X POST http://localhost:3000/api/claude-remote/recover/172.31.6.240

# 4. Get detailed health for one server
curl http://localhost:3000/api/claude-remote/health/172.31.6.240

# 5. Test SSH connectivity
curl -X POST http://localhost:3000/api/claude-remote/test-ssh/172.31.6.240

# 6. Get monitoring configuration
curl http://localhost:3000/api/claude-remote/config
```

### Expected Behavior

1. **On First Request**: If monitoring not yet started, orchestrator initializes automatically
2. **30-Second Polling**: Background cron job updates state every 30 seconds
3. **Auto-Recovery**: Failed servers trigger automatic recovery (soft → hard restart)
4. **Email Alerts**: Status transitions trigger email notifications (with 1-hour cooldown)

---

## Files Modified

1. `/home/ubuntu/system-monitor/server/index.js` - Added 6 API endpoints + initialization
2. `/home/ubuntu/system-monitor/server/modules/monitorOrchestrator.js` - Created orchestrator module
3. `/home/ubuntu/agent-skill/openspec/changes/add-claude-remote-monitoring/tasks.md` - Marked tasks 10.1-10.7 complete

---

## Next Steps

The following tasks remain to complete the full implementation:

1. **Frontend Development** (Tasks 11.x-13.x):
   - Install React Router
   - Create Claude Remote Monitor page
   - Create Recovery Log page

2. **Email Alert Module** (Tasks 8.x):
   - Email templates already integrated in orchestrator
   - Alert cooldown mechanism implemented

3. **Testing** (Tasks 16.x):
   - Test SSH connectivity
   - Simulate failures and verify recovery
   - Test email delivery

4. **Deployment** (Tasks 18.x):
   - Build and deploy to K8s
   - Configure SSH keys in ConfigMap
   - Verify monitoring in production

---

## API Summary

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/claude-remote/status` | GET | Get all servers status | ✅ Complete |
| `/api/claude-remote/logs` | GET | Get recovery logs | ✅ Complete |
| `/api/claude-remote/recover/:ip` | POST | Manual recovery trigger | ✅ Complete |
| `/api/claude-remote/health/:ip` | GET | Single server health | ✅ Complete |
| `/api/claude-remote/test-ssh/:ip` | POST | SSH connectivity test | ✅ Complete |
| `/api/claude-remote/config` | GET | Get monitoring config | ✅ Complete |

**All API endpoints (Tasks 10.1-10.7) are now complete and ready for testing.**
