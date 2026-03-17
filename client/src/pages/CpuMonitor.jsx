import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import FullscreenChart from '../components/FullscreenChart.jsx';

const API_BASE = '/api';

function formatBytes(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatRuntime(startTime) {
  if (!startTime) return 'N/A';
  const now = new Date();
  const start = new Date(startTime);
  const diff = Math.floor((now - start) / 1000);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ProgressBar({ value, max = 100, color = 'blue' }) {
  const percent = Math.min((value / max) * 100, 100);
  const colorClass = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  }[color] || 'bg-blue-500';

  return (
    <div className="progress-bar">
      <div className={`progress-fill ${colorClass}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    running: 'bg-green-500/20 text-green-400',
    stopped: 'bg-red-500/20 text-red-400',
    warning: 'bg-yellow-500/20 text-yellow-400'
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.running}`}>
      {status}
    </span>
  );
}

function CpuCard({ data }) {
  const getStatusColor = (pressure) => {
    if (pressure > 70) return 'critical';
    if (pressure > 50) return 'warning';
    return 'good';
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">CPU Usage</h2>
        <span className="text-slate-400 text-sm">{data.cores} cores</span>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div className="flex-1">
          <div className={`metric-value status-${getStatusColor(data.pressure)}`}>
            {data.usage?.toFixed(1) || 0}%
          </div>
          <div className="metric-label">Current Usage</div>
        </div>
        <div className="w-16 h-16 sm:w-24 sm:h-24 relative">
          <svg className="w-full h-full -rotate-90">
            <circle cx="48" cy="48" r="40" fill="none" stroke="#334155" strokeWidth="8" />
            <circle
              cx="48" cy="48" r="40" fill="none"
              className={`stroke-current status-${getStatusColor(data.pressure)}`}
              strokeWidth="8"
              strokeDasharray={`${(data.usage / 100) * 251.2} 251.2`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm sm:text-xl font-bold">{data.usage?.toFixed(0) || 0}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
        <div>
          <span className="text-slate-400">Load:</span>
          <span className="ml-1 sm:ml-2 font-medium">{data.load?.join(' / ') || 'N/A'}</span>
        </div>
        <div>
          <span className="text-slate-400">Pressure:</span>
          <span className={`ml-1 sm:ml-2 font-medium status-${getStatusColor(data.pressure)}`}>
            {data.pressure?.toFixed(1) || 0}%
          </span>
        </div>
      </div>
    </div>
  );
}

function ClaudeBuddyCard({ data, onCleanup }) {
  const [isCleaningBuddy, setIsCleaningBuddy] = useState(false);
  const [showCleanupResult, setShowCleanupResult] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);

  const handleCleanup = async () => {
    if (!confirm('⚠️ 確定要清理所有運行超過 1 天的 claude-code-buddy 進程嗎？\n\n這將終止舊的 MCP server 進程。')) {
      return;
    }

    setIsCleaningBuddy(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout
      const res = await fetch(`${API_BASE}/processes/claude-buddy/cleanup`, {
        method: 'POST',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.startsWith('{') ? JSON.parse(text).error : `Server error (${res.status})`);
      }
      const result = await res.json();

      if (result.success) {
        setCleanupResult(result);
        setShowCleanupResult(true);
        onCleanup(); // Trigger metrics refresh
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
      const msg = error.name === 'AbortError' ? '請求超時，清理可能仍在後台執行中' : error.message;
      alert('清理失敗：' + msg);
    } finally {
      setIsCleaningBuddy(false);
    }
  };

  const getStatusColor = () => {
    if (!data || !data.summary) return 'good';
    const { total, old } = data.summary;
    if (old > 50 || total > 100) return 'critical';
    if (old > 20 || total > 50) return 'warning';
    return 'good';
  };

  const statusColor = getStatusColor();

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-lg font-semibold">Buddy 進程</h2>
          <button
            onClick={handleCleanup}
            disabled={isCleaningBuddy || !data?.summary?.old}
            className="px-2.5 sm:px-3 py-1.5 sm:py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            {isCleaningBuddy ? '清理中...' : '🧹 清理'}
          </button>
        </div>

        {data && data.summary ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className={`metric-value status-${statusColor}`}>
                  {data.summary.total}
                </div>
                <div className="metric-label">總進程數</div>
              </div>
              <div>
                <div className={`metric-value ${data.summary.old > 0 ? 'status-warning' : 'status-good'}`}>
                  {data.summary.old}
                </div>
                <div className="metric-label">舊進程（&gt;1天）</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">總記憶體：</span>
                <span className={`ml-2 font-medium status-${statusColor}`}>
                  {data.summary.totalMemoryMB} MB
                </span>
              </div>
              <div>
                <span className="text-slate-400">平均/進程：</span>
                <span className="ml-2 font-medium">{data.summary.avgMemoryMB} MB</span>
              </div>
            </div>

            {data.summary.old > 0 && (
              <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-400 text-xs">
                ⚠️ 發現 {data.summary.old} 個運行超過 1 天的舊進程，建議清理
              </div>
            )}
          </>
        ) : (
          <div className="text-slate-400 text-sm">載入中...</div>
        )}
      </div>

      {/* Cleanup Result Modal */}
      {showCleanupResult && cleanupResult && (
        <div className="modal-overlay" onClick={() => setShowCleanupResult(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">🧹 Claude-Code-Buddy 清理完成</h2>

            <div className="bg-green-500/20 border border-green-500/30 rounded p-3 mb-4">
              <div className="text-green-400 font-semibold text-lg">
                ✓ 已清理 {cleanupResult.processesKilled} 個進程
              </div>
              <div className="text-green-400 text-sm mt-1">
                釋放記憶體：{cleanupResult.memoryFreed}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">清理前進程數：</span>
                <span className="font-medium">{cleanupResult.before.count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">清理後進程數：</span>
                <span className="font-medium">{cleanupResult.after.count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">清理前記憶體：</span>
                <span className="font-medium">{cleanupResult.before.memory} MB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">清理後記憶體：</span>
                <span className="font-medium">{cleanupResult.after.memory} MB</span>
              </div>
            </div>

            <button
              onClick={() => setShowCleanupResult(false)}
              className="mt-6 w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CpuHistoryChart({ data, warningThreshold, killThreshold }) {
  if (!data || data.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">CPU Usage History</h2>
        <p className="text-slate-400 text-center py-8 text-sm">Collecting data...</p>
      </div>
    );
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="time"
          stroke="#94a3b8"
          style={{ fontSize: '11px' }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#94a3b8"
          style={{ fontSize: '11px' }}
          domain={[0, 100]}
          width={35}
          tickFormatter={v => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '6px',
            fontSize: '12px'
          }}
          labelStyle={{ color: '#cbd5e1' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '11px' }}
          iconType="line"
        />
        <ReferenceLine
          y={warningThreshold}
          stroke="#eab308"
          strokeDasharray="3 3"
          label={{ value: `Warn ${warningThreshold}%`, position: 'right', fill: '#eab308', fontSize: 9 }}
        />
        <ReferenceLine
          y={killThreshold}
          stroke="#ef4444"
          strokeDasharray="3 3"
          label={{ value: `Crit ${killThreshold}%`, position: 'right', fill: '#ef4444', fontSize: 9 }}
        />
        <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} name="CPU %" />
        <Line type="monotone" dataKey="pressure" stroke="#10b981" strokeWidth={2} dot={{ r: 1.5 }} name="Pressure %" />
        <Line type="monotone" dataKey="load1" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="Load (1m)" />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="card">
      <h2 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-4">CPU History (10 min)</h2>
      <FullscreenChart title="CPU History (10 min)" height="h-40 sm:h-56">
        {chartContent}
      </FullscreenChart>
    </div>
  );
}

function MemoryCard({ data }) {
  const usedPercent = data.total ? ((data.used / data.total) * 100) : 0;
  const getColor = (percent) => {
    if (percent > 90) return 'red';
    if (percent > 75) return 'yellow';
    return 'green';
  };

  return (
    <div className="card">
      <h2 className="text-sm sm:text-lg font-semibold mb-3 sm:mb-4">Memory</h2>

      <div className="mb-3 sm:mb-4">
        <div className="flex justify-between mb-1 text-xs sm:text-sm">
          <span className="text-slate-400">Used</span>
          <span className="font-medium">{formatBytes(data.used)} / {formatBytes(data.total)}</span>
        </div>
        <ProgressBar value={usedPercent} color={getColor(usedPercent)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
        <div>
          <span className="text-slate-400">Available:</span>
          <span className="ml-1 sm:ml-2 font-medium text-green-400">{formatBytes(data.available)}</span>
        </div>
        <div>
          <span className="text-slate-400">Swap:</span>
          {data.swap?.total > 0 ? (
            <span className="ml-1 sm:ml-2 font-medium">
              {formatBytes(data.swap.used)} / {formatBytes(data.swap.total)}
            </span>
          ) : (
            <span className="ml-1 sm:ml-2 font-medium text-yellow-400">None</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DiskCard({ data, onCleanup }) {
  const [cleaning, setCleaning] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);

  const getColor = (percent) => {
    if (percent > 90) return 'red';
    if (percent > 80) return 'yellow';
    return 'blue';
  };

  const handleCleanup = async () => {
    if (!confirm('確定要執行磁碟清理嗎？\n\n將清理：\n• Docker 未使用的映像和快取\n• 瀏覽器快取 (Puppeteer/Playwright)\n• 系統日誌\n• APT 快取\n• 舊的暫存檔案')) {
      return;
    }

    setCleaning(true);
    setCleanupResult(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 360000); // 6 min timeout (docker prune is slow)
      const response = await fetch(`${API_BASE}/disk/cleanup`, { method: 'POST', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text.startsWith('{') ? JSON.parse(text).error : `Server error (${response.status})`);
      }
      const result = await response.json();
      setCleanupResult(result);
      setShowCleanupModal(true);
      // Trigger metrics refresh
      if (onCleanup) onCleanup();
    } catch (err) {
      const msg = err.name === 'AbortError' ? '請求超時，清理可能仍在後台執行中' : err.message;
      alert('清理失敗：' + msg);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-lg font-semibold">Disk Usage</h2>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className={`text-xs px-2.5 sm:px-3 py-1.5 sm:py-1 rounded flex items-center gap-1 font-medium transition-colors ${
              cleaning
                ? 'bg-slate-600 cursor-wait'
                : 'bg-orange-600 hover:bg-orange-500'
            } text-white`}
            title="一鍵清理磁碟空間"
          >
            {cleaning ? (
              <>
                <span className="animate-spin">🔄</span>
                <span>清理中...</span>
              </>
            ) : (
              <>
                <span>🧹</span>
                <span>清理</span>
              </>
            )}
          </button>
        </div>

        <div className="mb-3 sm:mb-4">
          <div className="flex justify-between mb-1 text-xs sm:text-sm">
            <span className="text-slate-400">/dev/root</span>
            <span className="font-medium">{data.percent || 0}%</span>
          </div>
          <ProgressBar value={data.percent || 0} color={getColor(data.percent)} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
          <div>
            <span className="text-slate-400">Used:</span>
            <span className="ml-1 sm:ml-2 font-medium">{formatBytes(data.used)}</span>
          </div>
          <div>
            <span className="text-slate-400">Avail:</span>
            <span className="ml-1 sm:ml-2 font-medium text-green-400">{formatBytes(data.available)}</span>
          </div>
        </div>
      </div>

      {/* Cleanup Result Modal */}
      {showCleanupModal && cleanupResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCleanupModal(false)}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span>🧹</span> 磁碟清理完成
            </h2>

            <div className="mb-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded p-3 mb-4">
                <p className="text-green-400 font-semibold text-lg">
                  預估釋放空間：{cleanupResult.totalFreedEstimate}
                </p>
              </div>

              <div className="space-y-2">
                {cleanupResult.results.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-slate-700/30 rounded p-2">
                    <span className="text-slate-300">
                      {item.task === 'Old claude-code-buddy processes' && '🤖 '}
                      {item.task}
                    </span>
                    {item.success ? (
                      <span className="text-green-400">✓ {item.freed}</span>
                    ) : (
                      <span className="text-red-400">✗ {item.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {cleanupResult.disk && (
              <div className="border-t border-slate-700 pt-4 mb-4">
                <p className="text-sm text-slate-400 mb-2">清理後磁碟狀態：</p>
                <div className="flex justify-between text-sm">
                  <span>使用率：<span className="text-blue-400 font-medium">{cleanupResult.disk.percent}%</span></span>
                  <span>可用：<span className="text-green-400 font-medium">{formatBytes(cleanupResult.disk.available)}</span></span>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowCleanupModal(false)}
              className="w-full btn btn-primary"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Combined OOM controls - handles both Score and Adj with instant updates
function OomControls({ pid, currentAdj, currentScore, onAdjust, children }) {
  const [localAdj, setLocalAdj] = useState(currentAdj);
  const [localScore, setLocalScore] = useState(currentScore);
  const [loading, setLoading] = useState(false);

  // Sync with parent when values change (from server refresh)
  useEffect(() => {
    setLocalAdj(currentAdj);
  }, [currentAdj]);

  useEffect(() => {
    setLocalScore(currentScore);
  }, [currentScore]);

  const handleAdjust = async (delta) => {
    if (loading) return;
    setLoading(true);

    // Optimistic update - show new adj value immediately
    const newValue = Math.max(-1000, Math.min(1000, localAdj + delta));
    setLocalAdj(newValue);

    try {
      const response = await fetch(`${API_BASE}/processes/${pid}/oom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to adjust OOM');
      }
      // Get response with new OOM Score
      const result = await response.json();
      // Update both local values from API response
      if (result.newAdj !== undefined) {
        setLocalAdj(result.newAdj);
      }
      if (result.newScore !== undefined) {
        setLocalScore(result.newScore);
      }
      // Background refresh to sync other data
      onAdjust && onAdjust();
    } catch (err) {
      // Revert on error
      setLocalAdj(currentAdj);
      setLocalScore(currentScore);
      alert('Failed to adjust OOM: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevel = (s) => {
    if (s < 200) return { text: 'Low', color: 'text-green-400 bg-green-500/20' };
    if (s < 400) return { text: 'Med', color: 'text-yellow-400 bg-yellow-500/20' };
    if (s < 600) return { text: 'High', color: 'text-orange-400 bg-orange-500/20' };
    return { text: 'Crit', color: 'text-red-400 bg-red-500/20' };
  };

  const risk = getRiskLevel(localScore);

  // Render children with the OOM data passed as render props
  return children({ localAdj, localScore, loading, handleAdjust, risk });
}

function OomScoreBadge({ score, risk }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-sm">{score}</span>
      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${risk.color}`}>
        {risk.text}
      </span>
    </div>
  );
}

function OomAdjustButton({ localAdj, loading, handleAdjust }) {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <button
        onClick={() => handleAdjust(-100)}
        disabled={loading}
        className={`w-6 h-6 btn-inline ${loading ? 'bg-slate-600 cursor-wait' : 'bg-red-600 hover:bg-red-500'} text-white rounded text-xs font-bold`}
        title="Decrease OOM Adj (more protection)"
      >
        −
      </button>
      <span className={`w-10 sm:w-14 text-center font-mono text-[11px] sm:text-xs ${
        localAdj < 0 ? 'text-green-400' : localAdj > 0 ? 'text-red-400' : 'text-slate-400'
      }`}>
        {localAdj}
      </span>
      <button
        onClick={() => handleAdjust(100)}
        disabled={loading}
        className={`w-6 h-6 btn-inline ${loading ? 'bg-slate-600 cursor-wait' : 'bg-green-600 hover:bg-green-500'} text-white rounded text-xs font-bold`}
        title="Increase OOM Adj (less protection)"
      >
        +
      </button>
    </div>
  );
}

function formatUptime(startTime) {
  if (!startTime || startTime === 0) return 'N/A';
  const now = Math.floor(Date.now() / 1000);
  const uptime = now - startTime;
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${uptime}s`;
}

function formatMemory(kb) {
  if (!kb || kb === 0) return '0 KB';
  if (kb > 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb > 1024) return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb} KB`;
}

function ProcessTable({ processes, onKill, onRefresh, warningThreshold, killThreshold }) {
  if (!processes?.claude?.length) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Claude Processes</h2>
        <p className="text-slate-400 text-center py-4">No Claude processes running</p>
      </div>
    );
  }

  const overWarning = processes.claude.filter(p => p.cpu >= warningThreshold && p.cpu < killThreshold);
  const overKill = processes.claude.filter(p => p.cpu >= killThreshold);
  const running = processes.claude.filter(p => p.state === 'running' || p.cpu > 0).length;
  const idle = processes.claude.filter(p => p.state === 'idle' || p.cpu === 0).length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-sm sm:text-lg font-semibold">Claude Processes</h2>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
          {overKill.length > 0 && (
            <span className="bg-red-500/20 text-red-400 px-1.5 sm:px-2 py-0.5 rounded text-[11px] sm:text-sm font-medium animate-pulse">
              {overKill.length} crit
            </span>
          )}
          {overWarning.length > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 px-1.5 sm:px-2 py-0.5 rounded text-[11px] sm:text-sm font-medium">
              {overWarning.length} warn
            </span>
          )}
          <span className="bg-blue-500/20 text-blue-400 px-1.5 sm:px-2 py-0.5 rounded text-[11px] sm:text-sm">
            {processes.count}
          </span>
        </div>
      </div>

      <div className="table-container overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>PID</th>
              <th className="hidden sm:table-cell">State</th>
              <th>CPU%</th>
              <th>Mem%</th>
              <th className="hidden md:table-cell">RSS</th>
              <th className="hidden sm:table-cell">Uptime</th>
              <th className="hidden lg:table-cell">OOM Score</th>
              <th className="hidden lg:table-cell">OOM Adj</th>
              <th className="hidden md:table-cell">Mode</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {processes.claude.map((proc) => {
              const isWarning = proc.cpu >= warningThreshold && proc.cpu < killThreshold;
              const isCritical = proc.cpu >= killThreshold;
              const rowClass = isCritical ? 'bg-red-500/10' : isWarning ? 'bg-yellow-500/5' : '';
              const cpuClass = isCritical ? 'text-red-400 font-bold' : isWarning ? 'text-yellow-400 font-semibold' : '';
              const isActive = proc.state === 'running' || proc.cpu > 0;

              return (
                <tr key={proc.pid} className={rowClass}>
                  <td className="font-mono text-[11px] sm:text-xs">{proc.pid}</td>
                  <td className="hidden sm:table-cell">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium btn-inline ${
                      isActive
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {isActive ? '▶️' : '⏸️'}
                    </span>
                  </td>
                  <td className={`text-xs sm:text-sm ${cpuClass}`}>
                    {proc.cpu?.toFixed(1)}%
                    {isCritical && <span className="ml-0.5 sm:ml-1">🔴</span>}
                  </td>
                  <td className="text-xs sm:text-sm">{proc.mem?.toFixed(1)}%</td>
                  <td className="hidden md:table-cell text-xs text-slate-400">
                    {formatMemory(proc.rss)}
                  </td>
                  <td className="hidden sm:table-cell text-xs text-slate-400">
                    {formatUptime(proc.startTime)}
                  </td>
                  <OomControls
                    pid={proc.pid}
                    currentAdj={proc.oomAdj || 0}
                    currentScore={proc.oomScore || 0}
                    onAdjust={onRefresh}
                  >
                    {({ localScore, localAdj, loading, handleAdjust, risk }) => (
                      <>
                        <td className="hidden lg:table-cell">
                          <OomScoreBadge score={localScore} risk={risk} />
                        </td>
                        <td className="hidden lg:table-cell">
                          <OomAdjustButton localAdj={localAdj} loading={loading} handleAdjust={handleAdjust} />
                        </td>
                      </>
                    )}
                  </OomControls>
                  <td className="hidden md:table-cell">
                    <span className={`px-2 py-0.5 rounded text-xs btn-inline ${
                      proc.mode === 'plan' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-600 text-slate-300'
                    }`}>
                      {proc.mode}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => onKill(proc.pid)}
                      className={`${isCritical ? 'btn-danger animate-pulse' : 'btn-danger'} text-[11px] sm:text-xs px-2 py-1.5 sm:py-1 rounded font-medium transition-colors`}
                      title={isCritical ? `CPU ≥ ${killThreshold}% - Recommended to kill` : isWarning ? `CPU ≥ ${warningThreshold}% - Email alert sent` : ''}
                    >
                      Kill
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DockerTable({ containers }) {
  const parseContainers = (data) => {
    if (!data || !Array.isArray(data)) return [];
    return data.map(c => ({
      ...c,
      name: c.name?.replace(/^k8s_/, '').split('_')[0] || c.name,
      cpuNum: parseFloat(c.cpu?.replace('%', '') || 0),
      memStr: c.mem?.split('/')[0]?.trim() || 'N/A'
    })).slice(0, 10);
  };

  const displayContainers = parseContainers(containers);

  if (!displayContainers.length) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Docker Containers</h2>
        <p className="text-slate-400 text-center py-4">No containers running</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-sm sm:text-lg font-semibold">Docker Containers</h2>
        <span className="text-slate-400 text-xs sm:text-sm">{containers?.length || 0} running</span>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>CPU%</th>
              <th>Memory</th>
            </tr>
          </thead>
          <tbody>
            {displayContainers.map((container, i) => (
              <tr key={i}>
                <td className="font-medium">{container.name}</td>
                <td><StatusBadge status={container.status} /></td>
                <td>{container.cpuNum.toFixed(2)}%</td>
                <td>{container.memStr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WarningsCard({ warnings }) {
  if (!warnings?.length) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="text-green-400">&#10003;</span> System Status
        </h2>
        <p className="text-green-400">All systems normal</p>
      </div>
    );
  }

  return (
    <div className="card border-yellow-500/30">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span className="text-yellow-400">&#9888;</span> Warnings
      </h2>
      <ul className="space-y-2">
        {warnings.map((warning, i) => (
          <li key={i} className="text-yellow-400 text-sm flex items-start gap-2">
            <span className="mt-1">&#8226;</span>
            <span>{warning}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CpuMonitor() {
  const [metrics, setMetrics] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [warningThreshold, setWarningThreshold] = useState(80);
  const [killThreshold, setKillThreshold] = useState(95);
  const [alertEmail, setAlertEmail] = useState('');
  const [autoKillEnabled, setAutoKillEnabled] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [tempWarning, setTempWarning] = useState(80);
  const [tempKill, setTempKill] = useState(95);
  const [tempEmail, setTempEmail] = useState('');
  const [tempAutoKill, setTempAutoKill] = useState(false);
  const [cpuHistory, setCpuHistory] = useState([]); // Store last 20 data points
  const [claudeBuddyStats, setClaudeBuddyStats] = useState(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/metrics`);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      setMetrics(data);

      // Update CPU history for chart (keep last 20 points)
      const now = new Date();
      setCpuHistory(prev => {
        const newPoint = {
          time: now.toLocaleTimeString(),
          cpu: data.cpu?.usage || 0,
          load1: data.cpu?.load?.[0] || 0,
          pressure: data.cpu?.pressure || 0
        };
        const updated = [...prev, newPoint];
        return updated.slice(-20); // Keep last 20 points (10 minutes at 30s interval)
      });

      setLastUpdate(now);
      setError(null);
      setCountdown(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleKill = async (pid) => {
    if (!confirm(`Are you sure you want to kill process ${pid}?`)) return;

    try {
      const response = await fetch(`${API_BASE}/processes/${pid}/kill`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to kill process');
      fetchMetrics();
    } catch (err) {
      alert('Failed to kill process: ' + err.message);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/refresh`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh');
      const data = await response.json();
      setMetrics(data);
      setLastUpdate(new Date());
      setCountdown(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/config`);
      if (!response.ok) throw new Error('Failed to fetch config');
      const data = await response.json();
      setWarningThreshold(data.warningThreshold);
      setKillThreshold(data.killThreshold);
      setAlertEmail(data.alertEmail);
      setAutoKillEnabled(data.autoKillEnabled || false);
      setTempWarning(data.warningThreshold);
      setTempKill(data.killThreshold);
      setTempEmail(data.alertEmail);
      setTempAutoKill(data.autoKillEnabled || false);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  }, []);

  const fetchClaudeBuddyStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/processes/claude-buddy/stats`);
      const data = await res.json();
      setClaudeBuddyStats(data);
    } catch (error) {
      console.error('Failed to fetch claude-buddy stats:', error);
    }
  }, []);

  const updateConfig = async () => {
    if (tempKill <= tempWarning) {
      alert('Kill threshold must be greater than warning threshold');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warningThreshold: tempWarning,
          killThreshold: tempKill,
          alertEmail: tempEmail,
          autoKillEnabled: tempAutoKill
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update config');
      }
      const data = await response.json();
      setWarningThreshold(data.warningThreshold);
      setKillThreshold(data.killThreshold);
      setAlertEmail(data.alertEmail);
      setAutoKillEnabled(data.autoKillEnabled);
      setShowConfigModal(false);
    } catch (err) {
      alert('Failed to update config: ' + err.message);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchConfig();
    fetchClaudeBuddyStats();

    const interval = setInterval(() => {
      fetchMetrics();
      fetchClaudeBuddyStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchMetrics, fetchConfig, fetchClaudeBuddyStats]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !metrics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading system metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="flex flex-col gap-3 mb-4 sm:mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
              <span>🖥️</span> System Monitor
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">monitor.ko.unieai.com</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-medium ${
              autoKillEnabled
                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                : 'bg-green-500/20 text-green-400 border border-green-500/50'
            }`}>
              {autoKillEnabled ? 'Auto-Kill' : 'Manual'}
            </div>
            <span className="text-slate-400 text-xs">{countdown}s</span>
          </div>
        </div>
        {error && <span className="text-red-400 text-xs sm:text-sm">{error}</span>}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowConfigModal(true)}
            className="btn bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2"
          >
            <span>⚙️</span>
            <span className="hidden sm:inline">
              ⚠️ {warningThreshold}% / 🔴 {killThreshold}%
            </span>
            <span className="sm:hidden">Settings</span>
          </button>
          <button onClick={handleRefresh} className="btn btn-primary text-xs sm:text-sm" disabled={loading}>
            {loading ? '...' : '↻ Refresh'}
          </button>
          {lastUpdate && (
            <span className="text-slate-500 text-[11px] sm:text-xs hidden sm:inline">
              Last: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {metrics && (
        <div className="grid gap-4 md:gap-6">
          {/* Top Row - System Metrics: 1 col mobile, 2 col sm, 3 col md */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
            <CpuCard data={metrics.cpu || {}} />
            <MemoryCard data={metrics.memory || {}} />
            <ClaudeBuddyCard
              data={claudeBuddyStats}
              onCleanup={() => {
                fetchMetrics();
                fetchClaudeBuddyStats();
              }}
            />
            <DiskCard data={metrics.disk || {}} onCleanup={fetchMetrics} />
          </div>

          {/* CPU History Chart */}
          <CpuHistoryChart
            data={cpuHistory}
            warningThreshold={warningThreshold}
            killThreshold={killThreshold}
          />

          {/* Middle Row - Processes and Containers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <ProcessTable
              processes={metrics.processes}
              onKill={handleKill}
              onRefresh={fetchMetrics}
              warningThreshold={warningThreshold}
              killThreshold={killThreshold}
            />
            <DockerTable containers={metrics.docker} />
          </div>

          {/* Bottom Row - Warnings */}
          <WarningsCard warnings={metrics.warnings} />

          {/* Watchdog Info */}
          {metrics.watchdog && (
            <div className="text-center text-slate-500 text-xs">
              Watchdog last check: {metrics.watchdog.lastCheck} |
              Cooldown: {metrics.watchdog.cooldown ? 'Active' : 'Inactive'}
            </div>
          )}
        </div>
      )}

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowConfigModal(false)}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">⚙️ CPU Monitoring Configuration</h2>
            <p className="text-slate-400 text-sm mb-6">
              Configure CPU thresholds and email alerts for Claude processes.
            </p>

            {/* Warning Threshold */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <span className="text-yellow-400">⚠️</span> Warning Threshold:
                <span className="text-yellow-400 font-bold">{tempWarning}%</span>
              </label>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={tempWarning}
                onChange={(e) => setTempWarning(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
              />
              <p className="text-xs text-slate-500 mt-1">Send email alert when CPU reaches this level</p>
            </div>

            {/* Kill Threshold */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <span className="text-red-400">🔴</span> Kill Threshold:
                <span className="text-red-400 font-bold">{tempKill}%</span>
              </label>
              <input
                type="range"
                min={tempWarning + 5}
                max="100"
                step="5"
                value={tempKill}
                onChange={(e) => setTempKill(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <p className="text-xs text-slate-500 mt-1">Recommend termination when CPU reaches this level</p>
            </div>

            {/* Alert Email */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                📧 Alert Email Addresses
              </label>
              <textarea
                value={tempEmail}
                onChange={(e) => setTempEmail(e.target.value)}
                placeholder="email1@example.com, email2@example.com&#10;or use semicolons: email1@example.com; email2@example.com"
                rows={3}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm focus:outline-none focus:border-blue-500 font-mono resize-none"
              />
              <div className="flex items-start gap-2 mt-2">
                <span className="text-blue-400 text-xs">ℹ️</span>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>• Use commas (,) or semicolons (;) to separate multiple email addresses</p>
                  <p>• Example: <span className="text-slate-400 font-mono">admin@company.com, dev@company.com</span></p>
                </div>
              </div>
            </div>

            {/* Auto-Kill Toggle */}
            <div className="mb-6 bg-slate-700/30 border border-slate-600 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium cursor-pointer" htmlFor="auto-kill-toggle">
                  Auto-Kill Claude Processes
                </label>
                <button
                  id="auto-kill-toggle"
                  onClick={() => setTempAutoKill(!tempAutoKill)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    tempAutoKill ? 'bg-red-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      tempAutoKill ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                {tempAutoKill ? (
                  <span className="text-red-400">Enabled: CPU Watchdog will automatically terminate overloaded processes</span>
                ) : (
                  <span className="text-green-400">Disabled: Manual control only - processes will not be auto-terminated</span>
                )}
              </p>
              <div className="mt-2 text-xs text-slate-500 space-y-1">
                <p>• When enabled, the system will automatically kill processes that exceed thresholds</p>
                <p>• Recommended: Keep disabled for manual control</p>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-slate-700/50 rounded p-4 mb-6 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-yellow-400">⚠️</span>
                <div>
                  <p className="font-medium text-yellow-400">Warning ({tempWarning}%):</p>
                  <p className="text-slate-400 text-xs">Email alert sent (max 1 per hour per process)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-400">🔴</span>
                <div>
                  <p className="font-medium text-red-400">Critical ({tempKill}%):</p>
                  <p className="text-slate-400 text-xs">Kill button pulses, process highlighted in red</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfigModal(false)}
                className="flex-1 btn bg-slate-700 hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={updateConfig}
                className="flex-1 btn btn-primary"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowManualModal(false)}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-4xl w-full border border-slate-700 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <span>📖</span> 系統監控使用手冊
              </h2>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 text-sm max-h-[70vh] overflow-y-auto pr-2">
              {/* Overview Section */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-blue-400">📊 系統概覽</h3>
                <p className="text-slate-300 mb-2">
                  本監控系統提供即時的系統資源監控，包含 CPU、記憶體、磁碟使用情況，以及 Claude 進程的詳細追蹤和 OOM 保護機制。
                </p>
              </section>

              {/* Claude Processes Section */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-green-400">🤖 Claude 進程說明</h3>
                <div className="bg-slate-700/50 rounded p-4 space-y-3">
                  <div>
                    <p className="font-medium text-yellow-400 mb-1">❓ 為什麼有多個 Claude 進程？</p>
                    <p className="text-slate-300">
                      Claude Code 會在背景啟動多個進程來處理不同的任務。這是正常現象：
                    </p>
                    <ul className="list-disc list-inside text-slate-400 mt-2 space-y-1 ml-4">
                      <li><span className="text-purple-400">plan 模式</span>：用於規劃和協調任務</li>
                      <li><span className="text-slate-400">default 模式</span>：用於執行具體任務</li>
                      <li>每個對話或任務可能會啟動獨立的進程</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-green-400 mb-1">✅ 進程狀態標示</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">▶️ Active</span>
                        <span className="text-slate-400 text-xs">進程正在運行</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-500/20 text-slate-400">⏸️ Idle</span>
                        <span className="text-slate-400 text-xs">進程閒置中</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* OOM Protection Section */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-orange-400">🛡️ OOM 保護機制</h3>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-slate-200 mb-2">什麼是 OOM Killer？</p>
                    <p className="text-slate-300">
                      當系統記憶體耗盡時，Linux 核心的 OOM (Out of Memory) Killer 會自動終止進程以釋放記憶體。
                      本系統已自動為所有 Claude 進程設定 <span className="text-green-400 font-mono">OOM Adj = -500</span>，
                      大幅降低被終止的風險。
                    </p>
                  </div>

                  <div className="bg-slate-700/50 rounded p-3">
                    <p className="font-medium text-yellow-400 mb-2">🎯 OOM Score 風險等級</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Low</span>
                        <span className="text-slate-400 text-xs">0-200（安全）</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">Med</span>
                        <span className="text-slate-400 text-xs">200-400（注意）</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">High</span>
                        <span className="text-slate-400 text-xs">400-600（警告）</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Crit</span>
                        <span className="text-slate-400 text-xs">600-1000（危險）</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="font-medium text-slate-200 mb-2">手動調整 OOM Adj</p>
                    <div className="flex items-center gap-2 mb-2">
                      <button className="w-6 h-6 bg-red-600 text-white rounded text-xs font-bold">−</button>
                      <span className="text-slate-300">降低 OOM Adj（增加保護，不易被終止）</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="w-6 h-6 bg-green-600 text-white rounded text-xs font-bold">+</button>
                      <span className="text-slate-300">提高 OOM Adj（減少保護，較易被終止）</span>
                    </div>
                    <p className="text-yellow-400 text-xs mt-2">
                      ⚠️ 通常不需要手動調整，系統已自動設定 -500 提供良好保護
                    </p>
                  </div>
                </div>
              </section>

              {/* Monitoring Metrics Section */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-purple-400">📈 監控指標說明</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="bg-slate-700/50 rounded p-3">
                    <p className="font-medium text-blue-400 mb-1">CPU%</p>
                    <p className="text-slate-400 text-xs">進程的 CPU 使用率百分比</p>
                  </div>
                  <div className="bg-slate-700/50 rounded p-3">
                    <p className="font-medium text-blue-400 mb-1">Memory</p>
                    <p className="text-slate-400 text-xs">進程佔用系統記憶體的百分比</p>
                  </div>
                  <div className="bg-slate-700/50 rounded p-3">
                    <p className="font-medium text-blue-400 mb-1">RSS</p>
                    <p className="text-slate-400 text-xs">實際物理記憶體使用量（MB/GB）</p>
                  </div>
                  <div className="bg-slate-700/50 rounded p-3">
                    <p className="font-medium text-blue-400 mb-1">Uptime</p>
                    <p className="text-slate-400 text-xs">進程運行時長（時 / 分）</p>
                  </div>
                  <div className="bg-slate-700/50 rounded p-3">
                    <p className="font-medium text-blue-400 mb-1">OOM Score</p>
                    <p className="text-slate-400 text-xs">被 OOM Killer 終止的風險評分（0-1000）</p>
                  </div>
                  <div className="bg-slate-700/50 rounded p-3">
                    <p className="font-medium text-blue-400 mb-1">OOM Adj</p>
                    <p className="text-slate-400 text-xs">手動調整值，負值 = 更多保護（-1000 to 1000）</p>
                  </div>
                </div>
              </section>

              {/* CPU Alert Configuration */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-red-400">⚠️ CPU 告警設定</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-slate-300 mb-2">
                      點擊右上角的 <span className="text-purple-400">⚙️ 設定</span> 按鈕可以配置：
                    </p>
                    <ul className="list-disc list-inside text-slate-400 space-y-1 ml-4">
                      <li><span className="text-yellow-400">Warning Threshold</span>：達到此 CPU% 時發送郵件告警</li>
                      <li><span className="text-red-400">Kill Threshold</span>：達到此 CPU% 時建議終止進程</li>
                      <li><span className="text-blue-400">Email</span>：告警郵件接收地址（支援多個，用逗號或分號分隔）</li>
                    </ul>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                    <p className="text-yellow-400 text-xs">
                      💡 <strong>提示</strong>：郵件告警每個進程每小時最多發送一次，且必須持續超過 2 秒才會觸發（避免瞬間峰值誤報）
                    </p>
                  </div>
                </div>
              </section>

              {/* Actions Section */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-red-400">🔧 操作說明</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <button className="btn btn-danger text-xs px-2 py-1 mt-0.5">Kill</button>
                    <div>
                      <p className="text-slate-300 font-medium">終止進程</p>
                      <p className="text-slate-400 text-xs">強制終止選定的 Claude 進程（需確認）</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <button className="btn btn-primary text-xs px-3 py-1 mt-0.5">↻ Refresh</button>
                    <div>
                      <p className="text-slate-300 font-medium">手動刷新</p>
                      <p className="text-slate-400 text-xs">立即更新所有監控數據（系統每 30 秒自動刷新）</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Quick Reference */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-cyan-400">⚡ 快速參考</h3>
                <div className="bg-slate-700/50 rounded p-4 space-y-2 text-xs font-mono">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400">自動刷新間隔：</span>
                      <span className="text-green-400">30 秒</span>
                    </div>
                    <div>
                      <span className="text-slate-400">CPU 歷史記錄：</span>
                      <span className="text-green-400">最近 20 筆（10 分鐘）</span>
                    </div>
                    <div>
                      <span className="text-slate-400">預設 OOM Adj：</span>
                      <span className="text-green-400">-500（自動保護）</span>
                    </div>
                    <div>
                      <span className="text-slate-400">告警冷卻時間：</span>
                      <span className="text-green-400">1 小時 / 進程</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Troubleshooting */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-yellow-400">🔍 常見問題</h3>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-slate-200">Q: 為什麼進程數量與我預期的不同？</p>
                    <p className="text-slate-400 text-xs">
                      A: Claude Code 會自動管理多個背景進程。系統只顯示實際的 Claude Code 進程，不包含輔助腳本（如 claude-oom-protector）。
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Q: OOM Adj 調整失敗怎麼辦？</p>
                    <p className="text-slate-400 text-xs">
                      A: 調整 OOM Adj 需要特殊權限。不過系統已透過 systemd 服務自動設定，通常不需要手動調整。
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Q: 如何避免 Claude 進程被終止？</p>
                    <p className="text-slate-400 text-xs">
                      A: 系統已自動配置 OOM 保護（OOM Adj = -500），將 Claude 進程的被終止風險降低約 80%。建議監控 OOM Score，保持在 400 以下。
                    </p>
                  </div>
                </div>
              </section>

              {/* Documentation Links */}
              <section className="border-t border-slate-700 pt-4">
                <h3 className="text-lg font-semibold mb-3 text-blue-400">📚 詳細文件</h3>
                <div className="grid md:grid-cols-2 gap-2 text-xs">
                  <a href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener noreferrer"
                     className="text-blue-400 hover:text-blue-300 underline">
                    → Claude Code 官方文件
                  </a>
                  <div className="text-slate-400">
                    → 系統文件路徑：/home/ubuntu/agent-skill/
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700 flex justify-end">
              <button
                onClick={() => setShowManualModal(false)}
                className="btn btn-primary px-6"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CpuMonitor;
