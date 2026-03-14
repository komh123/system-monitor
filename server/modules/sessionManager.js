/**
 * Claude Remote Control Session Manager
 * 負責重啟、重連和驗證 Remote Control sessions
 */

import { getSSHPool } from './sshPool.js';

export class SessionManager {
  /**
   * 重啟 Remote Control session
   * @param {string} ip - Server IP
   * @param {Object} options - 選項
   * @param {string} options.sessionName - Tmux session 名稱（預設：claude-remote-server-{alias}）
   * @param {string} options.workingDir - 工作目錄（預設：自動偵測）
   * @param {boolean} options.forceKill - 是否強制殺掉舊 session（預設：true）
   * @returns {Promise<Object>} - {success, sessionId, bridgeId, output, error}
   */
  static async restartSession(ip, options = {}) {
    const sshPool = getSSHPool();
    const {
      sessionName = null,
      workingDir = null,
      forceKill = true
    } = options;

    const logPrefix = `[SessionManager] ${ip}`;
    console.log(`${logPrefix} Starting session restart...`);

    try {
      // Step 1: 偵測 Claude CLI 路徑
      console.log(`${logPrefix} [1/6] Detecting Claude CLI...`);
      let claudePath;
      try {
        const whichOutput = await sshPool.exec(ip, 'which claude', { timeout: 5000 });
        claudePath = whichOutput.trim();
      } catch {
        // which 失敗，嘗試常見路徑
        const findOutput = await sshPool.exec(ip,
          'ls ~/.local/bin/claude 2>/dev/null || find /home -name claude -type f 2>/dev/null | head -1',
          { timeout: 5000 }
        );
        claudePath = findOutput.trim();
      }

      if (!claudePath) {
        throw new Error('Claude CLI not found. Please install Claude first.');
      }
      console.log(`${logPrefix} ✓ Claude CLI found at: ${claudePath}`);

      // Step 2: 偵測工作目錄
      let finalWorkingDir = workingDir;
      if (!finalWorkingDir) {
        console.log(`${logPrefix} [2/6] Detecting working directory...`);
        const dirsOutput = await sshPool.exec(ip,
          'for d in /home/ubuntu/agent-skill /home/ubuntu/k8s-auto-deployer-fastapi /home/ubuntu; do [ -d "$d" ] && echo "$d" && break; done',
          { timeout: 5000 }
        );
        finalWorkingDir = dirsOutput.trim() || '/home/ubuntu';
      }
      console.log(`${logPrefix} ✓ Working directory: ${finalWorkingDir}`);

      // Step 3: 確定 session 名稱
      let finalSessionName = sessionName;
      if (!finalSessionName) {
        // 從 IP 的最後一組數字生成簡短名稱
        const ipSuffix = ip.split('.').pop();
        finalSessionName = `claude-remote-${ipSuffix}`;
      }
      console.log(`${logPrefix} ✓ Session name: ${finalSessionName}`);

      // Step 4: 殺掉舊 session（如果存在）
      if (forceKill) {
        console.log(`${logPrefix} [3/6] Killing old session...`);
        try {
          await sshPool.exec(ip, `tmux kill-session -t ${finalSessionName}`, { timeout: 3000 });
          console.log(`${logPrefix} ✓ Old session killed`);
        } catch {
          console.log(`${logPrefix} ✓ No old session to kill`);
        }

        // 等待 1 秒確保資源釋放
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 5: 建立新 session 並啟動 Claude
      console.log(`${logPrefix} [4/6] Creating new session...`);
      const startCmd = `tmux new-session -d -s ${finalSessionName} && ` +
                      `tmux send-keys -t ${finalSessionName} 'cd ${finalWorkingDir}' C-m && ` +
                      `tmux send-keys -t ${finalSessionName} '${claudePath} remote-control' C-m`;

      await sshPool.exec(ip, startCmd, { timeout: 5000 });
      console.log(`${logPrefix} ✓ Session created`);

      // Step 5.5: 自動選擇 spawn mode option 1 (same-dir)
      console.log(`${logPrefix} [4.5/6] Auto-selecting spawn mode...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        await sshPool.exec(ip, `tmux send-keys -t ${finalSessionName} '1' C-m`, { timeout: 3000 });
        console.log(`${logPrefix} ✓ Spawn mode selected`);
      } catch {
        console.log(`${logPrefix} ⚠ Could not select spawn mode (may already be set)`);
      }

      // Step 6: 等待 5 秒後驗證（Claude 啟動需要時間）
      console.log(`${logPrefix} [5/6] Waiting for Claude to start...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 擷取 tmux 輸出
      const tmuxOutput = await sshPool.exec(ip,
        `tmux capture-pane -t ${finalSessionName} -p -S -10`,
        { timeout: 5000 }
      );

      // 解析 Session ID 和 Bridge ID
      const sessionMatch = tmuxOutput.match(/session_([A-Za-z0-9]+)/);
      const bridgeMatch = tmuxOutput.match(/bridge=env_([A-Za-z0-9]+)/);

      const sessionId = sessionMatch ? sessionMatch[1] : null;
      const bridgeId = bridgeMatch ? bridgeMatch[1] : null;

      // 驗證 Claude 進程
      console.log(`${logPrefix} [6/6] Verifying Claude process...`);
      let claudePid = null;
      try {
        const pidOutput = await sshPool.exec(ip,
          `pgrep -f "claude remote-control" | head -1`,
          { timeout: 3000 }
        );
        claudePid = pidOutput.trim();
      } catch {
        // pgrep 失敗不代表 session 失敗，可能只是還在啟動中
      }

      const success = sessionId && bridgeId;
      const status = success ? 'connected' : 'starting';

      console.log(`${logPrefix} ✅ Session restart ${success ? 'SUCCESS' : 'PARTIAL'}`);
      console.log(`${logPrefix}    Session ID: ${sessionId || 'pending'}`);
      console.log(`${logPrefix}    Bridge ID: ${bridgeId || 'pending'}`);
      console.log(`${logPrefix}    Claude PID: ${claudePid || 'pending'}`);

      return {
        success: true,
        ip,
        sessionName: finalSessionName,
        sessionId,
        bridgeId,
        claudePid,
        workingDir: finalWorkingDir,
        claudePath,
        status,
        output: tmuxOutput.slice(0, 500),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`${logPrefix} ❌ Session restart FAILED:`, error.message);
      return {
        success: false,
        ip,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 重新連接到現有 session（重啟監控系統的 SSH 連線）
   * @param {string} ip - Server IP
   * @returns {Promise<Object>}
   */
  static async reconnectSession(ip) {
    const sshPool = getSSHPool();
    const logPrefix = `[SessionManager] ${ip}`;

    console.log(`${logPrefix} Reconnecting to server...`);

    try {
      // 測試連線
      const testOutput = await sshPool.exec(ip, 'echo "connection_test"', { timeout: 5000 });

      if (testOutput.trim() === 'connection_test') {
        console.log(`${logPrefix} ✓ Connection verified`);

        // 檢查現有 sessions
        const sessionsOutput = await sshPool.exec(ip,
          `tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^claude-remote' || echo ""`,
          { timeout: 5000 }
        );

        const sessions = sessionsOutput.trim().split('\n').filter(s => s);

        return {
          success: true,
          ip,
          connected: true,
          activeSessions: sessions,
          timestamp: new Date().toISOString()
        };
      }

      throw new Error('Connection test failed');

    } catch (error) {
      console.error(`${logPrefix} ❌ Reconnection FAILED:`, error.message);
      return {
        success: false,
        ip,
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 取得 session 狀態
   * @param {string} ip - Server IP
   * @param {string} sessionName - Session 名稱
   * @returns {Promise<Object>}
   */
  static async getSessionStatus(ip, sessionName) {
    const sshPool = getSSHPool();

    try {
      // 檢查 tmux session 是否存在
      const sessionsOutput = await sshPool.exec(ip,
        `tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^${sessionName}$' || echo ""`,
        { timeout: 3000 }
      );

      if (!sessionsOutput.trim()) {
        return {
          exists: false,
          running: false,
          ip,
          sessionName
        };
      }

      // 擷取 tmux 輸出
      const tmuxOutput = await sshPool.exec(ip,
        `tmux capture-pane -t ${sessionName} -p -S -10`,
        { timeout: 5000 }
      );

      // 解析 Session ID
      const sessionMatch = tmuxOutput.match(/session_([A-Za-z0-9]+)/);
      const sessionId = sessionMatch ? sessionMatch[1] : null;

      // 檢查 Claude 進程
      const pidOutput = await sshPool.exec(ip,
        `pgrep -f "claude remote-control" | head -1`,
        { timeout: 3000 }
      );

      const claudePid = pidOutput.trim();

      return {
        exists: true,
        running: !!claudePid,
        ip,
        sessionName,
        sessionId,
        claudePid: claudePid || null,
        output: tmuxOutput.slice(0, 300)
      };

    } catch (error) {
      return {
        exists: false,
        running: false,
        ip,
        sessionName,
        error: error.message
      };
    }
  }
}
