# 新功能 v2.24.0 - Multi-Skill Selection

**日期**: 2026-03-14
**版本**: v2.24.0
**新增功能**: 支援從 Command Palette 多選 Skills

---

## ✨ 新功能：Multi-Skill Selection

### 問題

之前的行為：
1. 打開 Command Palette (Cmd+K)
2. 選擇一個 skill (例如 `/superpower:brainstorming`)
3. **立即發送** → Palette 關閉
4. 無法選擇第二個 skill

**用戶需求**：
> 「當我在訊息欄要啟用第 2 個 skill（或更多）時，也要跑出搜尋框」

### 解決方案

現在的行為：

#### 1️⃣ **Skills 多選模式**
- 選擇 skill → **插入到輸入框**（不發送）
- Palette **保持開啟**
- 可以繼續選擇更多 skills
- 手動按 Enter 或 Send 按鈕發送

#### 2️⃣ **其他命令仍然是單選**
- Session commands (`/compact`, `/cost` 等) → **立即發送 + 關閉 Palette**
- Agent commands → **立即發送 + 關閉 Palette**
- MCP tools → **立即發送 + 關閉 Palette**

---

## 🎯 使用示範

### 場景 1: 選擇單個 Skill

```
1. 按 Cmd+K 打開 Command Palette
2. 選擇 /superpower:brainstorming
3. Palette 保持開啟，skill 插入到輸入框
4. 按 Esc 關閉 Palette
5. 按 Enter 發送訊息
```

**輸入框內容**: `/superpower:brainstorming`

### 場景 2: 選擇多個 Skills

```
1. 按 Cmd+K 打開 Command Palette
2. 選擇 /superpower:brainstorming
   → 輸入框: /superpower:brainstorming
3. Palette 仍然開啟
4. 選擇 /superpower:test-driven-development
   → 輸入框: /superpower:brainstorming /superpower:test-driven-development
5. 選擇 /code-review-expert
   → 輸入框: /superpower:brainstorming /superpower:test-driven-development /code-review-expert
6. 按 Esc 關閉 Palette
7. 按 Enter 發送訊息
```

**輸入框內容**:
```
/superpower:brainstorming /superpower:test-driven-development /code-review-expert
```

### 場景 3: Session Commands（單選模式）

```
1. 按 Cmd+K 打開 Command Palette
2. 選擇 /compact
   → 立即發送並關閉 Palette
```

---

## 🔧 技術實作

### 修改的檔案

#### 1. [MessageInput.jsx](client/src/components/chat/MessageInput.jsx)

**新增 Props**:
```javascript
function MessageInput({
  onSend,
  disabled,
  onStop,
  isStreaming,
  onOpenPalette,
  commands = [],
  selectedCommand = null  // ← 新增
})
```

**新增 Effect**（Lines 21-35）:
```javascript
// Handle command selected from CommandPalette
useEffect(() => {
  if (selectedCommand && selectedCommand.name) {
    // Append to existing text (for multi-skill selection)
    setText(prev => {
      const trimmed = prev.trim();
      if (trimmed) {
        // Add space if there's existing text
        return trimmed + ' ' + selectedCommand.name;
      }
      return selectedCommand.name;
    });
    // Focus textarea
    textareaRef.current?.focus();
  }
}, [selectedCommand]);
```

#### 2. [ChatPage.jsx](client/src/pages/ChatPage.jsx)

**新增 State**（Line 24）:
```javascript
const [selectedCommand, setSelectedCommand] = useState(null);
```

**修改 `handleCommandSelect`**（Lines 259-272）:
```javascript
const handleCommandSelect = (item) => {
  if (item.category === 'session' || item.category === 'agent') {
    // Session commands and agents — send directly
    handleSend(item.name);
    setShowPalette(false);
  } else if (item.category === 'skill') {
    // Skills — insert into input box for multi-selection
    setSelectedCommand(item);
    // Keep palette open for multiple selections
    // User can close with Esc or click outside
  } else if (item.category === 'mcp') {
    // For MCP tools, insert a template prompt and close
    handleSend(`Use the ${item.name} MCP tool to `);
    setShowPalette(false);
  }
};
```

**傳遞 Props 到 MessageInput**（Line 322）:
```javascript
<MessageInput
  onSend={handleSend}
  disabled={!activeSessionId || isStreaming}
  onStop={handleStop}
  isStreaming={isStreaming}
  onOpenPalette={() => setShowPalette(true)}
  commands={commands}
  selectedCommand={selectedCommand}  // ← 新增
/>
```

#### 3. [CommandPalette.jsx](client/src/components/chat/CommandPalette.jsx)

**修改鍵盤 Enter 處理**（Lines 73-84）:
```javascript
} else if (e.key === 'Enter') {
  e.preventDefault();
  if (flatList[selectedIndex]) {
    const item = flatList[selectedIndex];
    onSelect(item);
    // Only close palette for non-skill items
    // Skills stay open for multi-selection
    if (item.category !== 'skill') {
      onClose();
    }
  }
}
```

**修改點擊處理**（Lines 141-147）:
```javascript
onClick={() => {
  onSelect(item);
  // Only close for non-skill items
  if (item.category !== 'skill') {
    onClose();
  }
}}
```

---

## 📋 行為對照表

| 命令類型 | 舊行為 | 新行為 |
|---------|--------|--------|
| **Skills** (`/superpower:*`, `/openspec-*`, etc.) | 選擇 → 立即發送 + 關閉 | 選擇 → 插入輸入框 + **保持開啟** |
| **Session Commands** (`/compact`, `/cost`, etc.) | 選擇 → 立即發送 + 關閉 | **不變** |
| **Agent Commands** (General Purpose, Navigate, etc.) | 選擇 → 立即發送 + 關閉 | **不變** |
| **MCP Tools** | 選擇 → 插入模板 + 關閉 | **不變** |

---

## 🎨 UI/UX 改進

### 視覺提示

當選擇 skill 後：
1. ✅ Skill 名稱出現在輸入框
2. ✅ Command Palette 保持開啟（繼續選擇）
3. ✅ 輸入框自動 focus（可以直接輸入更多文字）
4. ✅ 多個 skills 以空格分隔

### 關閉 Palette 的方式

1. **按 Esc 鍵**
2. **點擊外部區域**
3. **選擇非 skill 命令**（自動關閉）

### Keyboard Navigation

- **↑/↓**: 導航選項
- **Enter**: 選擇當前項目
  - Skills → 插入 + 保持開啟
  - 其他 → 發送 + 關閉
- **Esc**: 關閉 Palette

---

## 🚀 升級指南

### 從 v2.23.2 升級到 v2.24.0

```bash
cd /home/ubuntu/system-monitor
sudo docker build -t localhost:30500/system-monitor:v2.24.0 .
sudo docker push localhost:30500/system-monitor:v2.24.0

# 更新 deployment
sudo kubectl set image deployment/system-monitor \
  system-monitor=localhost:30500/system-monitor:v2.24.0 \
  -n deployer-dev

# 等待部署完成
sudo kubectl rollout status deployment/system-monitor -n deployer-dev
```

### Breaking Changes

**無**。完全向下相容。

### 新增 API Endpoint

無。

### 資料庫變更

無。

---

## ✅ 測試驗證

### 測試 Multi-Skill Selection

1. 打開 https://monitor.ko.unieai.com/chat
2. 選擇或建立一個 session
3. 按 **Cmd+K** 打開 Command Palette
4. 選擇第一個 skill (例如 `/superpower:brainstorming`)
   - ✅ 確認 skill 插入到輸入框
   - ✅ 確認 Palette 保持開啟
5. 選擇第二個 skill (例如 `/code-review-expert`)
   - ✅ 確認第二個 skill 追加到輸入框（有空格分隔）
   - ✅ 確認 Palette 仍然開啟
6. 按 **Esc** 關閉 Palette
7. 按 **Enter** 發送訊息
   - ✅ 確認訊息包含兩個 skills

### 測試 Session Commands（不應該改變）

1. 按 **Cmd+K** 打開 Command Palette
2. 選擇 `/compact`
   - ✅ 確認立即發送
   - ✅ 確認 Palette 自動關閉

---

## 🐛 已知問題

無。

---

## 📝 FAQ

**Q: 如果我只想選擇一個 skill 並立即發送，怎麼辦？**

A: 有兩種方式：
1. 選擇 skill → 按 Esc 關閉 Palette → 按 Enter 發送
2. 使用輸入框的 autocomplete (輸入 `/` 然後選擇) → 按 Enter

**Q: 為什麼 Session Commands 和 Skills 行為不同？**

A: 因為使用場景不同：
- Session Commands (`/compact`, `/cost`) 通常是**單一操作**
- Skills 經常需要**組合使用**（例如：Brainstorming + TDD + Code Review）

**Q: 可以混合 Skills 和其他命令嗎？**

A: 可以！選擇 skill 後，可以在輸入框手動添加更多文字或其他命令。

**Q: Skills 的順序重要嗎？**

A: 取決於後端如何處理多個 skills。通常第一個 skill 會先執行。

---

## 🔮 未來改進

可能的優化：

- [ ] **Visual Tags**: 在輸入框中以 tag 形式顯示已選 skills（可刪除）
- [ ] **Skill Presets**: 儲存常用的 skill 組合（例如 "Full Development Workflow"）
- [ ] **Drag to Reorder**: 拖拽調整 skills 順序
- [ ] **Smart Suggestions**: 根據第一個 skill 推薦相關 skills

---

## 📊 版本資訊

- **Version**: v2.24.0
- **Release Date**: 2026-03-14
- **Image**: `localhost:30500/system-monitor:v2.24.0`
- **Namespace**: `deployer-dev`
- **URL**: https://monitor.ko.unieai.com

## 變更日誌

**Added**:
- ✅ Multi-skill selection support
- ✅ `selectedCommand` prop in MessageInput
- ✅ Conditional Palette close logic based on category
- ✅ Skill append to input box with space separator

**Changed**:
- ✅ `handleCommandSelect` logic (different behavior for skills vs other commands)
- ✅ CommandPalette Enter/Click handlers (conditional close)
- ✅ MessageInput to accept `selectedCommand` prop

**Fixed**:
- ✅ 無法選擇多個 skills 的問題

---

## 補充說明：PUA Skill

### 問題：為什麼沒有 PUA skill？

**原因**: PUA skill 只存在於 **Server B**，不在 **Server A**。

**驗證**:
```bash
# Server A (172.31.6.240)
curl "https://monitor.ko.unieai.com/api/chat/skills?serverIp=172.31.6.240" | jq -r '.skills[] | select(.name | contains("pua"))'
# 沒有輸出

# Server B (18.181.190.83)
curl "https://monitor.ko.unieai.com/api/chat/skills?serverIp=18.181.190.83" | jq -r '.skills[] | select(.name | contains("pua"))'
# 輸出: /pua:debugging
```

**Skills 數量**:
- Server A: **29 個 skills**（沒有 PUA）
- Server B: **30 個 skills**（有 `/pua:debugging`）

### 解決方案

如果需要在 Server A 使用 PUA skill：

1. **在 Server A 上安裝 PUA skill**:
   ```bash
   ssh ubuntu@172.31.6.240
   cd ~/.claude/skills  # 或專案的 .claude/skills/
   # 複製或安裝 pua-debugging skill
   ```

2. **或改用 Server B**:
   - 建立 session 時選擇 Server B (18.181.190.83)
   - 執行 `/refresh-skills`
   - 確認看到 `/pua:debugging`

---

**完整技術文件**: 本文件
**上一版本**: [FEATURES_V2.23.md](FEATURES_V2.23.md)
