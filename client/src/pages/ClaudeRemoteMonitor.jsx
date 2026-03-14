import React, { useState, useEffect, useCallback } from 'react';
import ServerCard from '../components/ServerCard';

const API_BASE = '/api';
const REFRESH_INTERVAL = 30000; // 30 seconds

function ClaudeRemoteMonitor() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/claude-remote/status`);
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();

      // Convert object to array if needed
      const serverArray = Array.isArray(data.servers)
        ? data.servers
        : Object.entries(data.servers || {}).map(([ip, server]) => ({
            ...server,
            ip: ip  // 添加 ip 欄位
          }));
      setServers(serverArray);
      setLastUpdate(new Date());
      setError(null);
      setCountdown(30);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchStatus();
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !servers.length) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading server status...</p>
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
              <span>🤖</span> <span className="hidden sm:inline">Claude Remote Control Monitor</span><span className="sm:hidden">Remote Monitor</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">Multi-server · Multi-session</p>
          </div>
          <span className="text-slate-400 text-xs sm:text-sm whitespace-nowrap">
            {countdown}s
          </span>
        </div>
        {error && <span className="text-red-400 text-xs sm:text-sm">{error}</span>}
        <div className="flex items-center gap-2">
          <a
            href="/claude-remote/docs"
            className="flex-1 sm:flex-none px-3 py-2.5 rounded-lg font-medium transition-colors bg-purple-600 hover:bg-purple-700 text-white inline-flex items-center justify-center gap-2 text-xs sm:text-sm"
            title="View technical documentation"
          >
            <span>📚</span> Docs
          </a>
          <button
            onClick={handleRefresh}
            className="flex-1 sm:flex-none px-3 py-2.5 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-700 disabled:text-slate-500 text-xs sm:text-sm"
            disabled={loading}
            title="Refresh and detect new sessions"
          >
            {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
          </button>
          {lastUpdate && (
            <span className="text-slate-500 text-[10px] sm:text-xs hidden sm:inline">
              Last: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {servers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-lg mb-2">No servers configured</p>
          <p className="text-slate-500 text-sm">
            Add server configuration to start monitoring
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {servers.map((server, index) => (
            <ServerCard
              key={server.ip || index}
              server={server}
              onRecover={fetchStatus}
            />
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {servers.length > 0 && (
        <div className="mt-4 sm:mt-6 grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4">
          <div className="card text-center">
            <div className="text-lg sm:text-2xl font-bold text-blue-400">
              {servers.reduce((sum, s) => sum + (s.claudeRemote?.sessions?.length || 0), 0)}
            </div>
            <div className="text-slate-400 text-[10px] sm:text-sm">Total</div>
          </div>
          <div className="card text-center">
            <div className="text-lg sm:text-2xl font-bold text-green-400">
              {servers.filter(s => s.status === 'healthy').length}
            </div>
            <div className="text-slate-400 text-[10px] sm:text-sm">Active</div>
          </div>
          <div className="card text-center">
            <div className="text-lg sm:text-2xl font-bold text-slate-400">
              {servers.filter(s => s.status === 'no_sessions').length}
            </div>
            <div className="text-slate-400 text-[10px] sm:text-sm">None</div>
          </div>
          <div className="card text-center hidden sm:block">
            <div className="text-lg sm:text-2xl font-bold text-yellow-400">
              {servers.filter(s => s.status === 'degraded').length}
            </div>
            <div className="text-slate-400 text-[10px] sm:text-sm">Unstable</div>
          </div>
          <div className="card text-center hidden sm:block">
            <div className="text-lg sm:text-2xl font-bold text-red-400">
              {servers.filter(s => s.status === 'failed').length}
            </div>
            <div className="text-slate-400 text-[10px] sm:text-sm">Offline</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClaudeRemoteMonitor;
