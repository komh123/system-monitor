# System Monitor with Claude Remote Control Monitoring

A comprehensive monitoring system that tracks CPU/memory usage and monitors Claude Code Remote Control sessions across multiple servers with automatic recovery capabilities.

## 🚀 Latest Feature: Dynamic Skills Detection (v2.21.0)

**Production Ready!** Dynamic per-server skills detection via SSH.

- ✅ **Server-Specific Skills**: Each server returns its own installed skills
- ✅ **Auto-Discovery**: New skills detected automatically (no code changes needed)
- ✅ **Fast**: <1s SSH execution (10x faster than `claude skills list`)
- ✅ **Reliable**: Safe fallback to static list on SSH failure
- ✅ **Production Tested**:
  - Server A (172.31.6.240): 1 skill
  - Server B (18.181.190.83): 30 skills

**Quick Test**:
```bash
curl "https://monitor.ko.unieai.com/api/chat/skills?serverIp=18.181.190.83"
```

📚 **Documentation**:
- [DYNAMIC_SKILLS_SUCCESS.md](DYNAMIC_SKILLS_SUCCESS.md) - Test results & validation
- [SKILLS_DETECTION.md](SKILLS_DETECTION.md) - Architecture details
- [HOW_TO_ENABLE_DYNAMIC_SKILLS.md](HOW_TO_ENABLE_DYNAMIC_SKILLS.md) - Deployment guide

## Features

### 1. CPU and Memory Monitoring
- Real-time CPU usage tracking
- Memory usage visualization
- Historical data with charts
- Alert thresholds

### 2. Claude Remote Control Monitoring (New!)
- **Multi-server monitoring**: Track Claude Remote Control status on multiple servers simultaneously
- **Auto-recovery**: Automatic detection and recovery of failed connections
  - Soft restart (tmux send-keys)
  - Hard restart (kill session and recreate)
  - Exponential backoff with cooldown protection
- **Email alerts**: Instant notifications on connection failures and recoveries
- **Network health checks**: Monitor connectivity to api.anthropic.com
- **System metrics**: Track CPU, memory, and network status per server
- **Recovery logs**: Complete audit trail of all recovery events
- **Real-time dashboard**: 30-second auto-refresh with live status updates

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ CPU Monitor  │  │ Claude Remote│  │ Recovery Logs│      │
│  │    Page      │  │  Monitor Page│  │    Page      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ HTTP/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                Backend (Node.js + Express)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Monitor Orchestrator (30s loop)               │  │
│  └──────────────────────────────────────────────────────┘  │
│         │           │           │           │               │
│    ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌────┴────┐        │
│    │SSH Pool │ │ Claude  │ │  Tmux   │ │ Network │        │
│    │         │ │ Remote  │ │ Tracker │ │ Health  │        │
│    │         │ │ Monitor │ │         │ │         │        │
│    └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│         │                                                    │
│    ┌────┴──────────┐  ┌──────────────┐                    │
│    │ Auto-Recovery │  │ Email Alerts │                    │
│    └───────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ SSH (ED25519)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Remote Servers (AWS EC2)                        │
│                                                              │
│  Server A (172.31.6.240)        Server B (172.31.6.187)    │
│  ┌────────────────────┐         ┌────────────────────┐     │
│  │ tmux: claude-remote│         │ tmux: claude-remote│     │
│  │                    │         │                    │     │
│  │ claude remote-     │         │ claude remote-     │     │
│  │   control          │         │   control          │     │
│  └────────────────────┘         └────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 18+ and npm
- Docker (for containerized deployment)
- Kubernetes cluster with kubectl configured (for K8s deployment)
- SSH access to monitored servers with ED25519 private keys

### Local Development

```bash
# Clone repository
cd /home/ubuntu/system-monitor

# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..

# Start development server
npm run dev
```

## Configuration

### Server Configuration

Create or edit `/home/ubuntu/system-monitor/server/config/servers.json`:

```json
[
  {
    "ip": "172.31.6.240",
    "alias": "Server A",
    "hostname": "ip-172-31-6-240",
    "user": "ubuntu",
    "privateKeyPath": "/root/.ssh/id_ed25519"
  },
  {
    "ip": "172.31.6.187",
    "alias": "Server B",
    "hostname": "ip-172-31-6-187",
    "user": "ubuntu",
    "privateKeyPath": "/root/.ssh/id_ed25519"
  }
]
```

**Fields:**
- `ip`: Server IP address (used for SSH connection)
- `alias`: Human-friendly name displayed in UI (e.g., "Server A")
- `hostname`: Server hostname (for verification)
- `user`: SSH username (typically "ubuntu" for AWS EC2)
- `privateKeyPath`: Path to ED25519 private key inside the container

### Environment Variables

Set these environment variables for production:

```bash
ALERT_EMAIL=your-email@example.com  # Email address for alerts
MONITOR_INTERVAL=30                 # Monitoring interval in seconds
SMTP_HOST=smtp.gmail.com           # SMTP server (for email alerts)
SMTP_PORT=587                      # SMTP port
SMTP_USER=your-smtp-user           # SMTP username
SMTP_PASS=your-smtp-password       # SMTP password
```

## API Endpoints

### Claude Remote Control Monitoring

#### GET /api/claude-remote/status

Get current status of all monitored servers.

**Response:**
```json
{
  "172.31.6.240": {
    "hostname": "ip-172-31-6-240",
    "status": "healthy",
    "lastCheck": "2026-02-28T10:30:00.000Z",
    "claudeRemote": {
      "running": true,
      "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "bridgeId": "bridge-a1b2c3d4",
      "apiConnected": true,
      "status": "connected",
      "uptime": 7200000
    },
    "system": {
      "cpu": 15.3,
      "memory": 42.1,
      "networkReachable": true
    }
  },
  "172.31.6.187": {
    "hostname": "ip-172-31-6-187",
    "status": "healthy",
    "lastCheck": "2026-02-28T10:30:00.000Z",
    "claudeRemote": {
      "running": true,
      "sessionId": "a1b2c3d4-1234-5678-9abc-def012345678",
      "bridgeId": "bridge-x9y8z7",
      "apiConnected": true,
      "status": "connected",
      "uptime": 3600000
    },
    "system": {
      "cpu": 8.7,
      "memory": 35.4,
      "networkReachable": true
    }
  }
}
```

**Status Values:**
- `healthy`: All systems operational
- `degraded`: Some issues detected (e.g., network latency)
- `failed`: Critical failure (process not running or API disconnected)
- `unknown`: Unable to determine status

#### GET /api/claude-remote/logs

Get recovery event logs.

**Query Parameters:**
- `limit`: Maximum number of log entries to return (default: 100)

**Response:**
```json
[
  {
    "timestamp": "2026-02-28T10:25:00.000Z",
    "server": "172.31.6.240",
    "event": "recovery_success",
    "reason": "process_not_running",
    "method": "soft_restart",
    "outcome": "completed"
  },
  {
    "timestamp": "2026-02-28T10:24:30.000Z",
    "server": "172.31.6.240",
    "event": "recovery_started",
    "reason": "process_not_running",
    "method": null,
    "outcome": "initiated"
  }
]
```

**Event Types:**
- `recovery_started`: Recovery process initiated
- `recovery_success`: Recovery completed successfully
- `recovery_failed`: Recovery failed
- `recovery_skipped`: Recovery skipped (e.g., in cooldown)

#### POST /api/claude-remote/recover/:ip

Manually trigger recovery for a specific server.

**Parameters:**
- `ip`: Server IP address (e.g., "172.31.6.240")

**Response:**
```json
{
  "success": true,
  "method": "soft_restart",
  "message": "Recovery initiated successfully"
}
```

Or on failure:
```json
{
  "success": false,
  "method": "hard_restart",
  "error": "Process failed to start",
  "failures": 1
}
```

#### GET /api/claude-remote/health/:ip

Get detailed health check for a single server.

**Response:**
```json
{
  "server": {
    "ip": "172.31.6.240",
    "alias": "Server A",
    "hostname": "ip-172-31-6-240"
  },
  "claudeRemote": {
    "running": true,
    "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "bridgeId": "bridge-a1b2c3d4",
    "apiConnected": true,
    "status": "connected",
    "uptime": 7200000
  },
  "tmux": {
    "exists": true,
    "windowCount": 1,
    "currentCommand": "claude remote-control",
    "frozen": false
  },
  "network": {
    "reachable": true,
    "httpsAccessible": true,
    "dnsLatency": 45,
    "dnsHealth": "good"
  },
  "system": {
    "cpu": 15.3,
    "memory": 42.1,
    "networkReachable": true
  }
}
```

#### POST /api/claude-remote/test-ssh/:ip

Test SSH connectivity to a specific server (admin endpoint).

**Response:**
```json
{
  "success": true,
  "latency": 234,
  "message": "SSH connection successful"
}
```

#### GET /api/claude-remote/config

Get monitoring configuration.

**Response:**
```json
{
  "pollingInterval": 30,
  "alertEmail": "cuppot123@gmail.com",
  "cooldownPeriod": 3600,
  "maxFailures": 3
}
```

## Kubernetes Deployment

### Step 1: Create SSH Keys ConfigMap

First, create a Kubernetes ConfigMap containing your SSH private keys:

```bash
# Create ConfigMap from SSH private key file
kubectl create configmap ssh-keys \
  --from-file=id_ed25519=/home/ubuntu/.ssh/id_ed25519 \
  -n deployer-dev

# Or apply from YAML file
kubectl apply -f k8s/configmap-ssh-keys.yaml
```

**Important:** The SSH private key must have correct permissions (600) on the monitored servers. The deployment uses an initContainer to set these permissions inside the pod.

### Step 2: Build and Push Docker Image

```bash
# Build Docker image
docker build -t localhost:30500/system-monitor:v2.0 .

# Push to registry
docker push localhost:30500/system-monitor:v2.0
```

### Step 3: Deploy to Kubernetes

```bash
# Apply deployment configuration
kubectl apply -f k8s/deployment.yaml

# Or use kubectl set image for updates
kubectl set image deployment/system-monitor \
  system-monitor=localhost:30500/system-monitor:v2.0 \
  -n deployer-dev
```

### Step 4: Monitor Deployment

```bash
# Check rollout status
kubectl rollout status deployment/system-monitor -n deployer-dev

# Verify pods are running
kubectl get pods -n deployer-dev | grep system-monitor

# Check logs
kubectl logs -f deployment/system-monitor -n deployer-dev
```

### Step 5: Verify Monitoring

```bash
# Check that monitoring loop is running
kubectl logs deployment/system-monitor -n deployer-dev | grep "Monitoring Server"

# Expected output:
# [2026-02-28T10:30:00.000Z] Monitoring Server A (172.31.6.240)...
# [2026-02-28T10:30:05.000Z] Monitoring Server B (172.31.6.187)...
```

## Troubleshooting

### Common SSH Issues

**Problem:** "Permission denied (publickey)"
```
Solution:
1. Verify SSH key exists at /root/.ssh/id_ed25519 inside container
2. Check key permissions (should be 600)
3. Verify key is correct ED25519 key for the target server
4. Test SSH connection manually:
   kubectl exec -it <pod-name> -n deployer-dev -- ssh -i /root/.ssh/id_ed25519 ubuntu@172.31.6.240
```

**Problem:** "Connection timeout"
```
Solution:
1. Verify network connectivity from pod to target servers
2. Check security group rules (port 22 must be open)
3. Verify IP addresses are correct in servers.json
4. Test with ping:
   kubectl exec -it <pod-name> -n deployer-dev -- ping 172.31.6.240
```

**Problem:** "Host key verification failed"
```
Solution:
1. Add target server to known_hosts:
   kubectl exec -it <pod-name> -n deployer-dev -- ssh-keyscan 172.31.6.240 >> /root/.ssh/known_hosts
2. Or use StrictHostKeyChecking=no (less secure):
   ssh -o StrictHostKeyChecking=no ...
```

### Common Tmux Issues

**Problem:** "no server running on /tmp/tmux-1000/default"
```
Solution:
1. Tmux session doesn't exist on remote server
2. Create manually:
   ssh ubuntu@172.31.6.240
   tmux new-session -d -s claude-remote "claude remote-control"
3. Or trigger auto-recovery via UI
```

**Problem:** "session not found: claude-remote"
```
Solution:
1. Session was deleted or renamed
2. Check existing sessions:
   ssh ubuntu@172.31.6.240
   tmux ls
3. Create new session with correct name:
   tmux new-session -d -s claude-remote "claude remote-control"
```

**Problem:** "tmux capture-pane fails"
```
Solution:
1. Session might be locked or busy
2. Try attaching to session manually:
   ssh ubuntu@172.31.6.240
   tmux attach -t claude-remote
3. Verify claude remote-control is running inside session
```

### Common Email Issues

**Problem:** "Email alerts not received"
```
Solution:
1. Check SMTP credentials in environment variables
2. Verify SMTP_HOST and SMTP_PORT are correct
3. Check spam/junk folder
4. Test SMTP connection:
   kubectl logs deployment/system-monitor -n deployer-dev | grep "email"
5. Verify alert email address is correct (ALERT_EMAIL env var)
```

**Problem:** "Authentication failed (SMTP)"
```
Solution:
1. For Gmail: Enable "App Passwords" in Google Account settings
2. Use app-specific password instead of regular password
3. Verify SMTP_USER and SMTP_PASS are correct
4. Check 2FA settings if enabled
```

**Problem:** "Emails sent too frequently"
```
Solution:
1. This is intentional - cooldown mechanism prevents spam
2. Default cooldown: 1 hour per alert type per server
3. Check lastAlerts tracking in logs
4. Adjust cooldown period in emailAlerts.js if needed
```

### Performance Issues

**Problem:** "High CPU usage"
```
Solution:
1. Check monitoring interval (default: 30 seconds)
2. Increase interval if needed (MONITOR_INTERVAL env var)
3. Verify no infinite loops in monitoring code
4. Check for memory leaks:
   kubectl top pod -n deployer-dev | grep system-monitor
```

**Problem:** "Slow API responses"
```
Solution:
1. Check network latency to monitored servers
2. Optimize SSH command execution (reduce timeout)
3. Add caching for infrequently-changing data
4. Consider connection pooling improvements
```

**Problem:** "Frontend slow to load"
```
Solution:
1. Check API response times (should be <500ms)
2. Verify 30-second polling is not creating excessive requests
3. Optimize React component re-renders
4. Use browser DevTools Performance tab to identify bottlenecks
```

## Testing

Run the test suites to verify functionality:

```bash
cd /home/ubuntu/system-monitor

# Test SSH connectivity
node tests/test-ssh-connectivity.js

# Test auto-recovery mechanisms
node tests/test-auto-recovery.js

# Test email alert functionality
node tests/test-email-alerts.js

# Manual UI testing
# See tests/MANUAL_TESTING_GUIDE.md
```

For detailed manual testing procedures (UI, mobile responsive, performance), see [tests/MANUAL_TESTING_GUIDE.md](tests/MANUAL_TESTING_GUIDE.md).

## Monitoring Loop Details

The monitoring orchestrator runs every 30 seconds and performs these checks:

1. **SSH Connection Health**
   - Verify SSH pool connectivity
   - Measure connection latency
   - Execute heartbeat commands

2. **Claude Remote Status**
   - Check if `claude remote-control` process is running
   - Capture tmux pane output
   - Parse connection status (Connected/Retrying/Failed)
   - Extract session ID and bridge ID
   - Track uptime since last status change

3. **Tmux Session Health**
   - Verify session exists
   - Count windows
   - Detect session freeze (5 consecutive identical outputs)

4. **Network Health**
   - Ping api.anthropic.com
   - Test HTTPS connectivity (port 443)
   - Measure DNS resolution latency

5. **System Metrics**
   - CPU usage
   - Memory usage
   - Network reachability

6. **Auto-Recovery Decision**
   - If status is `failed`, trigger recovery
   - Soft restart (tmux send-keys)
   - Hard restart if soft fails (kill and recreate session)
   - Apply cooldown after 3 consecutive failures

7. **Email Alerts**
   - Send on status transition (healthy → failed)
   - Send on recovery success
   - Send on critical failure (3+ failures)
   - Apply 1-hour cooldown per alert type

## License

[Your License Here]

## Support

For issues or questions:
- Create an issue in the repository
- Check troubleshooting guide above
- Review logs: `kubectl logs deployment/system-monitor -n deployer-dev`

## Version History

### v2.0 (2026-02-28)
- Added Claude Remote Control monitoring
- Multi-server support
- Auto-recovery with soft/hard restart
- Email alerts with cooldown
- Network health checks
- Recovery event logs
- Mobile-responsive UI

### v1.0
- Basic CPU and memory monitoring
- Single-server support
