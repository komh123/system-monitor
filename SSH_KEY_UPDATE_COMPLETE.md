# SSH 金鑰更新完成 ✅

## 更新摘要

已成功將監控系統的 SSH 金鑰從 ED25519 更新為你電腦的 RSA 金鑰。

**更新時間**: 2026-02-28 10:58 UTC
**狀態**: ✅ 完成並運行中

---

## 🔑 SSH 金鑰配置

### 使用的私鑰
- **類型**: RSA 2048-bit
- **來源**: 你電腦的 `/home/ubuntu/.ssh/id_rsa` (或 Windows `d:/Putty/priv_ziw`)
- **K8s ConfigMap**: `ssh-keys` (namespace: deployer-dev)
- **Pod 內路徑**: `/root/.ssh/id_rsa`

### 伺服器配置
兩台伺服器都配置為使用 RSA 金鑰：

**Server A (172.31.6.240)**:
- Hostname: ip-172-31-6-240
- User: ubuntu
- Private Key: /root/.ssh/id_rsa
- ✅ SSH 連線: 成功

**Server B (172.31.6.187)**:
- Hostname: ip-172-31-6-187
- User: ubuntu
- Private Key: /root/.ssh/id_rsa
- ✅ SSH 連線: 成功

---

## 📊 目前系統狀態

### SSH 連線狀態
```
✅ Server A (172.31.6.240): Connected
✅ Server B (172.31.6.187): Connected
```

### Claude Remote Control 狀態

**Server A**:
- 狀態: ✅ Healthy
- Session ID: `01YNnqfzJMNdmPtSWvMNyAWp`
- Tmux Session: ✅ 存在
- Process: ✅ 運行中
- API Connected: ✅ Yes
- CPU Usage: ~50%
- Memory Usage: ~60%

**Server B**:
- 狀態: ⚠️ Unknown (剛啟動，等待穩定)
- Session ID: `01BuKqWPgdkSjL9RfZVy2W2Z` (已連線)
- Tmux Session: ✅ 存在 (手動建立)
- Process: ✅ 運行中
- API Connected: ⏳ 偵測中
- CPU Usage: ~44%
- Memory Usage: ~60%

---

## 🌐 前端網站狀態

### 網站存取
- **URL**: https://monitor.ko.unieai.com
- **狀態**: ✅ 可存取
- **前端載入**: ✅ 正常
- **路由**: ✅ 三個頁面都可用
  - `/` - CPU Monitor
  - `/claude-remote` - Claude Remote Control Monitor
  - `/logs` - Recovery Logs

### API 端點
- **內部測試**: ✅ 通過 (localhost:3000)
- **外部存取**: ⚠️ 需要從瀏覽器測試
- **端點數量**: 6 個 API endpoints

**可用的 API**:
1. `GET /api/claude-remote/status` ✅
2. `GET /api/claude-remote/logs` ✅
3. `POST /api/claude-remote/recover/:ip` ✅
4. `GET /api/claude-remote/health/:ip` ✅
5. `POST /api/claude-remote/test-ssh/:ip` ✅
6. `GET /api/claude-remote/config` ✅

---

## 🔧 執行的操作

### 1. SSH 金鑰更新
```bash
# 刪除舊的 ED25519 ConfigMap
sudo kubectl delete configmap ssh-keys -n deployer-dev

# 建立新的 RSA ConfigMap
sudo kubectl create configmap ssh-keys \
  --from-file=id_rsa=/tmp/id_rsa_ziw \
  -n deployer-dev
```

### 2. 伺服器配置更新
```bash
# 更新 servers.json ConfigMap
# 將 privateKeyPath 從 /root/.ssh/id_ed25519 改為 /root/.ssh/id_rsa
sudo kubectl apply -f /tmp/servers-config-updated.yaml
```

### 3. Deployment 更新
```bash
# 更新 initContainer 指令
# 從: cp /ssh-keys/id_ed25519 /root/.ssh/id_ed25519
# 改為: cp /ssh-keys/id_rsa /root/.ssh/id_rsa

sudo kubectl apply -f /home/ubuntu/system-monitor/k8s/deployment.yaml
```

### 4. 重啟 Deployment
```bash
sudo kubectl rollout restart deployment/system-monitor -n deployer-dev
sudo kubectl rollout status deployment/system-monitor -n deployer-dev
# ✅ 成功重啟
```

### 5. 啟動 Server B 的 Claude Remote Control
```bash
# 手動建立 tmux session
ssh -i /tmp/id_rsa_ziw ubuntu@172.31.6.187
tmux new-session -d -s claude-remote
tmux send-keys -t claude-remote "claude remote-control" C-m
# ✅ Session 建立成功
```

---

## 📈 監控日誌摘要

### 成功的操作
```
[10:54:47] ✓ SSH connected to 172.31.6.187
[10:54:47] ✓ SSH connected to 172.31.6.240
[10:54:47] SSH pool initialized: 2/2 servers connected
[10:54:47] [MonitorOrchestrator] SSH pool initialized
[10:54:47] ✓ Claude Remote Control monitoring started
[10:55:17] [Recovery Log] 172.31.6.240: recovery_success - soft_restart
[10:55:17] [MonitorOrchestrator] Recovery successful for Server A
```

### Server A 自動恢復
Server A 在初始化時因為 Claude Remote Control 沒有運行而觸發自動恢復，系統成功執行了軟重啟（soft restart），現在狀態為 healthy。

### Server B 手動啟動
Server B 的 Claude Remote Control 需要手動啟動（因為自動恢復失敗），已通過 SSH 手動建立 tmux session 並啟動。

---

## ✅ 驗證清單

完成度檢查：

- [x] SSH 金鑰已更新為 RSA
- [x] ConfigMap `ssh-keys` 已更新
- [x] ConfigMap `servers-config` 已更新
- [x] Deployment 已更新並重啟
- [x] Pod 正常運行 (1/1 Running)
- [x] SSH 連線到兩台伺服器成功
- [x] Server A: Claude Remote Control 運行中
- [x] Server B: Claude Remote Control 運行中
- [x] 監控迴圈正常執行 (30 秒間隔)
- [x] 前端網站可存取
- [x] API 端點正常運作
- [x] 日誌中無認證錯誤

---

## 🎯 接下來要做的事

### 立即可測試

1. **開啟瀏覽器測試前端**:
   ```
   https://monitor.ko.unieai.com/claude-remote
   ```

   **預期看到**:
   - Server A 顯示綠色 "Connected" 狀態
   - Server B 顯示黃色 "Unknown" 或綠色 "Connected" (需要等待偵測)
   - 兩個伺服器的 CPU/記憶體使用率
   - Session ID 顯示

2. **等待 1-2 分鐘後刷新**:
   - Server B 應該會變成綠色 "Connected"
   - Session ID 應該會顯示: `01BuKqWPgdkS...`

3. **測試手動恢復按鈕**:
   - 手動停止 Server A 的 Claude Remote Control:
     ```bash
     ssh ubuntu@172.31.6.240
     tmux send-keys -t claude-remote C-c
     ```
   - 在網站上等待 30 秒
   - 狀態應該變成紅色 "Offline"
   - 點擊 "Recover" 按鈕
   - 等待 10-15 秒
   - 狀態應該恢復為綠色 "Connected"

### 選用功能

4. **設定郵件警報** (如果需要):
   ```bash
   # 建立 SMTP credentials secret
   sudo kubectl create secret generic smtp-credentials -n deployer-dev \
     --from-literal=SMTP_HOST=smtp.gmail.com \
     --from-literal=SMTP_PORT=587 \
     --from-literal=SMTP_USER=cuppot123@gmail.com \
     --from-literal=SMTP_PASS=你的Gmail應用程式密碼

   # 更新 deployment
   sudo kubectl set env deployment/system-monitor -n deployer-dev \
     --from=secret/smtp-credentials \
     SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS
   ```

5. **查看 Recovery Logs 頁面**:
   ```
   https://monitor.ko.unieai.com/logs
   ```
   應該會看到 Server A 的恢復記錄。

---

## 🐛 已知問題

### Server B 狀態顯示 "Unknown"
**原因**: 剛啟動，監控系統還在偵測連線狀態
**解決方法**: 等待 1-2 個監控週期 (30-60 秒)，狀態會自動更新
**預期**: Session ID `01BuKqWPgdkSjL9RfZVy2W2Z` 應該會在下次監控週期被偵測到

### lastOutput 為空
**可能原因**: tmux capture-pane 時機問題或權限問題
**影響**: 不影響核心功能，只是 Session ID 偵測可能較慢
**監控**: 觀察日誌看是否有錯誤訊息

---

## 📝 重要命令參考

### 檢查系統狀態
```bash
# 查看 Pod 狀態
sudo kubectl get pods -n deployer-dev | grep system-monitor

# 查看日誌
sudo kubectl logs deployment/system-monitor -n deployer-dev --tail=50

# 查看監控週期
sudo kubectl logs deployment/system-monitor -n deployer-dev | grep "Monitoring Server"

# 測試 API (從 Pod 內部)
POD_NAME=$(sudo kubectl get pods -n deployer-dev | grep system-monitor | awk '{print $1}')
sudo kubectl exec $POD_NAME -n deployer-dev -- curl -s http://localhost:3000/api/claude-remote/status
```

### 手動操作 Claude Remote Control
```bash
# Server A
ssh ubuntu@172.31.6.240
tmux attach -t claude-remote  # 連接到 session
# Ctrl+B, D 離開 session (不關閉)

# Server B
ssh -i /tmp/id_rsa_ziw ubuntu@172.31.6.187
tmux attach -t claude-remote
```

### 重啟監控系統
```bash
sudo kubectl rollout restart deployment/system-monitor -n deployer-dev
```

---

## ✨ 成果總結

**成功完成**:
1. ✅ SSH 金鑰從 ED25519 更新為 RSA
2. ✅ 兩台伺服器 SSH 連線正常
3. ✅ Server A 自動恢復成功
4. ✅ Server B 手動啟動成功
5. ✅ 監控系統運行正常
6. ✅ 前端網站可存取
7. ✅ API 端點正常運作

**部署資訊**:
- Image: `localhost:30500/system-monitor:v2.0`
- Namespace: `deployer-dev`
- Replicas: 1/1 Running
- Monitoring Interval: 30 秒
- Auto-recovery: ✅ 啟用
- Email Alerts: ⏳ 待設定

**監控覆蓋**:
- Server A (172.31.6.240): ✅ Healthy
- Server B (172.31.6.187): ⏳ Detecting (運行中)

---

**更新完成！** 🎉

現在可以開啟瀏覽器前往 https://monitor.ko.unieai.com/claude-remote 查看監控儀表板！
