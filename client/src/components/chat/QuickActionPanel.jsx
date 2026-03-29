import React from 'react';

const QUICK_ACTIONS = [
  {
    id: 'analyze',
    icon: '\uD83D\uDCCA',
    label: '磁碟分析',
    prompt: '請掃描整個磁碟，分析使用狀況。執行 `df -h /` 和 `du -sh /* 2>/dev/null | sort -rh | head -20`，然後給出清理建議。'
  },
  {
    id: 'docker',
    icon: '\uD83D\uDC33',
    label: 'Docker 清理',
    prompt: '請分析並清理 Docker 資源。先執行 `docker system df` 查看使用量，然後清理停止的 containers、dangling images 和 build cache。清理前後各執行一次 `df -h /` 對比。'
  },
  {
    id: 'logs',
    icon: '\uD83D\uDCDD',
    label: 'Log 清理',
    prompt: '請清理系統日誌。執行 `journalctl --disk-usage` 查看大小，然後 `sudo journalctl --vacuum-size=50M`。也檢查 `/var/log/` 下的 rotated logs。清理前後對比磁碟使用。'
  },
  {
    id: 'cache',
    icon: '\uD83D\uDCE6',
    label: 'Cache 清理',
    prompt: '請清理開發工具快取。檢查並清理：npm cache (`~/.npm/_cacache`)、pip cache、apt cache (`sudo apt-get clean`)、playwright 和 puppeteer cache。清理前後對比。'
  },
  {
    id: 'temp',
    icon: '\uD83D\uDDD1\uFE0F',
    label: 'Temp 清理',
    prompt: '請清理暫存檔案。清理 `/tmp` 目錄中 3 天以上的檔案，以及 core dumps。清理前後對比磁碟使用。'
  },
  {
    id: 'bigfiles',
    icon: '\uD83D\uDD0D',
    label: '大檔案搜尋',
    prompt: '請搜尋大於 100MB 的檔案：`find / -xdev -size +100M -type f 2>/dev/null | head -30`，列出每個檔案的大小和路徑，標記哪些可以安全刪除。'
  }
];

function QuickActionPanel({ onAction, disabled }) {
  return (
    <div className="border-t border-slate-700/50 bg-slate-800/50 px-2 py-2 sm:px-4 sm:py-2.5">
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-0.5 sm:flex-wrap sm:overflow-x-visible">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => onAction(action.prompt)}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2 rounded-full bg-slate-700/60 hover:bg-slate-600/80 active:bg-slate-600 border border-slate-600/50 hover:border-slate-500/70 text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 disabled:opacity-40 disabled:pointer-events-none"
            style={{ minHeight: '36px' }}
          >
            <span className="text-sm sm:text-base">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default QuickActionPanel;
