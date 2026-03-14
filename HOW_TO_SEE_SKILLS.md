# 如何查看和使用 Skills

## 問題：Command Palette 沒有顯示 SKILL 分類

**原因**: Skills 是**動態載入**的，只有在**選擇 session 後**才會出現。

### 為什麼這樣設計？

不同 server 有不同的 skills，所以必須先知道你要連接哪台 server（透過選擇 session），frontend 才能去該 server 讀取 skills。

## 解決方案：3 步驟看到 Skills

### 步驟 1: 建立或選擇 Session

1. 打開 https://monitor.ko.unieai.com/chat
2. 點擊 **"+ New Session"** 按鈕
3. 填寫資料：
   - **Session Name**: 任意名稱（例如：`my-session`）
   - **Server**: 選擇 Server A 或 Server B
   - **Model**: 選擇 `sonnet` 或 `opus`
   - **Allowed Tools**: 全選（6 個工具）
4. 點擊 **"Create Session"**

### 步驟 2: 等待 Skills 載入

Session 建立後，frontend 會自動：
1. 呼叫 `GET /api/chat/skills?serverIp=X`
2. 將 skills 加入 commands 列表
3. 更新 Command Palette

**載入時間**: < 2 秒

### 步驟 3: 打開 Command Palette

1. 按 **Cmd+K**（Mac）或 **Ctrl+K**（Windows）
2. 或點擊右上角的 **⌘K** 按鈕
3. 或點擊輸入框左邊的 **/** 按鈕

現在你應該看到 3 個分類：
- **SESSION** (6 個命令)
- **AGENT** (4 個命令)
- **SKILL** (1-30 個，取決於 server)

## 快速測試指令（Terminal）

如果你想在 terminal 直接查看所有 skills：

```bash
# 安裝指令（已安裝）
sudo cp /home/ubuntu/skills /usr/local/bin/skills
sudo chmod +x /usr/local/bin/skills

# 查看 Server B 的 skills（30 個）
skills b

# 查看 Server A 的 skills（1 個）
skills a

# 查看特定 server
skills 172.31.6.240
```

## 各 Server 的 Skills 數量

| Server | IP | Skills 數量 | 主要 Skills |
|--------|-----|------------|------------|
| **Server A (Tokyo)** | 172.31.6.240 | **1** | `/ui-ux-pro-max` |
| **Server B (Japan)** | 18.181.190.83 | **30** | Superpower 全套、OpenSpec、Code Review |

## Server B 的完整 Skills 列表（30 個）

### Superpower Workflow (14 個)
1. `/superpower:brainstorming`
2. `/superpower:writing-plans`
3. `/superpower:executing-plans`
4. `/superpower:test-driven-development`
5. `/superpower:subagent-driven-development`
6. `/superpower:finishing-a-development-branch`
7. `/superpower:requesting-code-review`
8. `/superpower:receiving-code-review`
9. `/superpower:systematic-debugging`
10. `/superpower:using-git-worktrees`
11. `/superpower:using-superpowers`
12. `/superpower:verification-before-completion`
13. `/superpower:writing-skills`
14. `/superpower:dispatching-parallel-agents`

### OpenSpec (13 個)
1. `/openspec-new-change`
2. `/openspec-propose`
3. `/openspec-continue-change`
4. `/openspec-ff-change`
5. `/openspec-apply-change`
6. `/openspec-verify-change`
7. `/openspec-archive-change`
8. `/openspec-bulk-archive-change`
9. `/openspec-sync-specs`
10. `/openspec-explore`
11. `/openspec-onboard`

### Code Quality (2 個)
1. `/code-review-expert`
2. `/react-best-practices`

### UI/UX (1 個)
1. `/ui-ux-pro-max`

### Debugging (2 個)
1. `/debug`
2. `/pua:debugging`

## 如果 Skills 還是沒出現

### Debug 步驟

**1. 檢查 session 是否已選擇**
```javascript
// 打開瀏覽器 Console (F12)
// 應該看到 session 資訊
console.log(window.location.href)
// 應該包含 session ID
```

**2. 檢查 API 是否有回應**
```bash
# Terminal 測試
curl "https://monitor.ko.unieai.com/api/chat/skills?serverIp=18.181.190.83" | jq '.skills | length'
# 應該回傳 30
```

**3. 檢查瀏覽器 Network Tab**
- 打開 DevTools (F12) → Network
- 選擇 session 後應該看到：
  - `GET /api/chat/skills?serverIp=X`
  - Response 應該包含 skills array

**4. 檢查 Console 錯誤**
```
F12 → Console → 看是否有紅色錯誤訊息
```

### 常見問題

**Q: 我建立了 session 但還是沒看到 skills**
A: 重新整理頁面（Cmd+R），然後重新選擇 session

**Q: Command Palette 是空的**
A: 確認你按的是 Cmd+K（不是 Ctrl+K on Mac）

**Q: 只看到 SESSION 和 AGENT，沒有 SKILL**
A: 你還沒選擇 session，或 session 的 serverIp 是 null

**Q: Server A 只有 1 個 skill 正常嗎？**
A: 是的！Server A 只安裝了 `ui-ux-pro-max`。如果需要更多 skills，請在 Server A 上安裝。

## 驗證成功的標誌

當一切正常時，你應該看到：

### Command Palette 顯示
```
[搜尋框]
SESSION (藍色標籤)
  /compact - Compress conversation context
  /cost - Show API usage costs
  /context - Show context window usage
  /clear - Clear conversation
  /help - Show available commands
  /release-notes - View changelog

AGENT (綠色標籤)
  General Purpose - Multi-step tasks
  Navigate - Navigate files
  Select - Select code
  Close - Close code

SKILL (紫色標籤)    ← 這個分類應該出現！
  /ui-ux-pro-max - UI/UX design intelligence
  （Server B 會有 30 個 skills）
```

### Terminal 驗證
```bash
$ skills b
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Server B (Japan) - Available Skills
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total: 30 skills
 1. /code-review-expert
 2. /debug
 ...
30. /ui-ux-pro-max
```

## 總結

1. ✅ **Skills 是動態的** - 不同 server 不同 skills
2. ✅ **必須選擇 session** - 才能知道要讀取哪台 server
3. ✅ **用 `skills` 指令** - 快速查看所有可用 skills
4. ✅ **Server B 有完整 skills** - 30 個 skills 包含 Superpower 全套

**如果你想在 Server A 也有完整 skills**：
→ 需要在 Server A 上安裝 skills（透過 `claude skills install` 或手動複製）
