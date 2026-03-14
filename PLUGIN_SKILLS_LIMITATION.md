# Plugin Skills 限制說明

**日期**: 2026-03-14
**版本**: v2.25.3
**問題**: 無法自動偵測 Plugin Skills

---

## 🔍 問題描述

根據用戶提供的截圖，`claude skills list` 顯示：

```
User skills (~/.claude/skills)
  ui-ux-pro-max · ~205 description tokens

Plugin skills (plugin)
  pua-debugging · pua · ~261 description tokens
```

**Server A** 有 Plugin skill (`pua-debugging`)，但 Web UI 沒有顯示。

---

## 🐛 根本原因

### 技術限制

1. **Claude CLI 不可用於 SSH**
   - 錯誤: `Command exited with code 127` (command not found)
   - `claude` 命令在 SSH session 中不在 PATH 中
   - 即使在正確的目錄下執行也無法找到命令

2. **Plugin Skills 不存在於文件系統**
   - Plugin skills 由 Claude Code 的 plugin 系統提供
   - 不存在於 `.claude/skills/` 目錄
   - 無法通過 `ls` 或 `find` 偵測

3. **當前偵測方法**
   - v2.23.2+: 使用 `find` 遞迴搜尋 `.claude/skills/` 目錄
   - v2.25.0-v2.25.3: 嘗試使用 `claude skills list`，但失敗 (exit code 127)
   - 結果: 只能偵測到 User skills 和 Project skills，**無法偵測 Plugin skills**

---

## 📊 當前狀態

### Server A (172.31.6.240)

**偵測到的 Skills** (29 個):
- 14 個 Superpower 工作流
- 13 個 OpenSpec 命令
- 2 個 Code Quality tools (code-review-expert, react-best-practices)
- 1 個 UI/UX tool (ui-ux-pro-max)
- 1 個 Debug tool (debug)

**未偵測到的 Skills**:
- ❌ Plugin skills (例如: `pua-debugging`)

### Server B (18.181.190.83)

**偵測到的 Skills** (30 個):
- 所有 Server A 的 skills
- ✅ `/pua:debugging` (存在於 `.claude/skills/` 目錄中)

---

## 🔧 解決方案

### 方案 1: 手動添加 Plugin Skills 到靜態列表 (臨時)

在 `getStaticSkills()` 函數中添加 Plugin skills：

```javascript
function getStaticSkills() {
  return [
    // ... existing skills ...

    // Plugin skills (cannot be auto-detected)
    {
      id: 'pua:debugging',
      name: '/pua:debugging',
      description: 'Forces exhaustive problem-solving using corporate PUA rhetoric',
      category: 'skill'
    }
  ];
}
```

**優點**: 簡單、立即可用
**缺點**: 需要手動維護

### 方案 2: 安裝 Plugin Skills 為 Project Skills (推薦)

將 Plugin skills 複製到 Project skills 目錄：

```bash
ssh ubuntu@172.31.6.240
cd /home/ubuntu/agent-skill/.claude/skills/

# 複製 plugin skill
# (假設 plugin skills 有對應的目錄或檔案)
# 或手動創建 pua-debugging skill
```

**優點**: 自動偵測、可維護
**缺點**: 需要在每個 server 上安裝

### 方案 3: 使用 Claude Code 內部 API (長期)

修改 SSH 命令以使用 Claude Code 的內部機制：

```javascript
// 使用 tmux session 中正在運行的 claude process
const cliOutput = await pool.exec(serverIp,
  'tmux send-keys -t claude-remote-240 "COMMAND" Enter && sleep 1 && tmux capture-pane -t claude-remote-240 -p',
  { timeout: 10000 }
);
```

**優點**: 最完整的解決方案
**缺點**: 複雜、可能影響正在運行的 Claude session

---

## ✅ 當前實作狀態

**v2.25.3**:
- ✅ 偵測 User skills (`~/.claude/skills/`)
- ✅ 偵測 Project skills (遞迴搜尋 `*/.claude/skills/`)
- ✅ 支援 Multi-Skill Selection (v2.24.0)
- ❌ **無法偵測 Plugin skills**
- ⚠️ Fallback: 如果 Server B 將 PUA skill 安裝在 `.claude/skills/` 目錄，則可以偵測

---

## 🎯 建議行動

### 短期 (立即可用)

**選項 A: 使用 Server B**
- Server B 有 `/pua:debugging` (30 skills)
- 建立 session 時選擇 Server B

**選項 B: 添加到靜態列表**
- 編輯 `getStaticSkills()` 函數
- 添加 PUA 和其他常用 Plugin skills
- 重新部署

### 長期 (最佳解決方案)

**統一 Skills 管理**:
1. 將所有常用 skills (包括 Plugin skills) 安裝為 Project skills
2. 保持所有 servers 同步
3. 完全依賴自動偵測

---

## 📝 技術筆記

### 嘗試過的方法

**v2.25.0**: 使用 `claude skills list --format json`
- 結果: JSON 格式不存在

**v2.25.1**: 使用 `claude skills list` + grep parsing
- 結果: 無法找到 `claude` 命令

**v2.25.2**: 改進正則表達式匹配
- 結果: 還是找不到命令

**v2.25.3**: 添加詳細日誌
- 結果: 確認錯誤為 exit code 127 (command not found)

### 為什麼 `claude` 命令不可用？

1. **PATH 問題**: SSH non-login shell 可能沒有載入完整的 PATH
2. **安裝位置**: `claude` 可能安裝在用戶特定位置 (例如 `~/.local/bin`)
3. **Shell 初始化**: bashrc/zshrc 可能沒有在 SSH command 中執行

### 可能的修復

```bash
# 在 SSH command 中明確設定 PATH
export PATH=$PATH:~/.local/bin:~/.npm-global/bin && claude skills list
```

但這需要知道 `claude` 的確切安裝位置。

---

## 🔮 未來改進

如果要完整支援 Plugin Skills 自動偵測：

1. **調查 Claude CLI 安裝位置**
   - 在 Server A 上找到 `claude` binary 的位置
   - 更新 SSH command 以包含正確的 PATH

2. **或使用替代方法**
   - 直接讀取 Claude Code 的內部配置文件
   - 如果有 API endpoint，使用 HTTP 而不是 SSH

3. **或標準化 Skills 管理**
   - 所有 skills 都安裝為 Project skills
   - 放棄 Plugin skills 的自動偵測

---

## 📚 相關文件

- [FEATURES_V2.23.md](FEATURES_V2.23.md) - Project + User Skills 偵測
- [FEATURES_V2.24.0.md](FEATURES_V2.24.0.md) - Multi-Skill Selection
- [HOW_TO_SEE_SKILLS.md](HOW_TO_SEE_SKILLS.md) - Skills 使用指南

---

**總結**: 由於技術限制，目前**無法自動偵測 Plugin Skills**。建議使用 Server B 或手動添加到靜態列表。
