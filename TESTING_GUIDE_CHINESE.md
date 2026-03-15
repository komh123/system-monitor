# System Monitor v2.29.0 測試指南

**部署完成時間**: 2026-03-14 22:39 UTC
**版本**: v2.29.0
**狀態**: ✅ 已成功部署

---

## 🎯 快速測試步驟

### 第一步：存取應用程式

開啟瀏覽器前往：**https://monitor.ko.unieai.com**

**預期結果**：
- ✅ 自動重定向到 `/login` 登入頁面
- ✅ 顯示「Sign in with Google」按鈕
- ✅ 頁面樣式美觀，載入正常

---

### 第二步：測試 Google 登入

點擊「**Sign in with Google**」按鈕

**預期結果**：
- ✅ 跳轉到 Google OAuth 同意畫面
- ✅ 顯示正確的應用程式名稱
- ✅ 請求存取個人資料和電子郵件的權限

---

### 第三步：使用授權信箱登入

使用 **cuppot123@gmail.com** 完成 Google 授權

**預期結果**：
- ✅ 授權成功後自動跳轉回 `/login`
- ✅ 短暫顯示載入狀態
- ✅ 自動重定向到 `/chat` 聊天介面
- ✅ 導航列右側顯示「Logout」按鈕（桌面版）或 🚪 圖示（手機版）
- ✅ 可以正常使用所有功能

---

### 第四步：測試信箱白名單限制

使用**其他 Google 帳號**（非 cuppot123@gmail.com）登入

**預期結果**：
- ✅ 顯示錯誤訊息：「Email xxx@xxx.com is not allowed. Contact your administrator.」
- ✅ 無法進入系統
- ✅ 停留在登入頁面

---

### 第五步：測試 Session Drawer（桌面版）

在桌面瀏覽器中測試左側 Session Drawer

**預期結果**：
- ✅ 預設顯示完整的 Session 列表
- ✅ 點擊底部「**«**」按鈕，Drawer 收合成窄條
- ✅ 收合狀態下只顯示：
  - 彩色圓點（🔵 Sonnet / 🟣 Opus / 🟢 Haiku）
  - 訊息數量（小字）
- ✅ 點擊「**»**」按鈕，Drawer 展開回完整模式
- ✅ 重新整理頁面後，狀態保持（收合/展開）

---

### 第六步：測試 Cmd+K 快捷鍵修復

在訊息輸入框中測試 Cmd+K（Mac）或 Ctrl+K（Windows/Linux）

**測試步驟**：
1. 在訊息輸入框中輸入一些文字（例如：「test」）
2. 按下 Cmd+K（或 Ctrl+K）

**預期結果**：
- ✅ Command Palette 正常開啟
- ✅ **即使輸入框有文字也能開啟**（這是修復的重點）
- ✅ 可以看到所有可用的技能列表

---

### 第七步：測試 Plugin Skills 顯示

開啟 Command Palette（Cmd+K 或 Ctrl+K）

**預期結果**：
- ✅ 技能列表中顯示：
  - `/pua:pua` - Push harder when stuck on errors
  - `/pua:pua-debugging` - Exhaustive debugging methodology
- ✅ 這兩個 Plugin Skills 在列表中**永久可見**（不需要 SSH 偵測）

---

### 第八步：測試登出功能

點擊右上角的「**Logout**」按鈕

**預期結果**：
- ✅ 立即重定向到 `/login` 登入頁面
- ✅ localStorage 中的 `auth_token` 被清除
- ✅ 嘗試存取 `/chat` 會被自動重定向到 `/login`

---

### 第九步：測試 Token 持久性

成功登入後，重新整理頁面（F5 或 Cmd+R）

**預期結果**：
- ✅ **不需要重新登入**
- ✅ 直接顯示 `/chat` 介面
- ✅ Token 在 localStorage 中保持 7 天有效期

---

### 第十步：測試手機版（可選）

在手機瀏覽器中開啟 https://monitor.ko.unieai.com

**預期結果**：
- ✅ 登入流程正常
- ✅ Session Drawer 變成側邊滑動式選單
- ✅ 點擊漢堡選單（☰）開啟 Drawer
- ✅ 點擊外部區域關閉 Drawer
- ✅ Logout 按鈕顯示為 🚪 圖示

---

## 🐛 如果遇到問題

### 問題 1：無法取得 Google 登入 URL

**症狀**：點擊「Sign in with Google」後顯示錯誤

**解決方式**：
```bash
# 檢查 Pod 狀態
sudo kubectl get pods -n deployer-dev -l app=system-monitor

# 檢查環境變數
sudo kubectl exec -n deployer-dev <pod-name> -- env | grep GOOGLE

# 檢查 Secret
sudo kubectl get secret system-monitor-auth -n deployer-dev

# 查看應用程式日誌
sudo kubectl logs -f -l app=system-monitor -n deployer-dev
```

---

### 問題 2：登入後仍然重定向到 /login

**症狀**：完成 Google 授權後，無法進入 `/chat`

**可能原因**：
- JWT Secret 不一致
- Token 驗證失敗

**解決方式**：
```bash
# 清除瀏覽器 localStorage
# 開啟瀏覽器 Console（F12）執行：
localStorage.clear()

# 重新登入
```

---

### 問題 3：Session Drawer 無法收合

**症狀**：點擊「«」按鈕沒有反應

**解決方式**：
- 清除瀏覽器快取
- 確認在**桌面瀏覽器**中測試（手機版沒有收合功能）
- 檢查 localStorage 是否可用

---

### 問題 4：Cmd+K 仍然無法開啟

**症狀**：輸入框有文字時，Cmd+K 沒有反應

**解決方式**：
- 確認使用的是 **Cmd+K**（Mac）或 **Ctrl+K**（Windows/Linux）
- 清除瀏覽器快取，強制重新載入（Cmd+Shift+R 或 Ctrl+Shift+R）
- 檢查是否有其他瀏覽器擴充功能攔截了快捷鍵

---

## ✅ 測試檢查清單

完成以下檢查項目：

- [ ] 訪問 https://monitor.ko.unieai.com 自動重定向到 /login
- [ ] 使用 cuppot123@gmail.com 成功登入
- [ ] 使用其他信箱登入被拒絕（顯示錯誤訊息）
- [ ] 登入後可以存取 /chat
- [ ] Session Drawer 可以收合/展開（桌面版）
- [ ] Cmd+K 在輸入框有文字時也能開啟 Command Palette
- [ ] Plugin Skills（pua:pua, pua:pua-debugging）顯示在列表中
- [ ] Logout 按鈕正常運作
- [ ] Token 在頁面重新整理後仍然有效（自動登入）
- [ ] 手機版 Drawer 滑動選單正常（可選）

---

## 📊 技術驗證

### 驗證 OAuth 端點

```bash
# 測試 OAuth URL 生成
curl -s https://monitor.ko.unieai.com/api/auth/google/url | jq .

# 預期輸出：
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=https%3A%2F%2Fmonitor.ko.unieai.com%2Flogin&client_id=<YOUR_CLIENT_ID>&access_type=offline&response_type=code&prompt=consent&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email"
}
```

### 驗證健康檢查

```bash
# 測試健康端點
curl -s https://monitor.ko.unieai.com/health

# 預期輸出：
{ "status": "OK", "timestamp": "..." }
```

---

## 📞 需要協助？

如果測試過程中遇到任何問題，請提供：

1. **錯誤截圖**
2. **瀏覽器 Console 錯誤訊息**（F12 開啟開發者工具）
3. **使用的信箱**（確認是否為白名單）
4. **瀏覽器類型和版本**

---

**祝測試順利！** 🎉
