# System Monitor 當前狀態報告

**日期**: 2026-03-02
**版本**: v2.14.1
**部署**: `localhost:30500/system-monitor:v2.14.1`

---

## ✅ 系統狀態

### 監控系統
- **狀態**: 🟢 Running
- **Namespace**: `deployer-dev`
- **URL**: https://monitor.ko.unieai.com
- **更新週期**: 30 秒自動刷新

### 被監控的 Servers

| Server | IP | Status | Session Name | Claude PID | 備註 |
|--------|-----|--------|--------------|------------|------|
| **Server A** | 172.31.6.240 | 🟢 healthy | claude-remote-240 | 1913416 | 正常運行 |
| **Server B** | 18.181.190.83 | 🟢 healthy | claude-remote-83 | 673789 | 正常運行 |

---

## 🎯 已實現功能

### 1. Session 管理系統 (v2.14)
- ✅ **一鍵重啟**：前端藍色按鈕「🔄 重啟 Session」
- ✅ **重新連線**：前端紫色按鈕「🔌 重新連線」
- ✅ **自動偵測**：
  - Claude CLI 路徑（`which claude` → `~/.local/bin/claude` → `find`）
  - 最佳工作目錄（agent-skill → k8s-auto-deployer → /home/ubuntu）
- ✅ **智慧等待**：5 秒等待時間確保 Claude 完全啟動

### 2. Session 偵測系統 (v2.13)
- ✅ **修復 PID 不匹配問題**
- ✅ **改用 tmux session name 為主要偵測方式**
- ✅ **準確區分**：「沒有 session」vs「session 存在但 claude 未運行」

### 3. REST API (3 個端點)
```
POST /api/claude-remote/restart-session/:ip
POST /api/claude-remote/reconnect/:ip
GET  /api/claude-remote/session-status/:ip/:sessionName
```

### 4. 完整文件
- 📖 `SESSION_MANAGEMENT_README.md`：完整使用指南
- 🔧 `TROUBLESHOOTING.md`：故障排除手冊
- 📊 `CURRENT_STATUS.md`：當前狀態報告（本檔案）

---

## 🐛 已知問題與解決方案

### 問題 1: 前端顯示「重啟失敗」但實際成功

**症狀**: 點擊重啟按鈕後顯示紅色錯誤訊息

**實際情況**: API 成功了，session 已建立

**解決方案**:
1. **重整頁面**（Ctrl+R 或 Cmd+R）
2. 檢查 Server Card 狀態
3. 如果顯示 🟢 healthy → 重啟成功！

**詳細說明**: 見 `TROUBLESHOOTING.md`

---

## 📈 使用統計

### 今日重啟記錄 (2026-03-02)

| 時間 | Server | 操作 | 結果 | Session ID |
|------|--------|------|------|-----------|
| 09:32 | Server B | Restart | ✅ 成功 | 01WAjYGagYrA... |
| 09:35 | Server B (測試) | Restart | ✅ 成功 | 013KBfo6iGt3 |
| 09:57 | Server B | Restart | ✅ 成功 | 01BQARqFQp2Z |
| 09:58 | Server A | Restart | ✅ 成功 | claude-remote-240 |

**成功率**: 100% (4/4)

---

## 🔄 最近更新

### v2.14.1 (2026-03-02 10:05)
- 🔧 增加 Claude 啟動等待時間：3秒 → 5秒
- 📝 修復：Session ID 顯示為 null 的問題

### v2.14.0 (2026-03-02 09:45)
- ✨ 新增：SessionManager 類別
- ✨ 新增：3 個 REST API endpoints
- ✨ 新增：前端重啟和重連按鈕
- 📖 新增：完整使用文件

### v2.13.0 (2026-03-02 09:20)
- 🐛 修復：Session 偵測邏輯（PID 不匹配問題）
- 🔧 改進：從「找 PID 再找 tmux」→「找 tmux 再驗證 PID」

---

## 🚀 使用方式

### 前端 UI（推薦）

1. 開啟 https://monitor.ko.unieai.com
2. 找到對應的 Server Card
3. 根據需求點擊：
   - **🔄 重啟 Session**：殺掉舊的，建立新的（解決 session 中斷問題）
   - **🔌 重新連線**：重建 SSH 連線（解決 Server 重開機後的連線問題）

### API 呼叫

```bash
# 重啟 session
curl -X POST "http://monitor.ko.unieai.com/api/claude-remote/restart-session/18.181.190.83" \
  -H "Content-Type: application/json" \
  -d '{}'

# 查詢狀態
curl "http://monitor.ko.unieai.com/api/claude-remote/session-status/18.181.190.83/claude-remote-83"
```

---

## 📊 系統架構

```
┌─────────────────────────────────────────────────┐
│           Frontend (React + Vite)               │
│  - ServerCard 組件（顯示 Server 狀態）            │
│  - 重啟/重連按鈕（觸發 API 呼叫）                 │
└────────────────┬────────────────────────────────┘
                 │
                 │ HTTP/HTTPS
                 ↓
┌─────────────────────────────────────────────────┐
│        Backend (Express.js + Node.js)           │
│  - REST API (3 個端點)                          │
│  - SessionManager (session 管理邏輯)            │
│  - MonitorOrchestrator (30秒監控循環)           │
└────────────────┬────────────────────────────────┘
                 │
                 │ SSH (ssh2 library)
                 ↓
┌─────────────────────────────────────────────────┐
│         SSH Pool (持久化連線)                    │
│  - Server A: 172.31.6.240                       │
│  - Server B: 18.181.190.83                      │
└────────────────┬────────────────────────────────┘
                 │
                 │ tmux + Claude CLI
                 ↓
┌─────────────────────────────────────────────────┐
│      Remote Servers (Ubuntu + Claude)           │
│  - tmux sessions: claude-remote-*               │
│  - Claude CLI: ~/.local/bin/claude              │
│  - Process monitoring: pgrep, ps aux            │
└─────────────────────────────────────────────────┘
```

---

## 🔐 安全考量

1. **SSH 金鑰**：存放在 K8s Secret (`system-monitor-ssh-key`)
2. **網路隔離**：所有 API 僅在內部網路可存取
3. **操作確認**：前端所有破壞性操作需要確認對話框
4. **日誌記錄**：所有 session 操作都有完整日誌

---

## 📝 維護建議

### 每日檢查
```bash
# 檢查兩台 Server 狀態
sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=20 | grep "Server [AB]:"
```

### 每週維護
```bash
# 清理舊的 inactive sessions
for ip in 172.31.6.240 18.181.190.83; do
  curl -X POST "http://monitor.ko.unieai.com/api/debug/exec/$ip" \
    -H "Content-Type: application/json" \
    -d '{"command":"tmux ls | grep claude-remote | cut -d: -f1 | while read s; do pgrep -f \"$s.*claude\" || tmux kill-session -t $s; done"}'
done
```

### 每月更新
- 檢查 Claude CLI 版本
- 檢查監控系統 Docker image 版本
- 檢查 K8s 資源使用情況

---

## 📞 支援與聯絡

- **文件**: `/home/ubuntu/system-monitor/`
  - `SESSION_MANAGEMENT_README.md`：完整使用指南
  - `TROUBLESHOOTING.md`：故障排除
  - `CURRENT_STATUS.md`：當前狀態（本檔案）

- **日誌查看**:
  ```bash
  sudo kubectl logs -n deployer-dev deploy/system-monitor --tail=100
  ```

- **GitHub**: `komh123/k8s-auto-deployer` (branch: `agentic`)
  - Commit: 87133d8

---

## 🎯 下一步計劃

### 短期 (本週)
- [ ] 修復前端 timeout 問題（增加 fetch timeout 設定）
- [ ] 添加「查看 Session URL」按鈕（快速開啟 claude.ai）

### 中期 (本月)
- [ ] 自動清理 inactive sessions（每小時檢查）
- [ ] 新增 Session 統計儀表板（uptime、重啟次數）
- [ ] 新增 Email 通知（當 session 中斷時）

### 長期 (下季度)
- [ ] 支援更多 servers（動態配置）
- [ ] 整合 Slack 通知
- [ ] 新增 Session 回放功能（查看歷史 tmux 輸出）

---

**最後更新**: 2026-03-02 10:15
**更新者**: Claude AI
**狀態**: ✅ 系統運行正常
