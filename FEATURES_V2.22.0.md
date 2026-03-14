# 新功能 v2.22.0

## 1. Session 刪除按鈕 🗑️

### 功能說明
- 每個 session 右側都有刪除按鈕（垃圾桶圖標）
- 點擊後會有確認提示
- 刪除會停止遠端 Claude process 並清理 session

### 使用方式
1. 打開左側 Session Drawer
2. 找到要刪除的 session
3. 點擊右側的 🗑️ 按鈕
4. 確認刪除

### 技術實作
- **Frontend**: [SessionDrawer.jsx](client/src/components/chat/SessionDrawer.jsx#L43-L67)
- **Backend**: [chatRoutes.js:372-382](server/routes/chatRoutes.js#L372-L382)
- **API**: `DELETE /api/chat/sessions/:id`

### 刪除行為
```javascript
// 1. 停止遠端 Claude process
await runner.stopSession(sessionId);

// 2. Archive session (標記為已刪除)
store.archive(sessionId);

// 3. 如果刪除的是當前 session，清空聊天
if (sessionId === activeSessionId) {
  setActiveSessionId(null);
  setMessages([]);
}

// 4. 重新載入 session 列表
fetchSessions();
```

---

## 2. Skills 快速刷新 🔄 `/refresh-skills`

### 功能說明
- 新增 `/refresh-skills` 命令
- 無需重新選擇 session，直接重新載入 skills
- 適用於：
  - Server 上新增了 skills
  - Skills 載入失敗需要重試
  - 想確認最新的 skills 列表

### 使用方式

**方法 1：Command Palette**
1. 按 `Cmd+K` 打開 Command Palette
2. 搜尋 `refresh`
3. 選擇 `🔄 Reload skills from server (force refresh)`
4. 按 Enter

**方法 2：訊息輸入框**
1. 在訊息輸入框輸入 `/refresh-skills`
2. 按 Enter
3. 系統會顯示：
   - ✅ `Skills refreshed! Loaded 30 skills from 18.181.190.83`
   - 或 ❌ `Failed to refresh skills. Please try again.`

**方法 3：自動完成**
1. 在輸入框輸入 `/`
2. 會出現命令列表
3. 選擇 `/refresh-skills`

### 回應訊息

**成功時**:
```
✅ Skills refreshed! Loaded 30 skills from 18.181.190.83
```

**失敗時**:
```
❌ Failed to refresh skills. Please try again.
```

### 技術實作

**Frontend**: [ChatPage.jsx:107-130](client/src/pages/ChatPage.jsx#L107-L130)

```javascript
const handleRefreshSkills = async () => {
  // 1. 從 API 重新載入 skills
  const skillData = await fetch(`/api/chat/skills?serverIp=${serverIp}`);

  // 2. 更新 commands 列表（移除舊 skills，加入新 skills）
  setCommands(prev => {
    const withoutSkills = prev.filter(c => c.category !== 'skill');
    return [...withoutSkills, ...(skillData.skills || [])];
  });

  // 3. 顯示成功訊息
  setMessages(prev => [...prev, systemMsg]);
};
```

**Backend**: [chatRoutes.js:27-33](server/routes/chatRoutes.js#L27-L33)

```javascript
sessionCommands: [
  // ... 其他命令
  {
    id: 'refresh-skills',
    name: '/refresh-skills',
    description: '🔄 Reload skills from server (force refresh)',
    category: 'session'
  }
]
```

### 使用場景

**場景 1：新增 Skills**
```bash
# Server 上安裝新 skill
ssh ubuntu@18.181.190.83
cd ~/.claude/skills
git clone https://github.com/some/new-skill

# 在 Web UI 中執行
/refresh-skills
# ✅ Skills refreshed! Loaded 31 skills from 18.181.190.83
```

**場景 2：Skills 載入失敗**
```
# 如果建立 session 時 skills 載入失敗
# 直接執行 /refresh-skills 重試
/refresh-skills
```

**場景 3：確認最新列表**
```
# 懷疑 skills 沒更新？執行看看
/refresh-skills
```

---

## 升級指南

### 從 v2.21.0 升級到 v2.22.0

**無需任何配置變更**，直接部署即可：

```bash
cd /home/ubuntu/system-monitor
sudo docker build -t localhost:30500/system-monitor:v2.22.0 .
sudo docker push localhost:30500/system-monitor:v2.22.0
sudo kubectl set image deployment/system-monitor \
  system-monitor=localhost:30500/system-monitor:v2.22.0 \
  -n deployer-dev
```

### Breaking Changes

無。完全向下相容。

### 新增 API Endpoint

無。使用現有的 endpoint：
- `DELETE /api/chat/sessions/:id` (已存在)
- `GET /api/chat/skills?serverIp=X` (已存在)

### 資料庫變更

無。

---

## 測試驗證

### 測試 Session 刪除

```bash
# 1. 建立測試 session
curl -X POST "https://monitor.ko.unieai.com/api/chat/sessions" \
  -H "Content-Type: application/json" \
  -d '{"sessionName":"test-delete","serverIp":"172.31.6.240","model":"sonnet"}'

# 2. 取得 session ID
SESSION_ID=$(curl -s "https://monitor.ko.unieai.com/api/chat/sessions" | jq -r '.sessions[0].id')

# 3. 刪除 session
curl -X DELETE "https://monitor.ko.unieai.com/api/chat/sessions/$SESSION_ID"

# 4. 確認已刪除
curl -s "https://monitor.ko.unieai.com/api/chat/sessions" | jq '.sessions'
```

### 測試 Skills 刷新

```bash
# 1. 檢查當前 skills 數量
curl -s "https://monitor.ko.unieai.com/api/chat/skills?serverIp=18.181.190.83" | jq '.skills | length'

# 2. 在 Web UI 執行 /refresh-skills

# 3. 確認 Command Palette 中顯示正確數量
```

---

## UI 截圖

### Session 刪除按鈕

```
┌─────────────────────────────────────┐
│ Sessions                       + New │
├─────────────────────────────────────┤
│ ┌──────────────────────────────┐    │
│ │ My Session        [sonnet] 🗑️ │    │
│ │ 5 msgs     2024-03-14        │    │
│ └──────────────────────────────┘    │
│                                      │
│ ┌──────────────────────────────┐    │
│ │ Test Session      [opus]   🗑️ │    │
│ │ 2 msgs     2024-03-13        │    │
│ └──────────────────────────────┘    │
└─────────────────────────────────────┘
```

### `/refresh-skills` 命令

```
Command Palette (Cmd+K)
┌─────────────────────────────────────┐
│ 🔍 Search: refresh                  │
├─────────────────────────────────────┤
│ SESSION                              │
│ 🔄 /refresh-skills                  │
│   Reload skills from server          │
└─────────────────────────────────────┘
```

---

## FAQ

**Q: 刪除 session 後可以恢復嗎？**
A: 無法恢復。刪除會停止遠端 Claude process 並清理所有資料。

**Q: `/refresh-skills` 會刷新所有 session 的 skills 嗎？**
A: 不會，只刷新當前 session 的 skills。

**Q: Server 上新增 skill 後多久會出現在 Web UI？**
A: 立即執行 `/refresh-skills` 就會出現。或重新選擇 session 也會自動載入。

**Q: 刪除按鈕可以隱藏嗎？**
A: 目前無法隱藏。如果誤點可以在確認對話框中取消。

---

## 技術細節

### Session 刪除流程

```
User clicks 🗑️
      ↓
Confirm dialog
      ↓
Frontend: DELETE /api/chat/sessions/:id
      ↓
Backend: runner.stopSession(id)
      ↓
Backend: store.archive(id)
      ↓
Frontend: Clear active session if needed
      ↓
Frontend: fetchSessions() to refresh list
```

### Skills 刷新流程

```
User types /refresh-skills
      ↓
Frontend: Check if command === '/refresh-skills'
      ↓
Frontend: fetch('/api/chat/skills?serverIp=X')
      ↓
Backend: SSH to server, ls ~/.claude/skills/
      ↓
Backend: Parse directories → skill names
      ↓
Backend: Return { skills: [...] }
      ↓
Frontend: Update commands state
      ↓
Frontend: Show success message
```

---

## 版本資訊

- **Version**: v2.22.0
- **Release Date**: 2024-03-14
- **Git Commit**: TBD
- **Image**: `localhost:30500/system-monitor:v2.22.0`

## 變更日誌

**Added**:
- ✅ Session 刪除按鈕 (UI + API)
- ✅ `/refresh-skills` 命令
- ✅ Skills 刷新成功/失敗訊息

**Changed**:
- SessionDrawer 改為 flex layout 以容納刪除按鈕
- handleSend 加入 `/refresh-skills` 處理邏輯

**Fixed**:
- 無

---

## 下一步規劃

可能的未來功能：
- [ ] Session 重新命名（在列表中直接編輯）
- [ ] Session 搜尋/過濾
- [ ] Skills 快取（避免每次都 SSH）
- [ ] Batch delete sessions
- [ ] Export session history
