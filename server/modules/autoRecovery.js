/**
 * Auto-Recovery Module
 * Handles automatic restart of Claude Remote Control sessions
 */

import { getSSHPool } from './sshPool.js';
import { getClaudeRemoteMonitor } from './claudeRemoteMonitor.js';

class AutoRecovery {
  constructor() {
    // 7.5: Failure tracking
    this.failureCounters = new Map(); // Map<ip, {count, lastFailure, cooldownUntil}>

    // 7.6: Recovery log (circular buffer, max 1000 entries)
    this.recoveryLog = [];
    this.maxLogSize = 1000;
  }

  /**
   * Attempt to recover Claude Remote Control on a server
   * @param {string} ip - Server IP
   * @param {string} reason - Reason for recovery (process_not_running, api_disconnected, etc.)
   * @param {Object} sessionInfo - Optional session info {tmuxSession, pid}
   * @returns {Promise<Object>} Recovery result
   */
  async recover(ip, reason, sessionInfo = null) {
    const failures = this.failureCounters.get(ip) || { count: 0, lastFailure: null, cooldownUntil: null };

    // Check if in cooldown period (after 3 failures)
    if (failures.cooldownUntil && Date.now() < failures.cooldownUntil) {
      this.logEvent(ip, 'recovery_skipped', reason, null, 'in_cooldown');
      return {
        success: false,
        method: 'none',
        error: 'In cooldown period (30 minutes)',
        inCooldown: true
      };
    }

    this.logEvent(ip, 'recovery_started', reason, null, 'initiated');

    try {
      // 7.2: Try soft restart first
      const softResult = await this.softRestart(ip, sessionInfo);
      if (softResult.success) {
        this.resetFailureCounter(ip);
        this.logEvent(ip, 'recovery_success', reason, 'soft_restart', 'completed');
        return { success: true, method: 'soft_restart' };
      }

      console.log(`Soft restart failed for ${ip}, trying hard restart...`);

      // 7.3: Hard restart if soft fails
      const hardResult = await this.hardRestart(ip, sessionInfo);
      if (hardResult.success) {
        this.resetFailureCounter(ip);
        this.logEvent(ip, 'recovery_success', reason, 'hard_restart', 'completed');
        return { success: true, method: 'hard_restart' };
      }

      // Both failed - increment counter
      this.incrementFailureCounter(ip);
      this.logEvent(ip, 'recovery_failed', reason, 'hard_restart', 'failed');

      return {
        success: false,
        method: 'hard_restart',
        error: hardResult.error,
        failures: failures.count + 1
      };
    } catch (error) {
      this.incrementFailureCounter(ip);
      this.logEvent(ip, 'recovery_failed', reason, 'unknown', error.message);

      return {
        success: false,
        error: error.message,
        failures: failures.count + 1
      };
    }
  }

  /**
   * 7.2: Soft restart - send Ctrl+C and restart command in tmux
   */
  async softRestart(ip, sessionInfo = null) {
    try {
      const sshPool = getSSHPool();

      // Determine tmux session name
      let tmuxSession = 'claude-remote'; // fallback default
      if (sessionInfo && sessionInfo.tmuxSession) {
        tmuxSession = sessionInfo.tmuxSession;
      } else {
        // Try to find existing session
        try {
          const output = await sshPool.exec(ip,
            'ps aux | grep "[c]laude remote-control" | awk \'{print $2}\' | head -1',
            { timeout: 3000 });
          const pid = output.trim();
          if (pid) {
            const tmuxOutput = await sshPool.exec(ip,
              `tmux list-panes -a -F '#{session_name} #{pane_pid}' 2>/dev/null | grep " ${pid}$" | awk '{print $1}' | head -1`,
              { timeout: 3000 });
            const detectedSession = tmuxOutput.trim();
            if (detectedSession) {
              tmuxSession = detectedSession;
            }
          }
        } catch (e) {
          console.log(`Could not detect tmux session, using default: ${tmuxSession}`);
        }
      }

      // Send Ctrl+C to stop current process
      await sshPool.exec(ip, `tmux send-keys -t ${tmuxSession} C-c`, { timeout: 3000 });

      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Send new command
      await sshPool.exec(ip, `tmux send-keys -t ${tmuxSession} "claude remote-control" C-m`, { timeout: 3000 });

      // 7.4: Verify recovery (check within 10 seconds)
      const verified = await this.verifyRecovery(ip, 10000);

      return { success: verified };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 7.3: Hard restart - kill session and create new one
   */
  async hardRestart(ip, sessionInfo = null) {
    try {
      const sshPool = getSSHPool();

      // Determine tmux session name
      let tmuxSession = 'claude-remote'; // fallback default
      if (sessionInfo && sessionInfo.tmuxSession) {
        tmuxSession = sessionInfo.tmuxSession;
      } else {
        // Try to find existing session
        try {
          const output = await sshPool.exec(ip,
            'ps aux | grep "[c]laude remote-control" | awk \'{print $2}\' | head -1',
            { timeout: 3000 });
          const pid = output.trim();
          if (pid) {
            const tmuxOutput = await sshPool.exec(ip,
              `tmux list-panes -a -F '#{session_name} #{pane_pid}' 2>/dev/null | grep " ${pid}$" | awk '{print $1}' | head -1`,
              { timeout: 3000 });
            const detectedSession = tmuxOutput.trim();
            if (detectedSession) {
              tmuxSession = detectedSession;
            }
          }
        } catch (e) {
          console.log(`Could not detect tmux session, using default: ${tmuxSession}`);
        }
      }

      // Kill existing session
      try {
        await sshPool.exec(ip, `tmux kill-session -t ${tmuxSession}`, { timeout: 3000 });
      } catch {
        // Session might not exist, ignore error
      }

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create new session and start claude remote-control
      await sshPool.exec(
        ip,
        'tmux new-session -d -s claude-remote "claude remote-control"',
        { timeout: 5000 }
      );

      // 7.4: Verify recovery (check within 15 seconds)
      const verified = await this.verifyRecovery(ip, 15000);

      return { success: verified };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 7.4: Verify recovery - check if process is running and API is connected
   */
  async verifyRecovery(ip, timeout) {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const monitor = getClaudeRemoteMonitor();
        const status = await monitor.checkStatus(ip);

        if (status.running && status.apiConnected) {
          return true;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        // Continue checking
      }
    }

    return false;
  }

  /**
   * 7.5: Increment failure counter and trigger cooldown if needed
   */
  incrementFailureCounter(ip) {
    const failures = this.failureCounters.get(ip) || { count: 0, lastFailure: null, cooldownUntil: null };

    failures.count++;
    failures.lastFailure = Date.now();

    // After 3 consecutive failures, enter 30-minute cooldown
    if (failures.count >= 3) {
      failures.cooldownUntil = Date.now() + (30 * 60 * 1000); // 30 minutes
      console.error(`Max failures reached for ${ip}, entering 30-minute cooldown`);
    }

    this.failureCounters.set(ip, failures);
  }

  /**
   * Reset failure counter (after successful recovery)
   */
  resetFailureCounter(ip) {
    this.failureCounters.set(ip, { count: 0, lastFailure: null, cooldownUntil: null });
  }

  /**
   * Get failure count for a server
   */
  getFailureCount(ip) {
    const failures = this.failureCounters.get(ip);
    return failures ? failures.count : 0;
  }

  /**
   * Check if server is in cooldown
   */
  isInCooldown(ip) {
    const failures = this.failureCounters.get(ip);
    if (!failures || !failures.cooldownUntil) return false;
    return Date.now() < failures.cooldownUntil;
  }

  /**
   * 7.7: Log recovery event (circular buffer)
   */
  logEvent(ip, event, reason, method, outcome) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      server: ip,
      event,
      reason,
      method,
      outcome
    };

    this.recoveryLog.push(logEntry);

    // Maintain circular buffer
    if (this.recoveryLog.length > this.maxLogSize) {
      this.recoveryLog.shift();
    }

    console.log(`[Recovery Log] ${ip}: ${event} - ${reason} - ${method || 'N/A'} - ${outcome}`);
  }

  /**
   * Get recovery logs (optionally filtered)
   */
  getLogs(options = {}) {
    let logs = [...this.recoveryLog];

    if (options.server) {
      logs = logs.filter(log => log.server === options.server);
    }

    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs.reverse(); // Newest first
  }
}

let recoveryInstance = null;

export function getAutoRecovery() {
  if (!recoveryInstance) {
    recoveryInstance = new AutoRecovery();
  }
  return recoveryInstance;
}

export { AutoRecovery };
