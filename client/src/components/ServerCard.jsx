import React, { useState } from 'react';

const API_BASE = '/api';

function StatusBadge({ status }) {
  const statusConfig = {
    healthy: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50', label: 'Connected' },
    degraded: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50', label: 'Unstable' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50', label: 'Offline' },
    unknown: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/50', label: 'Unknown' },
    no_sessions: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/50', label: 'No Sessions' }
  };

  const config = statusConfig[status] || statusConfig.unknown;

  return (
    <span className={`px-3 py-1 rounded text-sm font-medium border ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
}

function MetricValue({ label, value, unit = '', threshold }) {
  const getColor = (val) => {
    if (val === null || val === undefined || val === 'N/A') return 'text-slate-400';
    const numVal = parseFloat(val);
    if (threshold) {
      if (numVal > 80) return 'text-red-400';
      if (numVal > 60) return 'text-yellow-400';
      return 'text-green-400';
    }
    return 'text-slate-300';
  };

  const displayValue = value === null || value === undefined ? 'N/A' : value;

  return (
    <div className="flex flex-col">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`font-medium text-sm sm:text-base ${getColor(value)}`}>
        {displayValue}{unit}
      </span>
    </div>
  );
}

function SessionCard({ session, serverIp, index, onRecover }) {
  const [recovering, setRecovering] = useState(false);

  const handleRecover = async () => {
    if (!confirm(`Restart session ${session.tmuxSession}?`)) {
      return;
    }

    setRecovering(true);
    try {
      const response = await fetch(`${API_BASE}/claude-remote/recover/${serverIp}`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Recovery failed');

      const result = await response.json();
      alert(`Recovery ${result.success ? 'successful' : 'failed'}: ${result.message || ''}`);

      if (onRecover) onRecover();
    } catch (error) {
      alert('Recovery failed: ' + error.message);
    } finally {
      setRecovering(false);
    }
  };

  const formatUptime = (uptimeSeconds) => {
    if (!uptimeSeconds || uptimeSeconds <= 0) return 'N/A';
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const canRecover = session.status === 'failed' || session.status === 'degraded';

  return (
    <div className={`border-l-4 ${
      session.status === 'healthy' ? 'border-green-500' :
      session.status === 'degraded' ? 'border-yellow-500' :
      session.status === 'failed' ? 'border-red-500' :
      'border-gray-500'
    } bg-slate-800/50 p-2.5 sm:p-3 rounded-r`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-[11px] sm:text-xs font-mono text-slate-400 shrink-0">#{index + 1}</span>
          <span className="text-[11px] sm:text-xs font-mono text-purple-400 truncate">{session.tmuxSession}</span>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {session.sessionId && (
        <div className="text-[11px] sm:text-xs mb-2">
          <span className="text-slate-400">ID:</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(session.sessionId);
              alert('Session ID copied!');
            }}
            className="ml-1.5 font-mono text-blue-400 hover:text-blue-300 cursor-pointer truncate inline-block max-w-[180px] sm:max-w-none align-bottom btn-inline"
            title="Click to copy"
          >
            {session.sessionId}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] sm:text-xs mb-2">
        <span className="text-slate-400">PID: {session.pid}</span>
        <span className="text-green-400">Uptime: {formatUptime(session.uptime)}</span>
      </div>

      {session.error && (
        <div className="text-[11px] sm:text-xs text-yellow-400 bg-yellow-500/10 p-2 rounded mb-2">
          {session.error}
        </div>
      )}

      <button
        onClick={handleRecover}
        disabled={!canRecover || recovering}
        className={`w-full py-2.5 sm:py-1.5 rounded text-xs font-medium transition-colors ${
          canRecover && !recovering
            ? 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
        title={!canRecover ? 'Recovery only available when Offline or Unstable' : ''}
      >
        {recovering ? 'Recovering...' : 'Restart'}
      </button>
    </div>
  );
}

function ServerCard({ server, onRecover }) {
  const [actionLoading, setActionLoading] = useState(null);
  const sessions = server.claudeRemote?.sessions || [];
  const hasSessions = sessions.length > 0;

  const handleRestart = async () => {
    const hasActiveSessions = sessions.length > 0 && sessions.some(s => s.status === 'healthy');
    const confirmMessage = hasActiveSessions
      ? `重啟 ${server.alias} 的 Remote Control session？\n這會中斷現有連線並建立新的 session。`
      : `在 ${server.alias} 啟動新的 Remote Control session？`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setActionLoading('restart');
    try {
      const response = await fetch(`${API_BASE}/claude-remote/restart-session/${server.ip}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // SessionManager 會自動偵測以下參數，但我們可以明確指定
          // sessionName: 'claude-remote-83',
          // workingDir: '/home/ubuntu/agent-skill',
          forceKill: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Restart failed');
      }

      const result = await response.json();

      if (result.success) {
        const details = [
          `Session Name: ${result.sessionName || 'N/A'}`,
          result.sessionId ? `Session ID: ${result.sessionId}` : null,
          result.bridgeId ? `Bridge ID: ${result.bridgeId}` : null,
          result.claudePid ? `Claude PID: ${result.claudePid}` : null,
          result.status ? `Status: ${result.status}` : null
        ].filter(Boolean).join('\n');

        alert(`✅ Session ${hasActiveSessions ? '重啟' : '啟動'}成功！\n\n${details}`);

        // 自動刷新狀態
        if (onRecover) {
          setTimeout(() => onRecover(), 2000);
        }
      } else {
        alert(`❌ Session ${hasActiveSessions ? '重啟' : '啟動'}失敗：${result.error || '未知錯誤'}`);
      }
    } catch (error) {
      alert(`❌ ${hasActiveSessions ? '重啟' : '啟動'}失敗: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconnect = async () => {
    if (!confirm(`重新連線到 ${server.alias}？\n這會重新建立 SSH 連線。`)) {
      return;
    }

    setActionLoading('reconnect');
    try {
      const response = await fetch(`${API_BASE}/claude-remote/reconnect/${server.ip}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Reconnect failed');

      const result = await response.json();

      if (result.success && result.connected) {
        alert(`✅ 重新連線成功！\n\n找到 ${result.activeSessions.length} 個 tmux sessions:\n${result.activeSessions.join('\n')}`);
      } else {
        alert(`❌ 重新連線失敗：${result.error}`);
      }

      if (onRecover) onRecover();
    } catch (error) {
      alert('❌ 重新連線失敗: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-semibold flex items-center gap-1.5 sm:gap-2">
            <span>🖥️</span>
            <span className="truncate">{server.alias || server.hostname || server.ip}</span>
          </h3>
          <p className="text-slate-400 text-xs sm:text-sm truncate">{server.hostname || server.ip}</p>
        </div>
        <StatusBadge status={server.status} />
      </div>

      {/* System Metrics */}
      {server.system && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
          <MetricValue
            label="CPU"
            value={server.system.cpu}
            unit="%"
            threshold={true}
          />
          <MetricValue
            label="Memory"
            value={server.system.memory}
            unit="%"
            threshold={true}
          />
          <MetricValue
            label="Network"
            value={server.system.networkReachable ? '✓' : '✗'}
          />
        </div>
      )}

      {/* Sessions List */}
      {hasSessions ? (
        <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
          <div className="text-xs sm:text-sm text-slate-400 font-medium">
            Sessions ({sessions.length})
          </div>
          {sessions.map((session, index) => (
            <SessionCard
              key={`${session.tmuxSession}-${session.pid}`}
              session={session}
              serverIp={server.ip}
              index={index}
              onRecover={onRecover}
            />
          ))}
        </div>
      ) : (
        <div className="text-center text-slate-400 py-4 sm:py-6 bg-slate-800/30 rounded mb-3 sm:mb-4">
          <div className="text-xl sm:text-2xl mb-1.5 sm:mb-2">📭</div>
          <div className="text-xs sm:text-sm">No active sessions</div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-3 sm:mb-4">
        <button
          onClick={handleRestart}
          disabled={actionLoading !== null}
          className={`py-2.5 sm:py-2 px-2 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 sm:gap-2 ${
            actionLoading === 'restart'
              ? 'bg-blue-600 text-white cursor-wait'
              : actionLoading
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : hasSessions
              ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
              : 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white'
          }`}
          title={hasSessions
            ? "殺掉舊 session 並建立新的 Remote Control session"
            : "啟動新的 Remote Control session"}
        >
          {actionLoading === 'restart' ? (
            <>
              <span className="animate-spin">🔄</span>
              <span>{hasSessions ? '重啟中...' : '啟動中...'}</span>
            </>
          ) : (
            <>
              <span>{hasSessions ? '🔄' : '▶️'}</span>
              <span>{hasSessions ? '重啟' : '啟動'}</span>
            </>
          )}
        </button>

        <button
          onClick={handleReconnect}
          disabled={actionLoading !== null}
          className={`py-2.5 sm:py-2 px-2 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 sm:gap-2 ${
            actionLoading === 'reconnect'
              ? 'bg-purple-600 text-white cursor-wait'
              : actionLoading
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white'
          }`}
          title="重新建立 SSH 連線（不影響現有 session）"
        >
          {actionLoading === 'reconnect' ? (
            <>
              <span className="animate-spin">🔄</span>
              <span>連線中...</span>
            </>
          ) : (
            <>
              <span>🔌</span>
              <span>重連</span>
            </>
          )}
        </button>
      </div>

      {server.lastCheck && (
        <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500">
          <span>Last check:</span>
          <span>{new Date(server.lastCheck).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

export default ServerCard;
