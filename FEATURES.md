# System Monitor v2.39.2 功能清單

**部署狀態**: ✅ 運行中 (Pod: system-monitor-786dfff54-zwt4b)  
**URL**: https://monitor.ko.unieai.com  
**Namespace**: deployer-dev

---

## 1️⃣ 核心監控功能

### 系統監控
- ✅ CPU/Memory/Disk 即時監控 (Server A & B)
- ✅ Docker 容器狀態追蹤
- ✅ Claude Remote Session 偵測
- ✅ 監控資料持久化 (hostPath volume)
- ✅ 健康檢查 API (`/health`)

### 使用量追蹤
- ✅ Claude API Usage 監控
- ✅ 歷史數據圖表 (6h/12h/24h/2d/7d)
- ✅ **NEW**: 時間範圍切換 loading 狀態
- ✅ **NEW**: 資料範圍資訊顯示
- ✅ **NEW**: 增大 touch target (40×36px)
- ✅ **NEW**: 按鈕視覺回饋 (shadow + scale)
- ✅ Session/Weekly/Sonnet/Opus 分別追蹤
- ✅ 自動重整 (60 秒)

---

## 2️⃣ Chat 功能

### SDK 整合
- ✅ Claude Agent SDK 串流對話
- ✅ NDJSON 協議 (stdin=commands, stderr=events)
- ✅ 多模態支援 (文字 + 圖片上傳)
- ✅ Session resume (claudeSessionId)
- ✅ Context 使用量追蹤
- ✅ /compact 指令支援

### Session 管理
- ✅ 多 session 並行 (concurrent streaming)
- ✅ Session 持久化 (Pod 重啟不遺失)
- ✅ Per-session mode (Ask/Plan/Bypass)
- ✅ 專案模式預設 Bypass
- ✅ Session rename
- ✅ Message history

### 權限模式
- ✅ Ask Mode (default, 詢問許可)
- ✅ Plan Mode (規劃模式)
- ✅ Bypass Mode (不詢問直接執行)
- ✅ Auto Mode (自動判斷)
- ✅ Accept Edits (自動接受編輯)

---

## 3️⃣ **NEW** Config Injection 系統

### 自動配置注入
- ✅ **Global Rules** (4 檔案: common/typescript/python/devops)
- ✅ **CLAUDE.md** (per project)
- ✅ **Memory** (MEMORY.md + instincts.md per project)
- ✅ **Custom Session Prompt** (project-specific)
- ✅ **Project CWD** (自動偵測工作目錄)

### 支援專案
| Project | Rules | CLAUDE.md | Memory | CWD |
|---------|:-----:|:---------:|:------:|-----|
| **agent-skill** | ✅ | ✅ | ✅ | `/home/ubuntu/agent-skill` |
| **richs** | ✅ | ❌ | ✅ | `.../ai-investment-platform` |
| **neuropack** | ✅ | ❌ | ✅ | `.../NeuroPack` |

### Config 檢查 API
- ✅ `GET /api/chat/projects/config` — 查看各專案配置狀態

---

## 4️⃣ 專案工作區

### 預設專案
- ✅ **NeuroPack** (🧠) — AI/ML 工具包
- ✅ **Richs** (💰) — AI Investment Platform
- ✅ **Deep Clean** (🧹) — 磁碟清理專家

### 專案功能
- ✅ 專案專屬 session (persistent)
- ✅ 專案初始化 review prompt
- ✅ 自訂專案建立
- ✅ Opus 1M context window (專案預設)

---

## 5️⃣ UI/UX 功能

### 聊天介面
- ✅ 串流文字渲染 (pause 偵測切換 markdown)
- ✅ Markdown 渲染 (GFM tables/code blocks)
- ✅ 語法高亮 (react-syntax-highlighter)
- ✅ Tool usage 展開/收合
- ✅ 圖片上傳 (paste/drop/file)
- ✅ 圖片預覽 + 刪除
- ✅ Mobile RWD (全螢幕寬度)
- ✅ Pull-to-refresh

### 工具卡片
- ✅ Tool 執行狀態顯示
- ✅ Input/Output 展開查看
- ✅ Mobile 最大高度 50vh
- ✅ 自動 word-break

### 指令選單
- ✅ Command Palette (Ctrl+K)
- ✅ 36 skills
- ✅ 20 ECC commands
- ✅ 4 agents
- ✅ Session commands (/compact, /cost, etc.)

---

## 6️⃣ 資料持久化

### Volume Mounts
```yaml
✅ /home/ubuntu/.claude          → 全域配置 (rules, memory, credentials)
✅ /home/ubuntu/agent-skill      → 專案根目錄 (CLAUDE.md)
✅ /app/server/data              → Chat sessions + usage history
✅ /proc, /sys                   → 系統監控
✅ /var/run/docker.sock          → Docker 監控
```

### 持久化資料
- ✅ `chat-sessions.json` — Session 資料
- ✅ `usage-history.json` — Usage 歷史
- ✅ Pod 重啟資料不遺失

---

## 7️⃣ 安全性

### 認證
- ✅ Google OAuth 2.0
- ✅ Allowed emails 白名單
- ✅ JWT token (localStorage)
- ✅ Protected routes

### SSH 管理
- ✅ SSH key from ConfigMap
- ✅ Connection pooling
- ✅ Auto-reconnect

---

## 8️⃣ API 端點總覽

### Chat API (`/api/chat`)
```
GET  /models                    — 可用模型清單
GET  /servers                   — 遠端伺服器清單
GET  /sessions                  — Session 清單
POST /sessions                  — 建立 session
GET  /sessions/:id/history      — Message 歷史
POST /sessions/:id/message      — 發送訊息 (SSE)
POST /sessions/:id/compact      — 壓縮 context
GET  /sessions/:id/context      — Context 使用量
DELETE /sessions/:id            — 刪除 session
GET  /projects                  — 專案清單
POST /projects/:slug/open       — 開啟專案 session
GET  /projects/config           — 🆕 配置注入狀態
GET  /commands                  — 可用指令清單
GET  /skills                    — 可用 skills
GET  /mcp-tools                 — MCP server 工具
```

### Usage API (`/api/usage`)
```
GET  /                          — 當前使用量
GET  /history?hours=N           — 歷史資料
```

### Auth API (`/api/auth`)
```
POST /google                    — Google 登入
GET  /status                    — 認證狀態
POST /logout                    — 登出
```

---

## 9️⃣ 已修復的 Bug (v2.39.1 → v2.39.2)

### v2.39.1
1. ✅ 專案模式預設 bypass (非 ask)
2. ✅ '+' 按鈕 position relative 修復
3. ✅ Mode 切換時 streaming 不消失
4. ✅ Mobile command output 不截斷

### v2.39.2
1. ✅ Config injection 整合 (rules + CLAUDE.md + memory)
2. ✅ Usage History 時間按鈕 UX 改善

---

## 🔟 技術架構

### 前端
- React 18 + Vite
- TailwindCSS
- Recharts (圖表)
- React Markdown + Syntax Highlighter

### 後端
- Express.js (Node 20)
- SSH2 (遠端連線)
- SSE (串流)
- NDJSON 協議

### 基礎設施
- K8s Deployment (1 replica)
- hostPath volumes (4 個)
- ClusterIP Service
- Ingress (HTTPS)

---

## 測試狀態

✅ Health Check  
✅ Models API  
✅ Projects API  
✅ Config API (NEW)  
✅ Sessions API  
✅ Volume Mounts (全部可訪問)  
✅ Chat Sessions 持久化  
✅ Config Injection (agent-skill: 完整, richs/neuropack: rules+memory)

---

**版本**: v2.39.2  
**Image**: `localhost:30500/system-monitor:v2.39.2`  
**最後部署**: 2026-04-03 12:00 UTC  
**狀態**: 🟢 ALL SYSTEMS OPERATIONAL
