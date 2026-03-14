/**
 * Claude Remote Control Monitor Module
 * Monitors Claude Remote Control process status, API connection, and session info
 */

import { getSSHPool } from './sshPool.js';

class ClaudeRemoteMonitor {
  constructor() {
    this.uptimeTrackers = new Map(); // Map<ip, {startTime, lastStatus}>
  }

  /**
   * Check Claude Remote Control status on a server (supports multiple sessions)
   * @param {string} ip - Server IP
   * @returns {Promise<Object>} Status object with sessions array
   */
  async checkStatus(ip) {
    try {
      const sshPool = getSSHPool();

      // Detect all tmux sessions running claude remote-control
      const sessions = await this.detectAllSessions(ip);

      if (sessions.length === 0) {
        return {
          running: false,
          sessions: [],
          status: 'no_sessions',
          timestamp: new Date().toISOString()
        };
      }

      // Check status for each session
      const sessionStatuses = await Promise.all(
        sessions.map(session => this.checkSessionStatus(ip, session))
      );

      // Determine overall status
      const hasHealthy = sessionStatuses.some(s => s.status === 'healthy');
      const hasDegraded = sessionStatuses.some(s => s.status === 'degraded');
      const allFailed = sessionStatuses.every(s => s.status === 'failed');

      let overallStatus = 'unknown';
      if (hasHealthy) {
        overallStatus = 'healthy';
      } else if (hasDegraded) {
        overallStatus = 'degraded';
      } else if (allFailed) {
        overallStatus = 'failed';
      }

      return {
        running: true,
        sessions: sessionStatuses,
        status: overallStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error checking Claude Remote status on ${ip}:`, error.message);
      return {
        running: false,
        sessions: [],
        status: 'unknown',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Detect all tmux sessions running claude remote-control
   * Strategy: Find tmux sessions with name pattern "claude-remote*", then verify claude is running
   * @returns {Promise<Array>} Array of {tmuxSession, pid}
   */
  async detectAllSessions(ip) {
    try {
      const sshPool = getSSHPool();

      // Find all tmux sessions matching "claude-remote*"
      const tmuxListOutput = await sshPool.exec(ip,
        `tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^claude-remote' || true`,
        { timeout: 5000 });

      console.log(`[ClaudeRemote] tmux sessions matching 'claude-remote' on ${ip}:`, JSON.stringify(tmuxListOutput));

      const sessionNames = tmuxListOutput.trim().split('\n').filter(s => s && s.startsWith('claude-remote'));

      if (sessionNames.length === 0) {
        console.log(`[ClaudeRemote] No claude-remote tmux sessions found on ${ip}`);
        return [];
      }

      // For each session, verify it's running claude remote-control
      const sessions = [];
      for (const sessionName of sessionNames) {
        try {
          // Get the pane PID for this session
          const panePid = await sshPool.exec(ip,
            `tmux list-panes -t ${sessionName} -F '#{pane_pid}' 2>/dev/null | head -1`,
            { timeout: 3000 });

          const pid = panePid.trim();
          if (!pid || !pid.match(/^\d+$/)) {
            console.log(`[ClaudeRemote] Invalid PID for session ${sessionName}`);
            continue;
          }

          // Check if this PID or its children are running "claude remote-control"
          const checkClaude = await sshPool.exec(ip,
            `pgrep -P ${pid} -f "claude remote-control" || pgrep -f "^${pid}.*claude remote-control" || true`,
            { timeout: 3000 });

          const claudePid = checkClaude.trim().split('\n')[0];

          if (claudePid && claudePid.match(/^\d+$/)) {
            sessions.push({ tmuxSession: sessionName, pid: claudePid });
            console.log(`[ClaudeRemote] ✓ Found active session: ${sessionName} (claude PID: ${claudePid})`);
          } else {
            console.log(`[ClaudeRemote] ✗ Session ${sessionName} exists but claude not running (pane PID: ${pid})`);
          }
        } catch (error) {
          console.log(`[ClaudeRemote] Error checking session ${sessionName}:`, error.message);
        }
      }

      console.log(`[ClaudeRemote] Found ${sessions.length} active session(s) on ${ip}`);
      return sessions;
    } catch (error) {
      console.error(`Failed to detect sessions on ${ip}:`, error.message);
      return [];
    }
  }

  /**
   * Check status for a specific session
   */
  async checkSessionStatus(ip, sessionInfo) {
    try {
      const sshPool = getSSHPool();
      const { tmuxSession, pid } = sessionInfo;

      // Capture tmux output for this session
      const tmuxOutput = await sshPool.exec(ip,
        `tmux capture-pane -t ${tmuxSession} -p -S -10`,
        { timeout: 5000 });

      // Parse connection status
      const connectionStatus = this.parseConnectionStatus(tmuxOutput);

      // Extract session ID and bridge ID
      const { sessionId, bridgeId } = this.extractSessionInfo(tmuxOutput);

      // Determine status
      let status = 'unknown';
      let apiConnected = false;

      if (connectionStatus === 'connected') {
        status = 'healthy';
        apiConnected = true;
      } else if (connectionStatus === 'retrying') {
        status = 'degraded';
        apiConnected = false;
      } else if (connectionStatus === 'failed') {
        status = 'failed';
        apiConnected = false;
      }

      // Track uptime for this specific session
      const uptimeKey = `${ip}_${tmuxSession}`;
      const uptime = this.trackUptime(uptimeKey, status);

      return {
        tmuxSession,
        pid,
        sessionId,
        bridgeId,
        apiConnected,
        status,
        uptime,
        lastOutput: tmuxOutput.slice(0, 200),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        tmuxSession: sessionInfo.tmuxSession,
        pid: sessionInfo.pid,
        sessionId: null,
        bridgeId: null,
        apiConnected: false,
        status: 'unknown',
        uptime: 0,
        lastOutput: null,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 3.4: Parse connection status from tmux output
   * @returns {string} 'connected' | 'retrying' | 'failed' | 'unknown'
   */
  parseConnectionStatus(output) {
    if (!output) return 'unknown';

    const lowerOutput = output.toLowerCase();

    // Check for connected state
    if (lowerOutput.includes('connected') || lowerOutput.includes('✔') || lowerOutput.includes('polling for commands')) {
      return 'connected';
    }

    // Check for permanent failure
    if (lowerOutput.includes('giving up') || lowerOutput.includes('session failed')) {
      return 'failed';
    }

    // Check for temporary disconnection (retrying)
    if (lowerOutput.includes('server unreachable') || lowerOutput.includes('reconnect')) {
      return 'retrying';
    }

    return 'unknown';
  }

  /**
   * 3.5: Extract session ID and bridge ID from tmux output
   */
  extractSessionInfo(output) {
    if (!output) {
      return { sessionId: null, bridgeId: null };
    }

    // Remove newlines to handle wrapped session IDs
    const cleanOutput = output.replace(/\n/g, '');

    // Regex to match: https://claude.ai/code/session_<ID>?bridge=env_<ID>
    const sessionRegex = /session_([A-Za-z0-9]+)/;
    const bridgeRegex = /bridge=env_([A-Za-z0-9]+)/;

    const sessionMatch = cleanOutput.match(sessionRegex);
    const bridgeMatch = cleanOutput.match(bridgeRegex);

    return {
      sessionId: sessionMatch ? sessionMatch[1] : null,
      bridgeId: bridgeMatch ? bridgeMatch[1] : null
    };
  }

  /**
   * 3.6: Track connection uptime
   * Returns uptime in seconds
   */
  trackUptime(ip, currentStatus) {
    const tracker = this.uptimeTrackers.get(ip);
    const now = Date.now();

    if (!tracker) {
      // First check
      this.uptimeTrackers.set(ip, {
        startTime: now,
        lastStatus: currentStatus
      });
      return 0;
    }

    // Status changed from failed/degraded to healthy
    if (tracker.lastStatus !== 'healthy' && currentStatus === 'healthy') {
      // Reset uptime counter
      this.uptimeTrackers.set(ip, {
        startTime: now,
        lastStatus: currentStatus
      });
      return 0;
    }

    // Status changed from healthy to failed/degraded
    if (tracker.lastStatus === 'healthy' && currentStatus !== 'healthy') {
      // Record last known uptime
      const lastUptime = Math.floor((now - tracker.startTime) / 1000);
      this.uptimeTrackers.set(ip, {
        startTime: null,
        lastStatus: currentStatus,
        lastKnownUptime: lastUptime
      });
      return lastUptime;
    }

    // Status unchanged and healthy
    if (currentStatus === 'healthy') {
      const uptime = Math.floor((now - tracker.startTime) / 1000);
      tracker.lastStatus = currentStatus;
      return uptime;
    }

    // Status unchanged and not healthy
    tracker.lastStatus = currentStatus;
    return tracker.lastKnownUptime || 0;
  }

  /**
   * Get uptime in human-readable format
   */
  formatUptime(seconds) {
    if (seconds === null || seconds === 0) return 'N/A';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

// Singleton instance
let monitorInstance = null;

export function getClaudeRemoteMonitor() {
  if (!monitorInstance) {
    monitorInstance = new ClaudeRemoteMonitor();
  }
  return monitorInstance;
}

export { ClaudeRemoteMonitor };
