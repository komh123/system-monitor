# Claude Remote Control Session 管理系統

## 概述

本系統提供完整的 Claude Remote Control session 管理功能，包含：
- **自動偵測**：監控系統每 30 秒自動檢測所有 servers 的 session 狀態
- **一鍵重啟**：前端 UI 提供「重啟 Session」按鈕
- **重新連線**：前端 UI 提供「重新連線」按鈕（當 SSH 連線中斷時使用）
- **後端 API**：可編程的 REST API 接口

---

## 🎯 使用場景

### 場景 1：Session 正常運行
- **狀態顯示**：綠色「Connected」badge
- **操作**：無需任何操作，系統會自動監控

### 場景 2：Session 意外中斷
- **狀態顯示**：灰色「No Sessions」badge
- **操作**：點擊「🔄 重啟 Session」按鈕
- **結果**：系統會自動建立新的 session 並返回新的 Session ID

### 場景 3：SSH 連線中斷（如 Server 重開機）
- **狀態顯示**：紅色「Offline」badge
- **操作順序**：
  1. 點擊「🔌 重新連線」按鈕 → 重新建立 SSH 連線
  2. 如果 session 也掉了，再點擊「🔄 重啟 Session」按鈕

---

## 📡 API 使用方式

### 1. 重啟 Session（殺掉舊的，建立新的）

```bash
curl -X POST "http://monitor.ko.unieai.com/api/claude-remote/restart-session/18.181.190.83" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "claude-remote-server-b",
    "workingDir": "/home/ubuntu",
    "forceKill": true
  }'
```

**回應範例（成功）：**
```json
{
  "success": true,
  "ip": "18.181.190.83",
  "sessionName": "claude-remote-server-b",
  "sessionId": "01WAjYGagYrAc8V9qSiMEhvD",
  "bridgeId": "01B7M4tyoXu6PiyovdGMa5nY",
  "claudePid": "457913",
  "workingDir": "/home/ubuntu",
  "claudePath": "/home/ubuntu/.local/bin/claude",
  "status": "connected",
  "output": "·✔︎· Connected · ubuntu · HEAD\n\nContinue coding...",
  "timestamp": "2026-03-02T09:32:34.137Z"
}
```

**參數說明：**
- `sessionName`（選填）：Tmux session 名稱，預設自動生成
- `workingDir`（選填）：工作目錄，預設自動偵測（優先順序：agent-skill > k8s-auto-deployer-fastapi > /home/ubuntu）
- `forceKill`（選填）：是否強制殺掉舊 session，預設 `true`

---

### 2. 重新連線（重建 SSH 連線，不影響現有 session）

```bash
curl -X POST "http://monitor.ko.unieai.com/api/claude-remote/reconnect/18.181.190.83" \
  -H "Content-Type: application/json"
```

**回應範例（成功）：**
```json
{
  "success": true,
  "ip": "18.181.190.83",
  "connected": true,
  "activeSessions": [
    "claude-remote-server-b",
    "other-tmux-session"
  ],
  "timestamp": "2026-03-02T09:35:00.000Z"
}
```

**使用時機：**
- Server 重開機後
- SSH 連線逾時或斷線
- 監控系統 Pod 重啟後

---

### 3. 查詢 Session 狀態

```bash
curl "http://monitor.ko.unieai.com/api/claude-remote/session-status/18.181.190.83/claude-remote-server-b"
```

**回應範例：**
```json
{
  "success": true,
  "exists": true,
  "running": true,
  "ip": "18.181.190.83",
  "sessionName": "claude-remote-server-b",
  "sessionId": "01WAjYGagYrAc8V9qSiMEhvD",
  "claudePid": "457913",
  "output": "·✔︎· Connected · ubuntu · HEAD\n...",
  "timestamp": "2026-03-02T09:40:00.000Z"
}
```

---

## 🔧 後端實作細節

### SessionManager 類別

檔案位置：`server/modules/sessionManager.js`

#### 核心方法

**1. `restartSession(ip, options)`**
- 偵測 Claude CLI 路徑（支援 `which claude` 和 `~/.local/bin/claude`）
- 自動偵測最佳工作目錄
- 殺掉舊 session（可選）
- 建立新 tmux session
- 啟動 `claude remote-control`
- 驗證 session ID 和 Bridge ID
- 回傳完整的 session 資訊

**2. `reconnectSession(ip)`**
- 測試 SSH 連線
- 列出現有的 tmux sessions
- 回傳連線狀態

**3. `getSessionStatus(ip, sessionName)`**
- 檢查 tmux session 是否存在
- 檢查 Claude 進程是否運行
- 回傳 session 詳細資訊

---

## 🎨 前端 UI 元件

### ServerCard 組件

檔案位置：`client/src/components/ServerCard.jsx`

#### 新增按鈕

**1. 重啟 Session 按鈕**
- 顏色：藍色
- Icon：🔄
- 確認對話框：避免誤操作
- 成功後顯示新的 Session ID

**2. 重新連線按鈕**
- 顏色：紫色
- Icon：🔌
- 顯示找到的 active sessions
- 不影響現有 session

#### Loading 狀態
- 按鈕在執行時顯示旋轉動畫
- 其他按鈕自動 disabled

---

## 🚀 部署步驟

```bash
# 1. 重建 Docker image
cd /home/ubuntu/system-monitor
sudo docker build --no-cache -t localhost:30500/system-monitor:v2.14 .

# 2. 推送到 registry
sudo docker push localhost:30500/system-monitor:v2.14

# 3. 更新 K8s deployment
sudo kubectl set image deployment/system-monitor -n deployer-dev \
  system-monitor=localhost:30500/system-monitor:v2.14

# 4. 驗證部署
sudo kubectl rollout status deployment/system-monitor -n deployer-dev
sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=50
```

---

## 🧪 測試流程

### 手動測試

**1. 測試重啟 Session**
```bash
# 透過 API
curl -X POST "http://monitor.ko.unieai.com/api/claude-remote/restart-session/18.181.190.83" \
  -H "Content-Type: application/json" -d '{}'

# 透過前端 UI
# 1. 開啟 https://monitor.ko.unieai.com
# 2. 找到 Server B card
# 3. 點擊「🔄 重啟 Session」按鈕
# 4. 確認對話框
# 5. 等待成功訊息
```

**2. 測試重新連線**
```bash
# 模擬 SSH 斷線
sudo kubectl rollout restart deployment/system-monitor -n deployer-dev

# 等待 Pod 重啟後，點擊「🔌 重新連線」按鈕
```

**3. 驗證 Session 狀態**
```bash
# 透過 API
curl "http://monitor.ko.unieai.com/api/claude-remote/session-status/18.181.190.83/claude-remote-server-b"

# 透過前端 UI
# 檢查 Server Card 顯示的 Session 資訊
```

---

## 🔍 故障排除

### 問題 1：重啟失敗 "Claude CLI not found"

**原因**：Server 上未安裝 Claude CLI 或路徑不正確

**解決方案**：
```bash
# SSH 到 server 檢查
ssh ubuntu@18.181.190.83 "which claude || ls ~/.local/bin/claude"

# 如果沒有安裝，請先安裝 Claude CLI
```

---

### 問題 2：Session created but Claude process not detected

**原因**：`claude` 指令不在 PATH 中

**解決方案**：
系統會自動偵測 `~/.local/bin/claude`。如果仍然失敗，檢查 SessionManager 的 Claude 路徑偵測邏輯。

---

### 問題 3：重新連線失敗 "No active connection"

**原因**：SSH Pool 尚未初始化

**解決方案**：
```bash
# 重啟監控系統 Pod
sudo kubectl rollout restart deployment/system-monitor -n deployer-dev

# 等待 30 秒讓 SSH Pool 初始化
```

---

## 📊 監控指標

系統每 30 秒自動更新以下指標：

1. **Server Status**：healthy | degraded | failed | no_sessions
2. **Session Count**：每個 server 的 active sessions 數量
3. **Session Details**：Session ID, Bridge ID, PID, Uptime
4. **Connection Status**：Connected | Retrying | Offline

---

## 🔐 安全考量

1. **SSH 金鑰管理**：所有 SSH 金鑰存放在 K8s Secret 中
2. **權限控制**：監控系統 Pod 以 `ubuntu` 用戶身份執行 SSH
3. **API 存取控制**：所有 API 端點僅在內部網路可存取
4. **操作確認**：前端 UI 所有破壞性操作都需要確認

---

## 📝 版本歷史

### v2.14 (2026-03-02)
- ✅ 新增 SessionManager 類別
- ✅ 新增 3 個 REST API endpoints
- ✅ 前端新增「重啟 Session」和「重新連線」按鈕
- ✅ 自動偵測 Claude CLI 路徑和工作目錄
- ✅ 完整的錯誤處理和使用者回饋

### v2.13 (2026-03-02)
- ✅ 修復 session 偵測邏輯（PID 不匹配問題）
- ✅ 改用 tmux session name 為主要偵測方式

---

## 📞 支援與回饋

如有問題或建議，請聯絡系統管理員或在 GitHub 開 Issue。
