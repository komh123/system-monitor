/**
 * Monitor Orchestrator Module
 * Coordinates all monitoring modules (SSH pool, Claude Remote, tmux, system metrics, auto-recovery, email alerts)
 * Runs on 30-second cron interval and maintains in-memory state for all servers
 */

import cron from 'node-cron';
import { getSSHPool } from './sshPool.js';
import { getClaudeRemoteMonitor } from './claudeRemoteMonitor.js';
import { getTmuxTracker } from './tmuxTracker.js';
import { getSystemMetrics } from './systemMetrics.js';
import { getAutoRecovery } from './autoRecovery.js';
import { readFileSync } from 'fs';

class MonitorOrchestrator {
  constructor() {
    // 9.5: In-memory server states
    this.serverStates = new Map(); // Map<ip, ServerState>

    // Server configuration
    this.servers = [];

    // Monitoring task
    this.monitoringTask = null;

    // Email transporter (injected from main server)
    this.emailTransporter = null;
    this.alertEmail = '';

    // Alert tracking (1-hour cooldown per alert type per server)
    this.lastAlerts = new Map(); // Map<"ip:alertType", timestamp>

    // Monitoring status
    this.isRunning = false;
    this.lastRunTime = null;
    this.errorCount = 0;
  }

  /**
   * 9.2: Initialize all modules on startup
   * @param {Object} emailTransporter - Nodemailer transporter instance
   * @param {string} alertEmail - Email address for alerts
   */
  async initialize(emailTransporter = null, alertEmail = '') {
    console.log('[MonitorOrchestrator] Initializing...');

    this.emailTransporter = emailTransporter;
    this.alertEmail = alertEmail;

    try {
      // Load server configuration
      const configPath = process.env.SERVERS_CONFIG_PATH || '/app/server/config/servers.json';
      const configData = readFileSync(configPath, 'utf-8');
      this.servers = JSON.parse(configData);

      console.log(`[MonitorOrchestrator] Loaded ${this.servers.length} servers from config`);

      // Initialize SSH pool
      const sshPool = getSSHPool();
      const connectedCount = await sshPool.initialize(this.servers);

      console.log(`[MonitorOrchestrator] SSH pool initialized: ${connectedCount}/${this.servers.length} servers connected`);

      // Initialize server states
      for (const server of this.servers) {
        this.serverStates.set(server.ip, {
          hostname: server.hostname,
          alias: server.alias,
          status: 'unknown',
          lastCheck: null,
          claudeRemote: null,
          tmux: null,
          system: null,
          error: null
        });
      }

      console.log('[MonitorOrchestrator] Initialization complete');
      return true;
    } catch (error) {
      console.error('[MonitorOrchestrator] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 9.3: Start 30-second monitoring loop
   */
  start() {
    if (this.isRunning) {
      console.warn('[MonitorOrchestrator] Already running');
      return;
    }

    // Run immediately on start
    this.runMonitoringCycle().catch(err => {
      console.error('[MonitorOrchestrator] Initial monitoring cycle failed:', err.message);
    });

    // Schedule cron task: every 30 seconds (*/30 * * * * *)
    this.monitoringTask = cron.schedule('*/30 * * * * *', async () => {
      await this.runMonitoringCycle();
    });

    this.isRunning = true;
    console.log('[MonitorOrchestrator] Monitoring loop started (30-second interval)');
  }

  /**
   * Stop monitoring loop
   */
  stop() {
    if (this.monitoringTask) {
      this.monitoringTask.stop();
      this.monitoringTask = null;
    }
    this.isRunning = false;
    console.log('[MonitorOrchestrator] Monitoring loop stopped');
  }

  /**
   * 9.4-9.8: Run one complete monitoring cycle
   */
  async runMonitoringCycle() {
    const startTime = Date.now();

    try {
      console.log(`[MonitorOrchestrator] Starting monitoring cycle at ${new Date().toISOString()}`);

      // Monitor all servers in parallel
      const monitoringPromises = this.servers.map(server => this.monitorServer(server));
      await Promise.allSettled(monitoringPromises);

      this.lastRunTime = new Date().toISOString();
      const duration = Date.now() - startTime;

      console.log(`[MonitorOrchestrator] Monitoring cycle completed in ${duration}ms`);
    } catch (error) {
      this.errorCount++;
      console.error('[MonitorOrchestrator] Monitoring cycle error:', error.message);
    }
  }

  /**
   * 9.4: Monitor a single server
   */
  async monitorServer(server) {
    const { ip, hostname, alias } = server;

    try {
      console.log(`[MonitorOrchestrator] Monitoring ${alias} (${ip})...`);

      // 9.4: Collect all status data in parallel
      const [claudeRemoteStatus, tmuxStatus, systemMetrics] = await Promise.allSettled([
        getClaudeRemoteMonitor().checkStatus(ip),
        getTmuxTracker().checkSession(ip),
        getSystemMetrics().collectMetrics(ip)
      ]);

      // Extract results
      const claudeRemote = claudeRemoteStatus.status === 'fulfilled' ? claudeRemoteStatus.value : { error: claudeRemoteStatus.reason?.message };
      const tmux = tmuxStatus.status === 'fulfilled' ? tmuxStatus.value : { error: tmuxStatus.reason?.message };
      const system = systemMetrics.status === 'fulfilled' ? systemMetrics.value : { error: systemMetrics.reason?.message };

      // Determine overall server status
      const status = this.determineServerStatus(claudeRemote, tmux, system);
      const previousStatus = this.serverStates.get(ip)?.status || 'unknown';

      // 9.5: Update in-memory state
      this.serverStates.set(ip, {
        hostname,
        alias,
        status,
        lastCheck: new Date().toISOString(),
        claudeRemote,
        tmux,
        system,
        error: null
      });

      console.log(`[MonitorOrchestrator] ${alias}: ${status} (previous: ${previousStatus})`);

      // 9.6: Trigger auto-recovery if needed
      if (status === 'failed' && previousStatus !== 'failed') {
        await this.triggerRecovery(ip, alias, claudeRemote);
      }

      // 9.7: Send email alerts on status transitions
      await this.handleAlerts(ip, alias, status, previousStatus, claudeRemote);

    } catch (error) {
      // 9.8: Handle errors gracefully
      console.error(`[MonitorOrchestrator] Error monitoring ${alias} (${ip}):`, error.message);

      this.serverStates.set(ip, {
        hostname,
        alias,
        status: 'unknown',
        lastCheck: new Date().toISOString(),
        claudeRemote: null,
        tmux: null,
        system: null,
        error: error.message
      });
    }
  }

  /**
   * Determine overall server status based on module outputs
   */
  determineServerStatus(claudeRemote, tmux, system) {
    // If Claude Remote monitor reports a status, use it
    if (claudeRemote?.status) {
      return claudeRemote.status;
    }

    // If Claude Remote process is not running
    if (claudeRemote?.running === false) {
      return 'failed';
    }

    // If tmux session doesn't exist
    if (tmux?.exists === false) {
      return 'failed';
    }

    // If network is unreachable
    if (system?.networkReachable === false) {
      return 'degraded';
    }

    // Default
    return 'unknown';
  }

  /**
   * 9.6: Trigger auto-recovery for failed servers
   */
  async triggerRecovery(ip, alias, claudeRemote) {
    console.log(`[MonitorOrchestrator] Triggering auto-recovery for ${alias} (${ip})`);

    // Determine reason for failure
    let reason = 'unknown';
    if (!claudeRemote?.running) {
      reason = 'process_not_running';
    } else if (!claudeRemote?.apiConnected) {
      reason = 'api_disconnected';
    } else if (claudeRemote?.status === 'failed') {
      reason = 'connection_failed';
    }

    // Get first failed session info (if any)
    let sessionInfo = null;
    if (claudeRemote?.sessions && claudeRemote.sessions.length > 0) {
      const failedSession = claudeRemote.sessions.find(s => s.status === 'failed' || s.status === 'degraded');
      if (failedSession) {
        sessionInfo = {
          tmuxSession: failedSession.tmuxSession,
          pid: failedSession.pid
        };
      }
    }

    try {
      const recovery = getAutoRecovery();
      const result = await recovery.recover(ip, reason, sessionInfo);

      if (result.success) {
        console.log(`[MonitorOrchestrator] Recovery successful for ${alias}: ${result.method}`);

        // Send recovery success email
        await this.sendRecoverySuccessEmail(alias, reason, result.method);
      } else {
        console.error(`[MonitorOrchestrator] Recovery failed for ${alias}:`, result.error);

        // Send recovery failure email if in cooldown or max failures reached
        if (result.inCooldown || (result.failures && result.failures >= 3)) {
          await this.sendRecoveryFailureEmail(alias, reason, result.error, result.failures);
        }
      }
    } catch (error) {
      console.error(`[MonitorOrchestrator] Recovery error for ${alias}:`, error.message);
    }
  }

  /**
   * 9.7: Handle email alerts based on status transitions
   */
  async handleAlerts(ip, alias, currentStatus, previousStatus, claudeRemote) {
    // Alert on transition to failed state
    if (currentStatus === 'failed' && previousStatus !== 'failed') {
      await this.sendConnectionFailureEmail(alias, claudeRemote);
    }

    // Alert on transition to degraded state (with cooldown)
    if (currentStatus === 'degraded' && previousStatus === 'healthy') {
      const alertKey = `${ip}:degraded`;
      if (this.shouldSendAlert(alertKey)) {
        await this.sendDegradedEmail(alias, claudeRemote);
        this.lastAlerts.set(alertKey, Date.now());
      }
    }

    // Alert on transition back to healthy (recovery without auto-recovery)
    if (currentStatus === 'healthy' && (previousStatus === 'failed' || previousStatus === 'degraded')) {
      await this.sendRecoverySuccessEmail(alias, 'spontaneous_recovery', 'self_recovered');
    }
  }

  /**
   * Check if alert should be sent (1-hour cooldown)
   */
  shouldSendAlert(alertKey) {
    const lastAlertTime = this.lastAlerts.get(alertKey);
    if (!lastAlertTime) return true;

    const hourInMs = 60 * 60 * 1000;
    return (Date.now() - lastAlertTime) >= hourInMs;
  }

  /**
   * Send connection failure email
   */
  async sendConnectionFailureEmail(alias, claudeRemote) {
    if (!this.emailTransporter || !this.alertEmail) {
      console.log('[MonitorOrchestrator] Email alert skipped (no config)');
      return;
    }

    const emailList = this.parseEmailList(this.alertEmail);
    if (emailList.length === 0) return;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_USER,
        to: emailList.join(', '),
        subject: `⚠️ Claude Remote Control 連線異常 - ${alias}`,
        html: `
          <h2>⚠️ Claude Remote Control 連線異常</h2>
          <p>${alias} 的 Claude Remote Control 已斷線。</p>
          <ul>
            <li><strong>伺服器:</strong> ${alias}</li>
            <li><strong>狀態:</strong> 連線失敗</li>
            <li><strong>時間:</strong> ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</li>
            <li><strong>Process 狀態:</strong> ${claudeRemote?.running ? '運行中' : '未運行'}</li>
            <li><strong>API 連線:</strong> ${claudeRemote?.apiConnected ? '已連線' : '未連線'}</li>
          </ul>
          <p>系統正在嘗試自動恢復...</p>
          <p>請至監控面板查看詳細資訊。</p>
        `
      });
      console.log(`[MonitorOrchestrator] Connection failure email sent to ${emailList.length} recipient(s) for ${alias}`);
    } catch (error) {
      console.error('[MonitorOrchestrator] Failed to send connection failure email:', error.message);
    }
  }

  /**
   * Send degraded status email
   */
  async sendDegradedEmail(alias, claudeRemote) {
    if (!this.emailTransporter || !this.alertEmail) return;

    const emailList = this.parseEmailList(this.alertEmail);
    if (emailList.length === 0) return;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_USER,
        to: emailList.join(', '),
        subject: `⚠️ Claude Remote Control 連線不穩 - ${alias}`,
        html: `
          <h2>⚠️ Claude Remote Control 連線不穩定</h2>
          <p>${alias} 的 Claude Remote Control 連線出現問題，正在重試中。</p>
          <ul>
            <li><strong>伺服器:</strong> ${alias}</li>
            <li><strong>狀態:</strong> 連線不穩定</li>
            <li><strong>時間:</strong> ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</li>
            <li><strong>最後輸出:</strong> ${claudeRemote?.lastOutput || 'N/A'}</li>
          </ul>
          <p>系統會持續監控，如持續失敗將自動重啟。</p>
        `
      });
      console.log(`[MonitorOrchestrator] Degraded status email sent for ${alias}`);
    } catch (error) {
      console.error('[MonitorOrchestrator] Failed to send degraded email:', error.message);
    }
  }

  /**
   * Send recovery success email
   */
  async sendRecoverySuccessEmail(alias, reason, method) {
    if (!this.emailTransporter || !this.alertEmail) return;

    const emailList = this.parseEmailList(this.alertEmail);
    if (emailList.length === 0) return;

    const reasonText = {
      'process_not_running': 'Process 未運行',
      'api_disconnected': 'API 連線中斷',
      'connection_failed': '連線失敗',
      'spontaneous_recovery': '自動恢復'
    }[reason] || reason;

    const methodText = {
      'soft_restart': '軟重啟 (tmux 內重啟)',
      'hard_restart': '硬重啟 (重建 tmux session)',
      'self_recovered': '自行恢復'
    }[method] || method;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_USER,
        to: emailList.join(', '),
        subject: `✅ Claude Remote Control 已恢復 - ${alias}`,
        html: `
          <h2>✅ Claude Remote Control 已恢復</h2>
          <p>${alias} 的 Claude Remote Control 已成功恢復運行。</p>
          <ul>
            <li><strong>伺服器:</strong> ${alias}</li>
            <li><strong>狀態:</strong> 恢復成功</li>
            <li><strong>時間:</strong> ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</li>
            <li><strong>原因:</strong> ${reasonText}</li>
            <li><strong>恢復方法:</strong> ${methodText}</li>
          </ul>
          <p>系統已恢復正常運作。</p>
        `
      });
      console.log(`[MonitorOrchestrator] Recovery success email sent for ${alias}`);
    } catch (error) {
      console.error('[MonitorOrchestrator] Failed to send recovery success email:', error.message);
    }
  }

  /**
   * Send recovery failure email (critical)
   */
  async sendRecoveryFailureEmail(alias, reason, errorMsg, failureCount) {
    if (!this.emailTransporter || !this.alertEmail) return;

    const emailList = this.parseEmailList(this.alertEmail);
    if (emailList.length === 0) return;

    const reasonText = {
      'process_not_running': 'Process 未運行',
      'api_disconnected': 'API 連線中斷',
      'connection_failed': '連線失敗'
    }[reason] || reason;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_USER,
        to: emailList.join(', '),
        subject: `🚨 自動恢復失敗 - ${alias} 需要手動介入`,
        html: `
          <h2>🚨 自動恢復失敗 - 需要手動介入</h2>
          <p>${alias} 的 Claude Remote Control 無法自動恢復。</p>
          <ul>
            <li><strong>伺服器:</strong> ${alias}</li>
            <li><strong>狀態:</strong> 恢復失敗</li>
            <li><strong>時間:</strong> ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</li>
            <li><strong>原因:</strong> ${reasonText}</li>
            <li><strong>失敗次數:</strong> ${failureCount || 'N/A'}</li>
            <li><strong>錯誤訊息:</strong> ${errorMsg || 'N/A'}</li>
          </ul>
          <p><strong>請手動檢查伺服器並重啟 Claude Remote Control。</strong></p>
          <p>系統已進入 30 分鐘冷卻期，期間不會再次嘗試自動恢復。</p>
        `
      });
      console.log(`[MonitorOrchestrator] Recovery failure email sent for ${alias}`);
    } catch (error) {
      console.error('[MonitorOrchestrator] Failed to send recovery failure email:', error.message);
    }
  }

  /**
   * Parse email list (comma or semicolon separated)
   */
  parseEmailList(emailString) {
    if (!emailString) return [];
    return emailString
      .split(/[,;]/)
      .map(e => e.trim())
      .filter(e => e.length > 0);
  }

  /**
   * Get current server states (for API)
   */
  getServerStates() {
    const states = {};
    for (const [ip, state] of this.serverStates) {
      states[ip] = state;
    }
    return states;
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      errorCount: this.errorCount,
      serverCount: this.servers.length,
      connectedServers: Array.from(this.serverStates.values()).filter(s => s.status !== 'unknown').length
    };
  }

  /**
   * Get recovery logs from auto-recovery module
   */
  getRecoveryLogs(options = {}) {
    const recovery = getAutoRecovery();
    return recovery.getLogs(options);
  }

  /**
   * Manually trigger recovery for a specific server
   */
  async manualRecover(ip, reason = 'manual_trigger') {
    const server = this.servers.find(s => s.ip === ip);
    if (!server) {
      throw new Error(`Server ${ip} not found in configuration`);
    }

    console.log(`[MonitorOrchestrator] Manual recovery triggered for ${server.alias} (${ip})`);

    const recovery = getAutoRecovery();
    return await recovery.recover(ip, reason);
  }
}

// Singleton instance
let orchestratorInstance = null;

export function getMonitorOrchestrator() {
  if (!orchestratorInstance) {
    orchestratorInstance = new MonitorOrchestrator();
  }
  return orchestratorInstance;
}

export { MonitorOrchestrator };
