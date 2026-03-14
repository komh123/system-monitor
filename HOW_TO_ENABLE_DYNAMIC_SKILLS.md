# 如何啟用動態 Skills 檢測

## 現況（v2.20.0）

- ✅ Feature Flag 架構已建立
- ✅ SSH 函數框架已準備好
- ✅ 靜態列表正常運作（29 skills）
- ⏳ SSH 實作邏輯待補完

## 未來啟用步驟（只需 3 步）

### 步驟 1：實作 SSH 讀取邏輯

編輯 `server/routes/chatRoutes.js` → 找到 `getSkillsFromSSH()` 函數：

```javascript
async function getSkillsFromSSH(serverIp) {
  const pool = getSSHPool();

  try {
    // 解除註解以下程式碼：
    const skillDirs = await pool.exec(serverIp,
      'ls -1 ~/.claude/skills/ 2>/dev/null || echo ""',
      { timeout: 5000 }
    );

    const skills = skillDirs.trim().split('\n')
      .filter(Boolean)
      .map(dirName => {
        const cmdName = dirName.replace(/-/g, ':');
        return {
          id: cmdName,
          name: `/${cmdName}`,
          description: 'Skill from remote server',
          category: 'skill'
        };
      });

    return skills.length > 0 ? skills : getStaticSkills();

  } catch (err) {
    console.error('[SSH Skills] Error:', err.message);
    return getStaticSkills();
  }
}
```

### 步驟 2：設定環境變數

K8s ConfigMap 或 Deployment 中加入：

```yaml
env:
  - name: DYNAMIC_SKILLS
    value: "true"
```

### 步驟 3：重新部署

```bash
# 重建映像檔
cd /home/ubuntu/system-monitor
sudo docker build -t localhost:30500/system-monitor:v2.21.0 .
sudo docker push localhost:30500/system-monitor:v2.21.0

# 部署
sudo kubectl set image deployment/system-monitor \
  system-monitor=localhost:30500/system-monitor:v2.21.0 \
  -n deployer-dev
```

## 驗證

```bash
# 測試 API（應該回傳遠端 server 的真實 skills）
curl -s "https://monitor.ko.unieai.com/api/chat/skills?serverIp=172.31.6.240" \
  | jq '.skills | length'

# 檢查 log（確認 SSH 執行成功）
sudo kubectl logs -n deployer-dev deployment/system-monitor --tail=50 | grep Skills
```

## 優勢

1. **零風險**：SSH 失敗時自動 fallback 到靜態列表
2. **零停機**：環境變數變更不影響現有功能
3. **一鍵切換**：`DYNAMIC_SKILLS=true` 即可啟用
4. **易於除錯**：清楚的 log 和錯誤處理

## 目前為何不啟用？

根據之前測試，SSH 執行 `claude skills list` 有以下問題：

1. **Timeout** - 執行時間 >10s（太慢）
2. **Command Not Found** - SSH 找不到 `claude` 指令
3. **Path 問題** - 非互動式 shell 的 PATH 設定

**解決方案**：使用 `ls ~/.claude/skills/` 直接讀取目錄（更快、更可靠）

## 架構圖

```
                ┌─────────────────────┐
                │  GET /api/chat/     │
                │  skills?serverIp=X  │
                └──────────┬──────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Check DYNAMIC_SKILLS │
                │   env variable       │
                └──────────┬───────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
        true│                             │false
            ▼                             ▼
    ┌──────────────────┐      ┌──────────────────┐
    │ getSkillsFromSSH │      │ getStaticSkills  │
    │   (serverIp)     │      │   (29 skills)    │
    └────────┬─────────┘      └──────────────────┘
             │
             ├─ SSH Execute
             ├─ Parse Results
             └─ Fallback on Error
                    │
                    ▼
              ┌──────────────┐
              │ Return Skills│
              └──────────────┘
```

## 未來擴充建議

1. **快取機制**：避免每次請求都 SSH（加入 Redis 快取，TTL 5 分鐘）
2. **批次查詢**：一次查詢多個 server 的 skills
3. **Skill 版本管理**：檢測 skills 版本變更
4. **健康檢查**：定期驗證 SSH 連線狀態
