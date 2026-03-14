# Claude Remote Control 監控系統完整技術文件

**版本**: v2.9
**最後更新**: 2026-02-28
**作者**: System Monitor Team

---

## 目錄

1. [系統概述](#系統概述)
2. [架構設計](#架構設計)
3. [監控機制](#監控機制)
4. [自動恢復機制](#自動恢復機制)
5. [API 文件](#api-文件)
6. [前端介面](#前端介面)
7. [故障排除](#故障排除)
8. [最佳實踐](#最佳實踐)

---

## 系統概述

### 1.1 什麼是 Claude Remote Control？

Claude Remote Control 是 Anthropic 在 2026 年 2 月推出的功能，允許開發者從任何裝置（手機、平板、瀏覽器）遠端存取本地電腦上運行的 Claude Code session。

**核心價值**：
- 🌍 **移動辦公**：在通勤途中繼續開發工作
- 🚨 **On-Call 回應**：快速處理緊急問題無需回到辦公桌
- 🤝 **跨時區協作**：團隊成員可以接力完成任務
- 👁️ **遠端 Code Review**：在任何裝置上審查程式碼

---

### 1.2 為什麼需要監控系統？

Claude Remote Control sessions 可能因為以下原因失敗：
- 網路連線中斷
- 程序記憶體洩漏或當機
- 伺服器資源不足
- Claude CLI 版本衝突

**沒有監控系統的問題**：
- Session 失敗後需要手動 SSH 到伺服器重啟
- 不知道 session 何時失敗（發現時已經浪費時間）
- 無法追蹤多個伺服器的 sessions 狀態

**監控系統的解決方案**：
- ✅ 自動偵測失敗並立即重啟
- ✅ 即時顯示所有 sessions 狀態
- ✅ 支援手動 Restart
- ✅ Email 警報通知
- ✅ 歷史日誌追蹤

---

### 1.3 系統架構圖

```
┌────────────────────────────────────────────────────────────────────┐
│                        Claude Remote 監控系統                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐                    ┌──────────────────┐      │
│  │   Server A       │                    │   Server B       │      │
│  │  172.31.6.240    │                    │  172.31.6.187    │      │
│  │                  │                    │                  │      │
│  │ ┌──────────────┐ │                    │ ┌──────────────┐ │      │
│  │ │ tmux session │ │                    │ │ tmux session │ │      │
│  │ │ claude-remote│ │                    │ │ claude-remote│ │      │
│  │ │              │ │                    │ │              │ │      │
│  │ │ PID: 1048891 │ │                    │ │ PID: 1912882 │ │      │
│  │ │ Session ID:  │ │                    │ │ Session ID:  │ │      │
│  │ │ 01ZExVn...   │ │                    │ │ 0Uf83VJ...   │ │      │
│  │ └──────────────┘ │                    │ └──────────────┘ │      │
│  └─────────┬────────┘                    └─────────┬────────┘      │
│            │                                       │                │
│            │ SSH Connection Pool                   │                │
│            │ (Persistent, Keepalive 10s)           │                │
│            │                                       │                │
│            └───────────────┬───────────────────────┘                │
│                            │                                        │
│                   ┌────────▼─────────┐                              │
│                   │   K8s Pod        │                              │
│                   │  (Monitor)       │                              │
│                   │                  │                              │
│                   │ ┌──────────────┐ │                              │
│                   │ │SSH Pool      │ │                              │
│                   │ │Manager       │ │                              │
│                   │ └──────┬───────┘ │                              │
│                   │        │         │                              │
│                   │ ┌──────▼───────┐ │                              │
│                   │ │Monitor       │ │                              │
│                   │ │Orchestrator  │ │                              │
│                   │ │(30s loop)    │ │                              │
│                   │ └──────┬───────┘ │                              │
│                   │        │         │                              │
│                   │ ┌──────▼───────┐ │                              │
│                   │ │Claude Remote │ │                              │
│                   │ │Monitor       │ │                              │
│                   │ └──────┬───────┘ │                              │
│                   │        │         │                              │
│                   │ ┌──────▼───────┐ │                              │
│                   │ │Auto Recovery │ │                              │
│                   │ │Engine        │ │                              │
│                   │ └──────────────┘ │                              │
│                   └──────────────────┘                              │
│                            │                                        │
│                            │ HTTP API                               │
│                            │                                        │
│                   ┌────────▼─────────┐                              │
│                   │  Frontend UI     │                              │
│                   │  (React)         │                              │
│                   │                  │                              │
│                   │  monitor.ko      │                              │
│                   │  .unieai.com     │                              │
│                   └──────────────────┘                              │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 架構設計

### 2.1 核心模組

#### **SSH Connection Pool** (`server/modules/sshPool.js`)

**職責**：
- 維護與所有伺服器的持久 SSH 連線
- 提供指令執行介面（exec）
- 自動重連機制
- 延遲監控

**關鍵特性**：
```javascript
class SSHPool {
  connections: Map<IP, {
    client: SSH2Client,
    status: 'connected' | 'connecting' | 'disconnected',
    lastHeartbeat: ISO8601String,
    latency: number  // milliseconds
  }>

  // 初始化連線池
  async initialize(servers: ServerConfig[]): Promise<number>

  // 執行遠端指令
  async exec(ip: string, command: string, options: ExecOptions): Promise<string>

  // 心跳檢測（每 60 秒）
  startHeartbeat(): void
}
```

**連線配置**：
```javascript
{
  host: '172.31.6.240',
  port: 22,
  username: 'ubuntu',
  privateKey: readFileSync('/root/.ssh/id_ed25519'),
  keepaliveInterval: 10000,      // 10 秒發送一次 keepalive
  keepaliveCountMax: 3,          // 3 次失敗後斷線
  readyTimeout: 10000            // 10 秒連線超時
}
```

---

#### **Claude Remote Monitor** (`server/modules/claudeRemoteMonitor.js`)

**職責**：
- 偵測所有運行中的 Claude Remote sessions
- 檢查每個 session 的健康狀態
- 提取 Session ID 和程序資訊

**核心方法**：

##### **1. detectAllSessions(ip)**
```javascript
async detectAllSessions(ip: string): Promise<SessionInfo[]> {
  // Step 1: 找到所有 claude remote-control 程序
  const output = await sshPool.exec(ip,
    'ps aux | grep "[c]laude remote-control" | awk \'{print $2}\''
  );
  const pids = output.trim().split('\n').filter(p => p.match(/^\d+$/));

  // Step 2: 對每個 PID 找到對應的 tmux session
  for (const pid of pids) {
    const tmuxOutput = await sshPool.exec(ip,
      `tmux list-panes -a -F '#{session_name} #{pane_pid}' | grep " ${pid}$"`
    );
    const tmuxSession = tmuxOutput.trim().split(' ')[0];

    sessions.push({ tmuxSession, pid });
  }

  return sessions;
}
```

**輸出範例**：
```json
[
  {
    "tmuxSession": "claude-remote-server-a",
    "pid": "1048891"
  },
  {
    "tmuxSession": "claude-remote-server-b",
    "pid": "1912882"
  }
]
```

---

##### **2. checkSessionStatus(ip, sessionInfo)**
```javascript
async checkSessionStatus(ip: string, sessionInfo: SessionInfo): Promise<SessionStatus> {
  // Step 1: 讀取 tmux pane 內容
  const output = await sshPool.exec(ip,
    `tmux capture-pane -t ${sessionInfo.tmuxSession} -p -S -10`
  );

  // Step 2: 提取 Session ID
  const sessionId = extractSessionInfo(output);

  // Step 3: 判斷狀態
  let status = 'unknown';
  if (sessionId && !output.includes('error')) {
    status = 'healthy';   // 正常運行
  } else if (sessionId && output.includes('error')) {
    status = 'degraded';  // 有錯誤但還活著
  } else {
    status = 'failed';    // Session ID 找不到，已失敗
  }

  return {
    tmuxSession: sessionInfo.tmuxSession,
    pid: sessionInfo.pid,
    sessionId,
    status,
    uptime: calculateUptime(output)  // 從 tmux 內容計算運行時間
  };
}
```

**狀態定義**：
| 狀態 | 顏色 | 說明 | 範例 |
|------|------|------|------|
| `healthy` | 🟢 綠色 | Session ID 正常，無錯誤訊息 | Connected, Uptime: 1m |
| `degraded` | 🟡 黃色 | Session ID 存在但有錯誤 | 網路延遲、警告訊息 |
| `failed` | 🔴 紅色 | 找不到 Session ID 或程序已退出 | 需要重啟 |
| `no_sessions` | ⚪ 灰色 | 沒有運行任何 session | 尚未啟動 |

---

##### **3. extractSessionInfo(output)**
```javascript
function extractSessionInfo(output: string): string | null {
  // 移除換行符（避免 Session ID 被分割）
  const cleanOutput = output.replace(/\n/g, '');

  // Session ID 格式：01 開頭的 26 個字元
  const sessionMatch = cleanOutput.match(/Session ID:\s*([A-Za-z0-9]{26})/);

  return sessionMatch ? sessionMatch[1] : null;
}
```

**tmux 輸出範例**：
```
Remote Control session started
Session ID: 01ZExVn0Hf5ryEdIZzV8Pvh
Waiting for connection from claude.ai...

Connected to remote device
Ready to receive commands
```

**提取結果**：
```javascript
{
  sessionId: "01ZExVn0Hf5ryEdIZzV8Pvh",
  status: "healthy"
}
```

---

#### **Auto Recovery** (`server/modules/autoRecovery.js`)

**職責**：
- 自動重啟失敗的 sessions
- 提供兩種重啟策略（Soft / Hard）
- 重試機制與 Cooldown

**核心方法**：

##### **1. recover(ip, reason, sessionInfo)**
```javascript
async recover(ip: string, reason: string, sessionInfo: SessionInfo): Promise<RecoveryResult> {
  // 檢查 Cooldown（30 分鐘內不重複恢復）
  const lastAttempt = this.lastRecoveryAttempt.get(ip);
  if (lastAttempt && (Date.now() - lastAttempt.timestamp) < 30 * 60 * 1000) {
    return { success: false, reason: 'Cooldown period active' };
  }

  // 決定恢復策略
  const attempt = (lastAttempt?.count || 0) + 1;
  let result;

  if (attempt <= 2) {
    result = await this.softRestart(ip, sessionInfo);  // Soft Restart
  } else {
    result = await this.hardRestart(ip, sessionInfo);  // Hard Restart
  }

  // 記錄嘗試
  this.lastRecoveryAttempt.set(ip, {
    timestamp: Date.now(),
    count: attempt,
    success: result.success
  });

  return result;
}
```

---

##### **2. softRestart(ip, sessionInfo)**
```javascript
async softRestart(ip: string, sessionInfo: SessionInfo): Promise<RecoveryResult> {
  // Step 1: 發送 Ctrl+C 停止程序
  await sshPool.exec(ip, `tmux send-keys -t ${sessionInfo.tmuxSession} C-c`);

  // Step 2: 等待 2 秒
  await sleep(2000);

  // Step 3: 重新啟動指令
  await sshPool.exec(ip,
    `tmux send-keys -t ${sessionInfo.tmuxSession} "claude remote-control" C-m`
  );

  // Step 4: 驗證恢復（10 秒內）
  const verified = await this.verifyRecovery(ip, 10000);

  return {
    success: verified,
    method: 'soft_restart',
    duration: '12s'
  };
}
```

**優點**：
- ✅ 速度快（約 12 秒）
- ✅ 保留 tmux session 名稱
- ✅ 環境變數不變

**缺點**：
- ❌ 無法解決 tmux session 本身的問題

---

##### **3. hardRestart(ip, sessionInfo)**
```javascript
async hardRestart(ip: string, sessionInfo: SessionInfo): Promise<RecoveryResult> {
  // Step 1: 刪除 tmux session
  await sshPool.exec(ip, `tmux kill-session -t ${sessionInfo.tmuxSession}`);

  // Step 2: 等待 1 秒
  await sleep(1000);

  // Step 3: 建立全新 session
  await sshPool.exec(ip,
    'tmux new-session -d -s claude-remote "claude remote-control"'
  );

  // Step 4: 驗證恢復
  const verified = await this.verifyRecovery(ip, 10000);

  return {
    success: verified,
    method: 'hard_restart',
    duration: '15s'
  };
}
```

**優點**：
- ✅ 完全重置環境
- ✅ 解決 tmux 本身的問題

**缺點**：
- ❌ 速度較慢（約 15 秒）
- ❌ Session 名稱變回 `claude-remote`

---

##### **4. verifyRecovery(ip, timeout)**
```javascript
async verifyRecovery(ip: string, timeout: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // 檢查是否有 claude remote-control 程序
    const output = await sshPool.exec(ip,
      'ps aux | grep "[c]laude remote-control" | wc -l'
    );

    const processCount = parseInt(output.trim());
    if (processCount > 0) {
      return true;  // 恢復成功
    }

    await sleep(1000);  // 等待 1 秒後重試
  }

  return false;  // 超時失敗
}
```

---

#### **Monitor Orchestrator** (`server/modules/monitorOrchestrator.js`)

**職責**：
- 協調所有模組（SSH Pool, Claude Remote Monitor, Auto Recovery）
- 30 秒監控循環
- 管理伺服器狀態
- 觸發自動恢復

**核心流程**：

```javascript
class MonitorOrchestrator {
  // 30 秒監控循環
  async runMonitoringCycle() {
    for (const server of this.servers) {
      const { ip, alias } = server;

      // Step 1: 偵測 sessions
      const sessions = await claudeRemoteMonitor.detectAllSessions(ip);

      // Step 2: 檢查每個 session 狀態
      const sessionStatuses = await Promise.all(
        sessions.map(s => claudeRemoteMonitor.checkSessionStatus(ip, s))
      );

      // Step 3: 判斷整體狀態
      let overallStatus = 'no_sessions';
      if (sessionStatuses.some(s => s.status === 'healthy')) {
        overallStatus = 'healthy';
      } else if (sessionStatuses.some(s => s.status === 'degraded')) {
        overallStatus = 'degraded';
      } else if (sessionStatuses.every(s => s.status === 'failed')) {
        overallStatus = 'failed';
      }

      // Step 4: 更新狀態
      const previousStatus = this.serverStates.get(ip).status;
      this.serverStates.get(ip).status = overallStatus;
      this.serverStates.get(ip).claudeRemote = {
        running: sessions.length > 0,
        sessions: sessionStatuses,
        status: overallStatus
      };

      // Step 5: 判斷是否需要自動恢復
      if (overallStatus === 'failed' && previousStatus !== 'failed') {
        await this.triggerRecovery(ip, alias, sessionStatuses[0]);
      }
    }
  }

  // 觸發自動恢復
  async triggerRecovery(ip: string, alias: string, sessionInfo: SessionInfo) {
    const recovery = getAutoRecovery();
    const result = await recovery.recover(ip, 'session_failed', sessionInfo);

    if (result.success) {
      console.log(`✅ Auto-recovery succeeded for ${alias}`);
    } else {
      console.log(`❌ Auto-recovery failed for ${alias}`);
      // 發送 Email 警報
      await this.sendAlert(ip, alias, 'recovery_failed');
    }
  }
}
```

---

### 2.2 資料流程圖

```
┌─────────────────────────────────────────────────────────────────┐
│                         監控循環（每 30 秒）                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Step 1: SSH 連線     │
                    │  (Connection Pool)    │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Step 2: 偵測 Sessions│
                    │  ps aux | grep claude │
                    │  tmux list-panes      │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Step 3: 檢查狀態     │
                    │  tmux capture-pane    │
                    │  Extract Session ID   │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Step 4: 判斷狀態     │
                    │  healthy/degraded/    │
                    │  failed/no_sessions   │
                    └───────────┬───────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌───────────────────┐         ┌───────────────────┐
    │  狀態正常         │         │  狀態失敗         │
    │  (healthy/        │         │  (failed)         │
    │   degraded)       │         │                   │
    └───────┬───────────┘         └─────────┬─────────┘
            │                               │
            ▼                               ▼
    ┌───────────────────┐         ┌───────────────────┐
    │  更新前端 UI      │         │  觸發自動恢復     │
    │  (WebSocket)      │         │  (Auto Recovery)  │
    └───────────────────┘         └─────────┬─────────┘
                                            │
                                ┌───────────┴───────────┐
                                │                       │
                                ▼                       ▼
                    ┌───────────────────┐   ┌───────────────────┐
                    │  Soft Restart     │   │  Hard Restart     │
                    │  (嘗試 1-2 次)    │   │  (嘗試 3+ 次)     │
                    └───────┬───────────┘   └─────────┬─────────┘
                            │                         │
                            └───────────┬─────────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │  驗證恢復成功         │
                            │  (10 秒內檢查 PID)    │
                            └───────────┬───────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                        ▼                               ▼
            ┌───────────────────┐         ┌───────────────────┐
            │  恢復成功         │         │  恢復失敗         │
            │  ✅ 記錄日誌      │         │  ❌ 發送警報 Email│
            └───────────────────┘         └───────────────────┘
```

---

## 監控機制

### 3.1 監控循環（30 秒）

**Cron 配置**：
```javascript
// monitorOrchestrator.js
cron.schedule('*/30 * * * * *', async () => {
  await this.runMonitoringCycle();
}, {
  timezone: 'Asia/Taipei'
});
```

**執行時間表**：
```
00:00:00 - Cycle 1
00:00:30 - Cycle 2
00:01:00 - Cycle 3
...
```

---

### 3.2 多 Session 支援

系統支援同一台伺服器運行多個 Claude Remote sessions（不同 tmux session 名稱）：

**範例**：
```bash
# Server A 同時運行 3 個 sessions
tmux new-session -d -s project-a "cd /home/ubuntu/project-a && claude remote-control"
tmux new-session -d -s project-b "cd /home/ubuntu/project-b && claude remote-control"
tmux new-session -d -s project-c "cd /home/ubuntu/project-c && claude remote-control"
```

**監控系統會偵測所有 sessions**：
```json
{
  "sessions": [
    {
      "tmuxSession": "project-a",
      "pid": "123456",
      "sessionId": "01ABC...",
      "status": "healthy"
    },
    {
      "tmuxSession": "project-b",
      "pid": "123457",
      "sessionId": "01DEF...",
      "status": "healthy"
    },
    {
      "tmuxSession": "project-c",
      "pid": "123458",
      "sessionId": "01GHI...",
      "status": "degraded"
    }
  ]
}
```

---

### 3.3 狀態優先級

當一台伺服器有多個 sessions 時，整體狀態判斷邏輯：

```javascript
if (sessions.some(s => s.status === 'healthy')) {
  return 'healthy';      // 有任何一個是 healthy → 整體 healthy
} else if (sessions.some(s => s.status === 'degraded')) {
  return 'degraded';     // 沒有 healthy，但有 degraded → 整體 degraded
} else if (sessions.every(s => s.status === 'failed')) {
  return 'failed';       // 全部失敗 → 整體 failed
} else {
  return 'no_sessions';  // 沒有任何 session
}
```

**範例**：
| Session 1 | Session 2 | Session 3 | 整體狀態 |
|-----------|-----------|-----------|----------|
| healthy   | healthy   | healthy   | ✅ healthy |
| healthy   | degraded  | failed    | ✅ healthy |
| degraded  | degraded  | failed    | ⚠️ degraded |
| failed    | failed    | failed    | ❌ failed |
| -         | -         | -         | ⚪ no_sessions |

---

### 3.4 延遲監控

SSH Pool 會記錄每次指令執行的延遲：

```javascript
const startTime = Date.now();
const output = await client.exec(command);
const latency = Date.now() - startTime;

// 高延遲警報
if (latency > 500) {
  console.log(`⚠️ High latency detected for ${ip}: ${latency}ms`);
}
```

**常見延遲原因**：
- 🔴 **CPU 負載高**（Server B 平均 12.76）→ 681ms
- 🟠 **記憶體不足**（Swap 使用中）→ 300-500ms
- 🟢 **正常**（低負載）→ 50-100ms

---

## 自動恢復機制

### 4.1 觸發條件

自動恢復只在以下條件觸發：

```javascript
if (currentStatus === 'failed' && previousStatus !== 'failed') {
  // 從非失敗狀態轉為失敗狀態 → 觸發恢復
  await triggerRecovery();
}
```

**觸發場景**：
- ✅ `healthy` → `failed`
- ✅ `degraded` → `failed`
- ✅ `no_sessions` → `failed`（理論上不會發生）

**不觸發場景**：
- ❌ `failed` → `failed`（已經在恢復中）
- ❌ `healthy` → `degraded`（降級但還活著）
- ❌ `no_sessions` 狀態（沒有 session 不需恢復）

---

### 4.2 恢復策略

#### **策略決策樹**

```
嘗試次數 = 1
    │
    ├─ Soft Restart (12 秒)
    │  └─ 成功 → 重置計數器
    │  └─ 失敗 → 嘗試次數 + 1
    │
嘗試次數 = 2
    │
    ├─ Soft Restart (12 秒)
    │  └─ 成功 → 重置計數器
    │  └─ 失敗 → 嘗試次數 + 1
    │
嘗試次數 = 3
    │
    ├─ Hard Restart (15 秒)
    │  └─ 成功 → 重置計數器
    │  └─ 失敗 → 發送警報 Email
```

---

#### **Soft Restart 詳細流程**

```bash
# 1. 停止程序（Ctrl+C）
tmux send-keys -t claude-remote-server-a C-c

# 2. 等待 2 秒
sleep 2

# 3. 重新啟動
tmux send-keys -t claude-remote-server-a "claude remote-control" C-m

# 4. 驗證（10 秒內檢查）
ps aux | grep "[c]laude remote-control" | wc -l
```

**時間軸**：
```
T+0s  : 發送 Ctrl+C
T+2s  : 等待結束
T+2s  : 發送 claude remote-control
T+5s  : Claude 程序啟動
T+7s  : Session ID 生成
T+10s : 驗證成功 ✅
```

---

#### **Hard Restart 詳細流程**

```bash
# 1. 刪除 tmux session
tmux kill-session -t claude-remote-server-a

# 2. 等待 1 秒
sleep 1

# 3. 建立新 session
tmux new-session -d -s claude-remote "claude remote-control"

# 4. 驗證（10 秒內檢查）
ps aux | grep "[c]laude remote-control" | wc -l
```

**注意**：Hard Restart 會將 session 名稱重置為預設值 `claude-remote`

---

### 4.3 Cooldown 機制

**目的**：避免頻繁重啟造成系統負擔

**規則**：
- 每個 IP 的恢復嘗試間隔至少 **30 分鐘**
- Cooldown 期間不會觸發自動恢復
- 手動 Restart 不受 Cooldown 限制

**實作**：
```javascript
lastRecoveryAttempt = {
  '172.31.6.240': {
    timestamp: 1709136000000,  // 2026-02-28 16:00:00
    count: 2,
    success: true
  }
}

// 檢查 Cooldown
const elapsed = Date.now() - lastRecoveryAttempt['172.31.6.240'].timestamp;
if (elapsed < 30 * 60 * 1000) {
  return { success: false, reason: 'Cooldown period active' };
}
```

---

### 4.4 Email 警報

**觸發條件**：
1. 自動恢復失敗 3 次
2. Session 從 healthy → failed（需要人工介入）

**警報頻率**：
- 每個 IP 每 **1 小時** 只發送 1 次警報
- 避免警報轟炸

**Email 內容範例**：
```
主旨: ⚠️ Claude Remote Session Failed - Server A

內容:
⚠️ Claude Remote Control Session 失敗

伺服器: Server A (172.31.6.240)
狀態: failed
最後 Session ID: 01ZExVn0Hf5ryEdIZzV8Pvh
自動恢復: 嘗試 3 次，全部失敗

請手動檢查伺服器狀態。

時間: 2026-02-28 16:45:00 UTC+8
```

---

## API 文件

### 5.1 端點概覽

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/claude-remote/status` | 取得所有伺服器狀態 |
| GET | `/api/claude-remote/logs` | 取得恢復日誌 |
| POST | `/api/claude-remote/recover/:ip` | 手動觸發恢復 |
| GET | `/api/claude-remote/health/:ip` | 單一伺服器健康檢查 |
| POST | `/api/claude-remote/test-ssh/:ip` | 測試 SSH 連線 |
| GET | `/api/claude-remote/config` | 取得監控配置 |
| POST | `/api/claude-remote/start-session/:ip` | 啟動新 session |
| GET | `/api/network-diagnostics/:ip` | 網路診斷 |

---

### 5.2 詳細 API 規格

#### **GET /api/claude-remote/status**

**說明**：取得所有伺服器的即時狀態

**請求**：
```bash
curl https://monitor.ko.unieai.com/api/claude-remote/status
```

**回應**：
```json
{
  "success": true,
  "servers": {
    "172.31.6.240": {
      "hostname": "ip-172-31-6-240",
      "alias": "Server A",
      "status": "healthy",
      "lastCheck": "2026-02-28T16:45:00.123Z",
      "claudeRemote": {
        "running": true,
        "sessions": [
          {
            "tmuxSession": "claude-remote-server-a",
            "pid": "1048891",
            "sessionId": "01ZExVn0Hf5ryEdIZzV8Pvh",
            "status": "healthy",
            "uptime": "1m 23s"
          }
        ],
        "status": "healthy",
        "timestamp": "2026-02-28T16:45:00.000Z"
      },
      "tmux": {
        "exists": true,
        "windowCount": 1
      },
      "system": {
        "cpu": 79.2,
        "memory": 68.7,
        "networkReachable": true
      },
      "error": null
    },
    "172.31.6.187": { ... }
  },
  "timestamp": "2026-02-28T16:45:00.123Z"
}
```

---

#### **POST /api/claude-remote/recover/:ip**

**說明**：手動觸發 session 恢復

**請求**：
```bash
curl -X POST https://monitor.ko.unieai.com/api/claude-remote/recover/172.31.6.240
```

**回應**：
```json
{
  "success": true,
  "result": {
    "success": true,
    "method": "soft_restart",
    "duration": "12s",
    "sessionInfo": {
      "tmuxSession": "claude-remote-server-a",
      "pid": "1048891"
    }
  },
  "timestamp": "2026-02-28T16:45:00.123Z"
}
```

---

#### **POST /api/claude-remote/start-session/:ip**

**說明**：在指定伺服器上啟動新的 Claude Remote session

**請求**：
```bash
curl -X POST https://monitor.ko.unieai.com/api/claude-remote/start-session/172.31.6.240 \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "my-project",
    "workingDir": "/home/ubuntu/my-project"
  }'
```

**參數**：
| 參數 | 類型 | 預設值 | 說明 |
|------|------|--------|------|
| `sessionName` | string | `claude-remote` | tmux session 名稱 |
| `workingDir` | string | `/home/ubuntu/agent-skill` | 工作目錄 |

**回應**：
```json
{
  "success": true,
  "ip": "172.31.6.240",
  "sessionName": "my-project",
  "workingDir": "/home/ubuntu/my-project",
  "processCount": 1,
  "message": "Session my-project started successfully",
  "timestamp": "2026-02-28T16:45:00.123Z"
}
```

---

#### **GET /api/network-diagnostics/:ip**

**說明**：執行網路診斷測試

**請求**：
```bash
curl https://monitor.ko.unieai.com/api/network-diagnostics/172.31.6.240
```

**回應**：
```json
{
  "success": true,
  "ip": "172.31.6.240",
  "tests": [
    {
      "name": "Ping Claude.ai",
      "success": true,
      "output": "5 packets transmitted, 5 received, 0% packet loss, rtt min/avg/max = 2.1/2.3/2.5 ms"
    },
    {
      "name": "DNS Resolution",
      "success": true,
      "output": "Server: 127.0.0.53, Address: api.anthropic.com has address 104.18.x.x"
    },
    {
      "name": "Load Average",
      "success": true,
      "output": "load average: 2.00, 4.78, 4.18"
    }
  ],
  "timestamp": "2026-02-28T16:45:00.123Z"
}
```

---

## 前端介面

### 6.1 主要元件

#### **ClaudeRemoteMonitor.jsx**

**功能**：
- 即時顯示所有伺服器狀態
- Session 列表（tmux session、PID、Session ID）
- 手動 Restart 按鈕
- 自動重新整理（30 秒）

**狀態卡片設計**：
```jsx
<div className="server-card">
  <div className="header">
    <h3>🖥️ Server A</h3>
    <span className="ip">172.31.6.240</span>
    <span className="status-badge connected">Connected</span>
  </div>

  <div className="metrics">
    <div>CPU: 79.2%</div>
    <div>Memory: 68.7%</div>
    <div>Network: ✓</div>
  </div>

  <div className="remote-sessions">
    <h4>Remote Sessions (1)</h4>
    <div className="session">
      <div className="session-header">
        <span>Session 1: claude-remote-server-a</span>
        <span className="status-badge connected">Connected</span>
      </div>
      <div className="session-details">
        <div>Session ID: 01ZExVn...</div>
        <div>PID: 1048891</div>
        <div>Uptime: 1m</div>
      </div>
      <button className="restart-btn">Restart</button>
    </div>
  </div>
</div>
```

---

#### **狀態徽章設計**

```css
/* 綠色 - Connected (healthy) */
.status-badge.connected {
  background: #10b981;
  color: white;
}

/* 黃色 - Degraded */
.status-badge.degraded {
  background: #f59e0b;
  color: white;
}

/* 紅色 - Failed */
.status-badge.failed {
  background: #ef4444;
  color: white;
}

/* 灰色 - No Sessions */
.status-badge.offline {
  background: #6b7280;
  color: white;
}
```

---

### 6.2 使用者操作流程

#### **查看狀態**
1. 訪問 `https://monitor.ko.unieai.com`
2. 點擊 "Claude Remote" 分頁
3. 查看每台伺服器的狀態卡片

#### **手動重啟 Session**
1. 找到要重啟的 session
2. 點擊 "Restart" 按鈕
3. 系統執行 Soft Restart
4. 等待 15-20 秒
5. 頁面自動重新整理，顯示新狀態

#### **啟動新 Session**
1. 使用 API 或 SSH 手動啟動
2. 等待 30 秒（下一個監控循環）
3. 監控系統自動偵測並顯示

---

## 故障排除

### 7.1 常見問題

#### **問題 1：Session 顯示 "No Sessions"**

**症狀**：
- 監控系統顯示 "No Sessions (2)"
- 但手動 SSH 檢查發現程序正在運行

**可能原因**：
1. Claude Remote 程序剛啟動（< 30 秒）
2. 程序正在等待用戶批准連線
3. tmux session 名稱格式不正確

**解決方案**：
```bash
# 檢查程序是否存在
ssh ubuntu@172.31.6.240 "ps aux | grep claude"

# 檢查 tmux sessions
ssh ubuntu@172.31.6.240 "tmux list-sessions"

# 查看 tmux pane 內容
ssh ubuntu@172.31.6.240 "tmux capture-pane -t claude-remote-server-a -p"

# 等待 30 秒後重新整理頁面
```

---

#### **問題 2：Session 頻繁進入 "failed" 狀態**

**症狀**：
- 監控日誌顯示每 5-10 分鐘就觸發一次恢復
- Recovery Count 持續增加

**可能原因**：
1. 網路不穩定（Server B 常見）
2. CPU 負載過高導致程序被 OOM killer 終止
3. Claude CLI 版本有 bug

**解決方案**：
```bash
# 1. 檢查網路品質
curl https://monitor.ko.unieai.com/api/network-diagnostics/172.31.6.187

# 2. 檢查 CPU 負載
ssh ubuntu@172.31.6.187 "uptime"

# 3. 檢查 OOM killer 日誌
ssh ubuntu@172.31.6.187 "dmesg | grep -i 'killed process'"

# 4. 升級 Claude CLI
ssh ubuntu@172.31.6.187 "npm update -g @anthropic-ai/claude-code"

# 5. 減少 Server B 的背景程序
ssh ubuntu@172.31.6.187 "pkill -f 'unnecessary-process'"
```

---

#### **問題 3：Restart 按鈕無效**

**症狀**：
- 點擊 Restart 按鈕後沒有反應
- 頁面沒有顯示錯誤訊息

**可能原因**：
1. 前端 JavaScript 錯誤
2. API 請求被 CORS 阻擋
3. SSH 連線斷開

**解決方案**：
```bash
# 1. 檢查瀏覽器 Console
# 按 F12 → Console 分頁 → 查看錯誤訊息

# 2. 檢查監控系統 Pod logs
sudo kubectl logs -n deployer-dev deployment/system-monitor --tail=50

# 3. 測試 API 是否可用
curl -X POST https://monitor.ko.unieai.com/api/claude-remote/recover/172.31.6.240

# 4. 檢查 SSH Pool 狀態
# 查看 logs 中是否有 "SSH connection lost" 訊息
```

---

#### **問題 4：監控系統顯示 "High latency"**

**症狀**：
- Logs 顯示 `High latency detected for 172.31.6.187: 681ms`
- SSH 指令執行很慢

**可能原因**：
1. CPU 負載過高（最常見，Server B load average: 12.76）
2. 記憶體不足導致 Swap
3. 網路擁塞

**解決方案**：
```bash
# 1. 檢查 CPU 負載
ssh ubuntu@172.31.6.187 "top -bn1 | head -20"

# 2. 檢查記憶體使用
ssh ubuntu@172.31.6.187 "free -h"

# 3. 檢查 Swap 使用
ssh ubuntu@172.31.6.187 "swapon -s"

# 4. 終止高 CPU 程序（謹慎操作）
ssh ubuntu@172.31.6.187 "top -bn1 | grep claude | awk '{print \$1}' | xargs kill"
```

---

### 7.2 進階除錯

#### **啟用詳細日誌**

修改 `server/modules/claudeRemoteMonitor.js`：
```javascript
// 在 detectAllSessions 方法中加入詳細日誌
console.log(`[DEBUG] Raw ps output: ${output}`);
console.log(`[DEBUG] Detected PIDs: ${JSON.stringify(pids)}`);
console.log(`[DEBUG] Tmux output: ${tmuxOutput}`);
```

重新部署後查看 logs：
```bash
sudo kubectl logs -n deployer-dev deployment/system-monitor -f
```

---

#### **手動模擬監控循環**

在本機執行單次監控：
```bash
# 1. SSH 到監控 Pod
sudo kubectl exec -n deployer-dev deployment/system-monitor -it -- /bin/sh

# 2. 執行單次檢查
node -e "
const { getClaudeRemoteMonitor } = require('./server/modules/claudeRemoteMonitor.js');
const monitor = getClaudeRemoteMonitor();
(async () => {
  const sessions = await monitor.detectAllSessions('172.31.6.240');
  console.log('Sessions:', JSON.stringify(sessions, null, 2));
})();
"
```

---

## 最佳實踐

### 8.1 Session 命名規範

**建議使用有意義的名稱**：
```bash
# ✅ 好的命名
tmux new-session -s project-frontend
tmux new-session -s api-backend
tmux new-session -s database-migration

# ❌ 不好的命名
tmux new-session -s session1
tmux new-session -s test
tmux new-session -s aaa
```

**優點**：
- 監控 UI 更易識別
- 日誌更清晰
- 多人協作時避免混淆

---

### 8.2 定期維護

#### **每週檢查**
```bash
# 1. 檢查 Claude CLI 版本
ssh ubuntu@172.31.6.240 "claude --version"

# 2. 檢查監控系統版本
curl https://monitor.ko.unieai.com/health

# 3. 檢查 SSH 金鑰過期時間
ssh ubuntu@172.31.6.240 "ssh-keygen -l -f ~/.ssh/id_ed25519.pub"

# 4. 清理舊的 tmux sessions
ssh ubuntu@172.31.6.240 "tmux list-sessions | grep -v claude-remote | cut -d: -f1 | xargs -I {} tmux kill-session -t {}"
```

---

#### **每月檢查**
```bash
# 1. 更新 Claude CLI
ssh ubuntu@172.31.6.240 "npm update -g @anthropic-ai/claude-code"

# 2. 清理監控日誌
sudo kubectl exec -n deployer-dev deployment/system-monitor -- rm -f /tmp/*.log

# 3. 檢查 Kubernetes Pod 資源使用
sudo kubectl top pod -n deployer-dev system-monitor
```

---

### 8.3 監控警報設定

#### **建議的警報閾值**

| 指標 | 警告閾值 | 嚴重閾值 | 處理建議 |
|------|----------|----------|----------|
| CPU 使用率 | 80% | 95% | 終止非必要程序 |
| 記憶體使用率 | 85% | 95% | 增加 Swap 或升級記憶體 |
| SSH 延遲 | 500ms | 1000ms | 檢查網路和 CPU 負載 |
| 恢復失敗次數 | 2 次 | 3 次 | 手動介入檢查 |

---

### 8.4 安全建議

#### **SSH 金鑰管理**
```bash
# 1. 使用專用金鑰（不共用）
ssh-keygen -t ed25519 -f ~/.ssh/monitor_key -C "monitor@system"

# 2. 限制金鑰權限
chmod 600 ~/.ssh/monitor_key

# 3. 只授權特定 IP
# 在伺服器的 ~/.ssh/authorized_keys 加入：
from="監控系統Pod IP" ssh-ed25519 AAAAC3...
```

---

#### **API 安全**
```javascript
// 建議加入 API Token 驗證
app.post('/api/claude-remote/recover/:ip', async (req, res) => {
  const token = req.headers['authorization'];
  if (token !== process.env.API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ... 執行恢復
});
```

---

### 8.5 效能優化

#### **減少監控開銷**
```javascript
// 1. 使用 SSH 連線池（已實作）
// 2. 批次執行指令
const commands = [
  'ps aux | grep claude',
  'tmux list-sessions',
  'uptime'
];
const results = await Promise.all(
  commands.map(cmd => sshPool.exec(ip, cmd))
);

// 3. 快取靜態資料（伺服器清單、配置）
```

---

## 附錄

### A. 相關技術文件

- [Claude Code Official Docs](https://docs.anthropic.com/claude/docs/claude-code)
- [Claude Remote Control Announcement](https://www.anthropic.com/news/claude-remote-control)
- [SSH2 Node.js Library](https://github.com/mscdex/ssh2)
- [tmux Documentation](https://github.com/tmux/tmux/wiki)

---

### B. 系統需求

**監控系統**：
- Node.js >= 18.0
- Kubernetes >= 1.25
- Traefik Ingress Controller
- cert-manager

**被監控伺服器**：
- Ubuntu 20.04+ 或其他 Linux 發行版
- tmux >= 2.6
- Claude Code CLI (最新版本)
- SSH Server (OpenSSH >= 7.4)
- Claude Max 訂閱

---

### C. 版本歷史

| 版本 | 日期 | 變更內容 |
|------|------|----------|
| v2.9 | 2026-02-28 | 新增 start-session API、debug endpoint、修復 Ingress 衝突 |
| v2.8 | 2026-02-28 | 新增手動啟動 session 功能 |
| v2.7 | 2026-02-28 | 動態 session 名稱支援、網路診斷 API |
| v2.6 | 2026-02-27 | 修復 Express.static cache 問題 |
| v2.5 | 2026-02-27 | 改善狀態標籤文字（Offline → No Sessions） |
| v2.0 | 2026-02-26 | 多 session 支援、自動恢復機制 |
| v1.0 | 2026-02-25 | 初始版本：基本監控功能 |

---

### D. 聯絡資訊

**技術支援**：
- Email: support@example.com
- GitHub Issues: https://github.com/your-org/system-monitor/issues

**貢獻指南**：
- 歡迎提交 Pull Requests
- 請先建立 Issue 討論新功能
- 遵循 Conventional Commits 規範

---

**文件結尾**

最後更新時間: 2026-02-28 16:50:00 UTC+8
