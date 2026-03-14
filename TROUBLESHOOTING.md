# Session Management 故障排除指南

## 問題：前端顯示「重啟失敗」但 API 實際上成功了

### 症狀
- 點擊「🔄 重啟 Session」按鈕
- 瀏覽器顯示紅色通知：「❌ 重啟失敗: Restart failed」
- **但實際上 session 已經成功建立**

### 診斷方法

#### 1. 檢查 API 日誌
```bash
sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=50 | grep SessionManager
```

如果看到類似這樣的輸出，代表**API 成功了**：
```
[SessionManager] 18.181.190.83 ✓ Claude CLI found at: /home/ubuntu/.local/bin/claude
[SessionManager] 18.181.190.83 ✓ Session created
[SessionManager] 18.181.190.83 ✅ Session restart SUCCESS
```

#### 2. 檢查監控狀態
```bash
sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=20 | grep "Found.*active session"
```

如果看到新的 session，代表**重啟成功**：
```
[ClaudeRemote] ✓ Found active session: claude-remote-240 (claude PID: 1913416)
[ClaudeRemote] ✓ Found active session: claude-remote-83 (claude PID: 673789)
```

#### 3. 直接測試 API
```bash
curl -X POST "http://monitor.ko.unieai.com/api/claude-remote/restart-session/18.181.190.83" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.'
```

成功回應範例：
```json
{
  "success": true,
  "sessionName": "claude-remote-83",
  "sessionId": "01BQARqFQp2Z",
  "status": "connected"
}
```

### 根本原因

這個問題通常由以下原因造成：

1. **前端 fetch timeout**
   - Claude 啟動需要 5 秒
   - 瀏覽器可能在收到完整回應前 timeout
   - 解決方案：**重整頁面**，檢查監控狀態

2. **CORS 或網路問題**
   - 某些網路環境可能阻擋長時間的 POST 請求
   - 解決方案：切換網路或使用 API 直接測試

3. **瀏覽器 DevTools 開啟**
   - 開發者工具有時會干擾網路請求
   - 解決方案：關閉 DevTools 後重試

### 解決方案

#### 立即解決方案
1. **重整監控頁面** (`Ctrl+R` 或 `Cmd+R`)
2. 檢查 Server Card 狀態
3. 如果顯示 🟢 healthy 且有新的 Session ID → **重啟成功！**

#### 驗證步驟
```bash
# 查詢 session 狀態
curl "http://monitor.ko.unieai.com/api/claude-remote/session-status/18.181.190.83/claude-remote-83"

# 應該回傳
{
  "exists": true,
  "running": true,
  "sessionId": "01BQARqFQp2Z"
}
```

---

## 問題：Session 建立但沒有 Session ID

### 症狀
```json
{
  "success": true,
  "sessionId": null,
  "status": "starting"
}
```

### 原因
- Claude remote-control 啟動需要 3-5 秒
- API 回應時 Claude 還在初始化

### 解決方案
**等待 10 秒後查詢狀態**：
```bash
curl "http://monitor.ko.unieai.com/api/claude-remote/session-status/{ip}/{sessionName}"
```

如果 `running: true` 且有 `sessionId`，代表**成功了**。

---

## 問題：舊 Session 沒有被殺掉

### 症狀
```bash
# 看到多個 sessions
claude-remote-server-a
claude-remote-240
```

### 診斷
```bash
sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=50 | grep "sessions matching"

# 輸出
[ClaudeRemote] tmux sessions matching 'claude-remote' on 172.31.6.240: "claude-remote-240\nclaude-remote-server-a\n"
```

### 清理方法

#### 方法 1：透過 API
```bash
curl -X POST "http://monitor.ko.unieai.com/api/debug/exec/172.31.6.240" \
  -H "Content-Type: application/json" \
  -d '{"command":"tmux kill-session -t claude-remote-server-a"}'
```

#### 方法 2：SSH 手動清理
```bash
ssh ubuntu@172.31.6.240 "tmux ls | grep claude-remote | cut -d: -f1 | xargs -I {} tmux kill-session -t {}"
```

---

## 問題：Claude 進程存在但 Session ID 未顯示

### 症狀
- 監控顯示 🟢 healthy
- 有 Claude PID
- 但 Session ID 是 `null`

### 診斷
```bash
# 檢查 tmux 輸出
sudo kubectl exec -n deployer-dev deploy/system-monitor -- node -e "
const http = require('http');
const data = JSON.stringify({command: 'tmux capture-pane -t claude-remote-240 -p -S -20'});
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/debug/exec/172.31.6.240',
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': data.length}
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(JSON.parse(body).output));
});
req.write(data);
req.end();
"
```

### 可能原因
1. **Claude 還在啟動中**：等待 30 秒
2. **Claude 啟動失敗**：檢查是否有錯誤訊息
3. **Session 格式變更**：Claude CLI 版本更新可能改變輸出格式

---

## 問題：重新連線失敗

### 症狀
```
❌ 重新連線失敗：No active connection
```

### 診斷
```bash
# 檢查 SSH Pool 狀態
sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=100 | grep "SSH connected"
```

### 解決方案
**重啟監控系統 Pod**：
```bash
sudo kubectl rollout restart deployment/system-monitor -n deployer-dev

# 等待 30 秒讓 SSH Pool 初始化
sleep 30

# 驗證連線
sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=50 | grep "SSH pool initialized"
```

應該看到：
```
SSH pool initialized: 2/2 servers connected
```

---

## 快速檢查清單

### 重啟後驗證步驟

1. ✅ **檢查 API 回應**
   ```bash
   curl -X POST ".../restart-session/{ip}" -d '{}' | jq '.success'
   # 應該是 true
   ```

2. ✅ **重整監控頁面**
   - 按 `Ctrl+R` 或 `Cmd+R`

3. ✅ **檢查 Server Card 狀態**
   - 應該顯示 🟢 healthy
   - 應該有新的 Session ID

4. ✅ **驗證 Claude 進程**
   ```bash
   kubectl logs -n deployer-dev deploy/system-monitor --tail=20 | grep "Found.*active"
   ```

5. ✅ **測試 Session 連線**
   - 在手機/平板開啟 Claude app
   - 進入 Code → Remote Control Sessions
   - 應該看到新的 session

---

## 預防措施

### 1. 定期清理舊 Sessions
```bash
# 每週執行一次
for ip in 172.31.6.240 18.181.190.83; do
  ssh ubuntu@$ip "tmux ls | grep claude-remote | cut -d: -f1 | while read s; do pgrep -f \"\$s.*claude\" || tmux kill-session -t \$s; done"
done
```

### 2. 監控 Session 健康度
- 設定自動化腳本檢查 session uptime
- 如果 uptime > 24 小時，考慮重啟

### 3. 保持 Claude CLI 更新
```bash
# 在每台 server 執行
~/.local/bin/claude --version
# 如果版本過舊，更新：
# curl -fsSL https://install.claude.ai | sh
```

---

## 聯絡與回報

如果以上方法都無法解決問題，請收集以下資訊：

1. **監控系統日誌**（最近 200 行）
   ```bash
   sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=200 > monitor.log
   ```

2. **API 測試結果**
   ```bash
   curl -X POST ".../restart-session/{ip}" -d '{}' > api-test.json
   ```

3. **Server 端 tmux 狀態**
   ```bash
   ssh ubuntu@{ip} "tmux ls; ps aux | grep claude" > server-status.txt
   ```

然後在 GitHub 開 Issue 或聯絡系統管理員。
