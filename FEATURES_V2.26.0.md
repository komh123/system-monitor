# 新功能 v2.26.0 - Context Usage Display + Mode Switching

**日期**: 2026-03-14
**版本**: v2.26.0
**新增功能**: Context 使用率顯示、自動 Compact、Mode 切換

---

## ✨ 新功能一覽

### 1. Context Usage Indicator (Context 使用率指示器)

**功能描述**:
- 即時顯示 Context 窗口使用百分比
- 三段式顏色編碼：綠色 (<70%)、黃色 (70-89%)、紅色 (≥90%)
- 進度條視覺化顯示
- 當使用率 ≥70% 時自動顯示 Compact 按鈕

**UI 元件位置**:
- ChatHeader 右側，與 Mode Selector 同行
- 桌面版顯示進度條，手機版隱藏進度條（節省空間）

**技術實作**:
```javascript
// ContextIndicator.jsx
- 三段式顏色邏輯 (getColor, getBarColor)
- 響應式設計 (隱藏進度條: hidden sm:flex)
- 自動顯示 Compact 按鈕 (percentage >= 70)
```

---

### 2. Auto-Compact Mechanism (自動壓縮機制)

**功能描述**:
- 當 Context 使用率達到 90% 時自動觸發 `/compact` 命令
- 避免 Context 窗口溢出導致對話中斷
- 透過 useEffect 監控 contextUsage 狀態自動執行

**觸發條件**:
```javascript
useEffect(() => {
  if (contextUsage >= 90 && activeSessionId && !isStreaming) {
    console.log('[Auto-Compact] Context usage >= 90%, triggering auto-compact...');
    handleCompact();
  }
}, [contextUsage, activeSessionId, isStreaming]);
```

**防護機制**:
- 只在有 active session 時執行
- 避免在 streaming 時觸發（防止打斷對話）
- Console 日誌記錄觸發事件

---

### 3. Mode Switching (模式切換)

**功能描述**:
- 三種模式：Ask（詢問）、Plan（規劃）、Bypass（直接執行）
- 視覺化切換介面（按鈕式 Tabs）
- 切換模式時顯示系統訊息確認

**三種模式說明**:

| 模式 | 圖示 | 說明 | 使用場景 |
|-----|------|------|---------|
| **Ask** | 💬 | 正常對話模式 | 一般問答、討論 |
| **Plan** | 📋 | 規劃模式 | 建立實作計畫 |
| **Bypass** | ⚡ | 直接執行模式 | 跳過權限檢查 |

**UI 設計**:
- Active 模式顯示高亮顏色（藍/紫/琥珀）
- Inactive 模式顯示灰色
- Hover 效果提升互動性
- 工具提示顯示模式說明

**技術實作**:
```javascript
// ModeSelector.jsx
const MODES = [
  { id: 'ask', label: 'Ask', icon: '💬', color: 'bg-blue-500/20...' },
  { id: 'plan', label: 'Plan', icon: '📋', color: 'bg-purple-500/20...' },
  { id: 'bypass', label: 'Bypass', icon: '⚡', color: 'bg-amber-500/20...' }
];
```

---

### 4. Context Usage Parsing (Context 使用率解析)

**功能描述**:
- 從 Assistant 訊息中自動解析 Context 使用率
- 支援兩種格式：
  1. 百分比格式：`Context: 75%`
  2. Token 格式：`Token usage: 75000/100000`

**解析邏輯**:
```javascript
useEffect(() => {
  const recentMessages = messages.slice(-5);
  for (const msg of recentMessages.reverse()) {
    if (msg.role === 'assistant' && msg.content) {
      const percentMatch = msg.content.match(/Context:\s*(\d+)%/i);
      const tokenMatch = msg.content.match(/Token usage:\s*(\d+)\/(\d+)/i);

      if (percentMatch) {
        setContextUsage(parseInt(percentMatch[1], 10));
        return;
      } else if (tokenMatch) {
        const used = parseInt(tokenMatch[1], 10);
        const total = parseInt(tokenMatch[2], 10);
        const percentage = Math.round((used / total) * 100);
        setContextUsage(percentage);
        return;
      }
    }
  }
}, [messages]);
```

**優化策略**:
- 只檢查最近 5 條訊息（效能優化）
- 從最新訊息開始檢查（提高準確性）
- 優先匹配百分比格式（更精確）

---

## 🎨 UI/UX 改進

### ChatHeader 雙行佈局

**Before (v2.25.3)**:
```
┌─────────────────────────────────────────────┐
│ [Menu] Session Name [Model] [Status] [Cmd+K]│
└─────────────────────────────────────────────┘
```

**After (v2.26.0)**:
```
┌─────────────────────────────────────────────┐
│ [Menu] Session Name [Model] [Status] [Cmd+K]│ ← Top row
├─────────────────────────────────────────────┤
│ [Ask][Plan][Bypass]      [📊 75%][██████]  │ ← Bottom row
└─────────────────────────────────────────────┘
```

**設計理念**:
- 分離「Session 控制」和「Context/Mode 狀態」
- 提高資訊密度但不影響可讀性
- 響應式設計：手機版隱藏進度條保持緊湊

---

### 顏色編碼系統

**Context Usage Colors**:
- 🟢 Green (<70%): `text-green-400 bg-green-500/20 border-green-500/40`
- 🟡 Yellow (70-89%): `text-yellow-400 bg-yellow-500/20 border-yellow-500/40`
- 🔴 Red (≥90%): `text-red-400 bg-red-500/20 border-red-500/40`

**Mode Colors**:
- 💬 Ask (Blue): `bg-blue-500/20 text-blue-400 border-blue-500/40`
- 📋 Plan (Purple): `bg-purple-500/20 text-purple-400 border-purple-500/40`
- ⚡ Bypass (Amber): `bg-amber-500/20 text-amber-400 border-amber-500/40`

---

## 📋 行為對照表

### Auto-Compact 行為

| Context 使用率 | Compact 按鈕 | Auto-Compact | 顏色 |
|---------------|-------------|--------------|------|
| 0-69% | ❌ 隱藏 | ❌ 不觸發 | 🟢 綠色 |
| 70-89% | ✅ 顯示 | ❌ 不觸發 | 🟡 黃色 |
| 90-100% | ✅ 顯示 | ✅ **自動觸發** | 🔴 紅色 |

### Mode Switching 行為

| 模式 | 系統訊息 | 後端影響 | 前端狀態 |
|-----|---------|---------|---------|
| Ask → Plan | "🔄 Switched to Plan Mode" | (未來實作) | `mode='plan'` |
| Plan → Bypass | "🔄 Switched to Bypass Mode" | (未來實作) | `mode='bypass'` |
| Bypass → Ask | "🔄 Switched to Ask Mode" | (未來實作) | `mode='ask'` |

---

## 🔧 技術實作

### 修改的檔案

#### 1. **新增元件**

**[client/src/components/chat/ContextIndicator.jsx](client/src/components/chat/ContextIndicator.jsx)** (新檔案)
- Props: `percentage`, `onCompact`
- 功能: 顯示 Context 使用率、進度條、Compact 按鈕
- 行數: 36 行

**[client/src/components/chat/ModeSelector.jsx](client/src/components/chat/ModeSelector.jsx)** (新檔案)
- Props: `currentMode`, `onModeChange`
- 功能: 三按鈕切換 Ask/Plan/Bypass 模式
- 行數: 28 行

#### 2. **修改元件**

**[client/src/components/chat/ChatHeader.jsx](client/src/components/chat/ChatHeader.jsx)**
- 新增 Props: `contextUsage`, `onCompact`, `mode`, `onModeChange`
- 改為雙行佈局
- Import 新元件: `ContextIndicator`, `ModeSelector`

**[client/src/pages/ChatPage.jsx](client/src/pages/ChatPage.jsx)**
- 新增 State: `contextUsage`, `mode`
- 新增函數: `handleCompact`, `handleModeChange`
- 新增 useEffect: Auto-compact 邏輯、Context 解析邏輯
- 傳遞新 Props 到 ChatHeader

#### 3. **部署配置**

**[k8s/deployment.yaml](k8s/deployment.yaml)**
- 更新 image 版本: `v2.25.3` → `v2.26.0`

---

## 🚀 升級指南

### 從 v2.25.3 升級到 v2.26.0

```bash
cd /home/ubuntu/system-monitor

# Build
sudo docker build --no-cache -t localhost:30500/system-monitor:v2.26.0 .

# Push
sudo docker push localhost:30500/system-monitor:v2.26.0

# Update deployment.yaml
sed -i 's/v2.25.3/v2.26.0/g' k8s/deployment.yaml

# Deploy
sudo kubectl set image deployment/system-monitor \
  system-monitor=localhost:30500/system-monitor:v2.26.0 \
  -n deployer-dev

# Wait for rollout
sudo kubectl rollout status deployment/system-monitor -n deployer-dev
```

### Breaking Changes

**無**。完全向下相容。

### 新增 API Endpoint

無。目前 Context 解析為前端邏輯，未來可新增 `/api/chat/context` endpoint。

### 資料庫變更

無。

---

## ✅ 測試驗證

### 測試 Context Usage Indicator

1. 打開 https://monitor.ko.unieai.com/chat
2. 選擇或建立一個 session
3. **檢查 ChatHeader 右下角**
   - ✅ 確認看到 Context 使用率百分比（例如 `📊 0%`）
   - ✅ 確認顏色為綠色（初始狀態）
   - ✅ 確認沒有顯示 Compact 按鈕（<70%）
4. 發送多條長訊息，模擬 Context 增長
5. **當 Context ≥ 70%**
   - ✅ 確認顏色變為黃色
   - ✅ 確認出現 Compact 按鈕
6. **當 Context ≥ 90%**
   - ✅ 確認顏色變為紅色
   - ✅ 確認自動觸發 `/compact` 命令
   - ✅ 確認 Console 日誌顯示 `[Auto-Compact] Context usage >= 90%...`

### 測試 Mode Switching

1. **檢查 ChatHeader 左側 Mode Selector**
   - ✅ 確認看到三個按鈕：💬 Ask、📋 Plan、⚡ Bypass
   - ✅ 確認 Ask 模式高亮顯示（藍色）
2. **切換到 Plan 模式**
   - 點擊 📋 Plan 按鈕
   - ✅ 確認按鈕變為紫色高亮
   - ✅ 確認訊息列表顯示系統訊息 "🔄 Switched to Plan Mode"
3. **切換到 Bypass 模式**
   - 點擊 ⚡ Bypass 按鈕
   - ✅ 確認按鈕變為琥珀色高亮
   - ✅ 確認訊息列表顯示系統訊息 "🔄 Switched to Bypass Mode"
4. **切換回 Ask 模式**
   - 點擊 💬 Ask 按鈕
   - ✅ 確認按鈕變為藍色高亮
   - ✅ 確認訊息列表顯示系統訊息 "🔄 Switched to Ask Mode"

### 測試 Responsive Design

1. **桌面版 (>640px)**
   - ✅ 確認 Context Indicator 顯示進度條
   - ✅ 確認 Mode Selector 顯示圖示 + 文字
2. **手機版 (<640px)**
   - ✅ 確認 Context Indicator 隱藏進度條（只顯示百分比）
   - ✅ 確認 Mode Selector 只顯示圖示（文字仍在 title 中）

### 測試 Context Parsing

**方法 1: 使用 `/compact` 命令**
1. 發送 `/compact` 命令
2. 等待 Assistant 回覆（應包含 Token usage 資訊）
3. ✅ 確認 Context Indicator 自動更新百分比

**方法 2: 手動注入測試訊息**
```javascript
// 在 Browser Console 測試
// (開發模式下可用)
const testMsg = {
  role: 'assistant',
  content: 'Token usage: 75000/100000',
  timestamp: new Date().toISOString()
};
// 確認 Context Indicator 顯示 75%
```

---

## 🐛 已知問題

### 1. Context 解析依賴 Assistant 訊息格式

**問題**:
- 目前 Context 使用率解析依賴 Assistant 回覆中包含特定格式字串
- 如果 Assistant 未提供 Context 資訊，百分比將停留在 0%

**解決方案 (未來版本)**:
- 新增 `/api/chat/sessions/:id/context` API endpoint
- 前端定期 polling 或透過 SSE 接收即時 Context 更新

### 2. Mode 切換目前僅為前端狀態

**問題**:
- Mode 切換目前只更新前端 state，未傳送到後端
- 後端行為不會根據 Mode 改變

**解決方案 (未來版本)**:
- 修改 `/api/chat/sessions/:id/message` API，接受 `mode` 參數
- 後端根據 Mode 調整行為（例如 Plan 模式自動進入規劃流程）

### 3. Auto-Compact 可能打斷長對話

**問題**:
- 當 Context 達到 90% 時立即觸發 `/compact`
- 如果用戶正在輸入長訊息，可能造成中斷

**緩解措施**:
- 已加入 `!isStreaming` 條件，避免在 streaming 時觸發
- 未來可新增「延遲觸發」機制（例如 5 秒後再觸發）

---

## 🔮 未來改進

### Phase 1: Backend Integration (後端整合)

- [ ] **Context API Endpoint**
  - 新增 `GET /api/chat/sessions/:id/context` endpoint
  - 回傳格式: `{ used: 75000, total: 100000, percentage: 75 }`
  - 前端改為定期 polling (每 30 秒)

- [ ] **Mode Parameter**
  - 修改 `POST /api/chat/sessions/:id/message` 接受 `mode` 參數
  - 後端根據 Mode 調整處理邏輯

### Phase 2: Smart Auto-Compact (智慧壓縮)

- [ ] **Compact 策略選擇**
  - 預設：保留最近 10 條訊息
  - Aggressive：保留最近 5 條訊息
  - Conservative：保留最近 20 條訊息

- [ ] **Compact 預覽**
  - 顯示將保留哪些訊息
  - 用戶可手動選擇要保留的重要訊息

### Phase 3: Advanced Mode Features (進階模式功能)

- [ ] **Plan Mode 自動化**
  - 自動進入規劃流程
  - 生成 Step-by-Step 計畫
  - 自動建立子任務

- [ ] **Bypass Mode 確認**
  - 顯示警告提示
  - 要求用戶二次確認（防止誤觸）

### Phase 4: Context Visualization (Context 視覺化)

- [ ] **Token 分佈圖表**
  - 顯示每條訊息佔用的 Token 數
  - 視覺化 System、User、Assistant 訊息比例

- [ ] **Context Timeline**
  - 時間軸顯示 Context 使用率變化
  - 標記 Compact 事件

---

## 📝 FAQ

### Q1: 為什麼 Context 使用率一直顯示 0%？

**A**: 目前 Context 解析依賴 Assistant 訊息中包含特定格式。請嘗試：
1. 發送 `/compact` 命令（會顯示 Token usage）
2. 發送 `/context` 命令（如果後端支援）
3. 等待後端 API 整合（未來版本）

---

### Q2: Auto-Compact 會不會刪除重要訊息？

**A**: `/compact` 命令**不會刪除訊息**，只會壓縮歷史對話：
- 保留最近訊息的完整內容
- 舊訊息轉為摘要形式
- 原始訊息仍保存在資料庫中

---

### Q3: 切換 Mode 會影響現有對話嗎？

**A**: 目前 Mode 切換只更新前端狀態，**不影響**現有對話。未來版本將：
- 發送 Mode 參數到後端
- 後端根據 Mode 調整處理邏輯

---

### Q4: Compact 按鈕和 Auto-Compact 有什麼區別？

**A**:
- **Compact 按鈕**: 手動觸發，用戶主動點擊
- **Auto-Compact**: 自動觸發，當 Context ≥ 90% 時自動執行
- 兩者執行的命令相同（`/compact`）

---

### Q5: 為什麼手機版看不到進度條？

**A**: 響應式設計優化：
- 手機版空間有限，隱藏進度條
- 仍顯示百分比和顏色編碼
- 桌面版顯示完整進度條

---

### Q6: 如何停用 Auto-Compact？

**A**: 目前無法從 UI 停用。未來可新增：
- Settings 頁面新增 "Auto-Compact Threshold" 設定
- 選項: Off、70%、80%、90%

---

## 📊 版本資訊

- **Version**: v2.26.0
- **Release Date**: 2026-03-14
- **Image**: `localhost:30500/system-monitor:v2.26.0`
- **Namespace**: `deployer-dev`
- **URL**: https://monitor.ko.unieai.com

## 變更日誌

**Added**:
- ✅ Context Usage Indicator (with color-coded percentage)
- ✅ Context progress bar (desktop only)
- ✅ Auto-Compact mechanism (triggers at ≥90%)
- ✅ Mode Selector (Ask/Plan/Bypass)
- ✅ Context parsing from Assistant messages
- ✅ System messages for mode switching

**Changed**:
- ✅ ChatHeader layout (single row → dual row)
- ✅ ChatHeader props (added contextUsage, onCompact, mode, onModeChange)
- ✅ ChatPage state management (added contextUsage, mode states)

**Fixed**:
- ✅ 無已知 Bug

---

## 相關文件

- [FEATURES_V2.23.md](FEATURES_V2.23.md) - Project + User Skills 偵測
- [FEATURES_V2.24.0.md](FEATURES_V2.24.0.md) - Multi-Skill Selection
- [FEATURES_V2.25.3.md](FEATURES_V2.25.3.md) - Plugin Skills 嘗試（失敗）
- [PLUGIN_SKILLS_LIMITATION.md](PLUGIN_SKILLS_LIMITATION.md) - Plugin Skills 技術限制

---

**完整技術文件**: 本文件
**上一版本**: [FEATURES_V2.25.3.md](FEATURES_V2.25.3.md) (僅日誌，無實際新功能)
**下一版本**: TBD
