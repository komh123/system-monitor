/**
 * Tmux Session Tracker Module
 * Tracks tmux session state, windows, and pane output
 */

import { getSSHPool } from './sshPool.js';

class TmuxTracker {
  constructor() {
    this.paneHistory = new Map(); // Map<ip, Array<string>> - Last 5 outputs for freeze detection
  }

  /**
   * Check tmux session status
   */
  async checkSession(ip) {
    try {
      const exists = await this.sessionExists(ip);
      if (!exists) {
        return {
          exists: false,
          windowCount: 0,
          currentCommand: null,
          frozen: false
        };
      }

      const windowCount = await this.countWindows(ip);
      const currentCommand = await this.extractCommand(ip);
      const frozen = await this.detectFreeze(ip);

      return {
        exists: true,
        windowCount,
        currentCommand,
        frozen
      };
    } catch (error) {
      console.error(`Error checking tmux session on ${ip}:`, error.message);
      return {
        exists: false,
        windowCount: 0,
        currentCommand: null,
        frozen: false,
        error: error.message
      };
    }
  }

  /**
   * 4.2: Check if claude-remote session exists
   */
  async sessionExists(ip) {
    try {
      const sshPool = getSSHPool();
      const output = await sshPool.exec(ip, 'tmux ls | grep claude-remote', { timeout: 3000 });
      return output.includes('claude-remote:');
    } catch (error) {
      return false;
    }
  }

  /**
   * 4.3: Count tmux windows
   */
  async countWindows(ip) {
    try {
      const sshPool = getSSHPool();
      const output = await sshPool.exec(ip, 'tmux list-windows -t claude-remote', { timeout: 3000 });
      const lines = output.trim().split('\n').filter(line => line.length > 0);
      return lines.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 4.4: Extract active command from pane
   */
  async extractCommand(ip) {
    try {
      const sshPool = getSSHPool();
      const output = await sshPool.exec(ip, 'tmux capture-pane -t claude-remote -p | tail -5', { timeout: 3000 });

      if (output.includes('claude remote-control')) {
        return 'claude remote-control';
      } else if (output.includes('ubuntu@ip-') && output.includes('$')) {
        return 'none'; // Shell prompt visible, no command running
      } else {
        return 'unknown';
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * 4.5: Detect session freeze (output unchanged for 5 consecutive checks)
   */
  async detectFreeze(ip) {
    try {
      const sshPool = getSSHPool();
      const output = await sshPool.exec(ip, 'tmux capture-pane -t claude-remote -p | tail -3', { timeout: 3000 });

      const history = this.paneHistory.get(ip) || [];
      history.push(output);

      // Keep only last 5 outputs
      if (history.length > 5) {
        history.shift();
      }

      this.paneHistory.set(ip, history);

      // If we have 5 identical outputs, consider it frozen
      if (history.length === 5) {
        const allSame = history.every(h => h === history[0]);
        return allSame;
      }

      return false;
    } catch (error) {
      return false;
    }
  }
}

let trackerInstance = null;

export function getTmuxTracker() {
  if (!trackerInstance) {
    trackerInstance = new TmuxTracker();
  }
  return trackerInstance;
}

export { TmuxTracker };
