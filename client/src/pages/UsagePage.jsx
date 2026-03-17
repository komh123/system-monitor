import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import FullscreenChart from '../components/FullscreenChart.jsx';

const API_BASE = '/api/usage';

function formatTimeLeft(resetsAt) {
  if (!resetsAt) return 'N/A';
  const now = new Date();
  const reset = new Date(resetsAt);
  const diff = reset - now;
  if (diff <= 0) return 'Resetting...';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatResetDate(resetsAt) {
  if (!resetsAt) return '';
  const d = new Date(resetsAt);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `Resets ${days[d.getDay()]} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatHistoryTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getUsageColor(pct) {
  if (pct >= 80) return { bar: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/30', gradient: ['#ef4444', '#dc2626'] };
  if (pct >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-400', ring: 'ring-yellow-500/30', gradient: ['#eab308', '#ca8a04'] };
  return { bar: 'bg-blue-500', text: 'text-blue-400', ring: 'ring-blue-500/30', gradient: ['#3b82f6', '#2563eb'] };
}

// Circular progress gauge
function CircularGauge({ value, label, sublabel, resetsAt, size = 140 }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = getUsageColor(value);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#334155" strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={color.gradient[0]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${color.text}`}>{value}%</span>
          <span className="text-xs text-slate-500 uppercase tracking-wide">used</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        {sublabel && <div className="text-xs text-slate-500">{sublabel}</div>}
        {resetsAt && (
          <div className="text-xs text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {formatTimeLeft(resetsAt)} left
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Horizontal usage bar (matching screenshot style)
function UsageBar({ label, value, resetsAt, sublabel }) {
  const color = getUsageColor(value);

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-sm font-medium text-slate-200">{label}</span>
          {sublabel && <span className="text-xs text-slate-500 ml-2">{sublabel}</span>}
        </div>
        <span className={`text-sm font-bold ${color.text}`}>{value}% used</span>
      </div>
      {resetsAt && (
        <div className="text-xs text-slate-400 mb-2">{formatResetDate(resetsAt)}</div>
      )}
      <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color.bar} transition-all duration-1000 ease-out`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      {resetsAt && (
        <div className="text-right text-xs text-slate-500 mt-1">
          Resets in {formatTimeLeft(resetsAt)}
        </div>
      )}
    </div>
  );
}

// Custom tooltip for charts
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{formatHistoryTime(label)}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}%
        </p>
      ))}
    </div>
  );
}

function UsagePage() {
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(24);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [usageRes, historyRes] = await Promise.all([
        fetch(API_BASE, { headers }),
        fetch(`${API_BASE}/history?hours=${timeRange}`, { headers })
      ]);

      if (usageRes.ok) {
        setUsage(await usageRes.json());
      } else {
        const err = await usageRes.json();
        setError(err.error || 'Failed to fetch usage');
      }

      if (historyRes.ok) {
        setHistory(await historyRes.json());
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchUsage, 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 flex items-center gap-2">
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          Loading usage data...
        </div>
      </div>
    );
  }

  if (error && !usage) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400 text-lg mb-2">Unable to load usage data</p>
        <p className="text-slate-400 text-sm">{error}</p>
        <button onClick={fetchUsage} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Plan Usage Limits</span>
            {usage?.subscription && (
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full font-medium uppercase">
                {usage.subscription}
              </span>
            )}
          </h1>
          {usage?.stale && (
            <span className="text-xs text-yellow-400">Using cached data</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500/30"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchUsage}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Circular Gauges — 2 col mobile (smaller gauges), 4 col desktop */}
      <div className="bg-slate-800 rounded-xl p-3 sm:p-6 border border-slate-700">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 justify-items-center">
          <CircularGauge
            value={usage?.session?.utilization || 0}
            label="Current Session"
            sublabel="5-hour window"
            resetsAt={usage?.session?.resetsAt}
            size={typeof window !== 'undefined' && window.innerWidth < 640 ? 100 : 140}
          />
          <CircularGauge
            value={usage?.weekly?.utilization || 0}
            label="All Models"
            sublabel="7-day window"
            resetsAt={usage?.weekly?.resetsAt}
            size={typeof window !== 'undefined' && window.innerWidth < 640 ? 100 : 140}
          />
          <CircularGauge
            value={usage?.sonnet?.utilization || 0}
            label="Sonnet"
            sublabel="Weekly limit"
            resetsAt={usage?.sonnet?.resetsAt}
            size={typeof window !== 'undefined' && window.innerWidth < 640 ? 100 : 140}
          />
          <CircularGauge
            value={usage?.opus?.utilization || 0}
            label="Opus"
            sublabel="Weekly limit"
            resetsAt={usage?.opus?.resetsAt}
            size={typeof window !== 'undefined' && window.innerWidth < 640 ? 100 : 140}
          />
        </div>
      </div>

      {/* Usage Bars (matching screenshot style) */}
      <div className="space-y-3">
        <UsageBar
          label="Current session"
          sublabel={usage?.rateLimitTier}
          value={usage?.session?.utilization || 0}
          resetsAt={usage?.session?.resetsAt}
        />
        <UsageBar
          label="Weekly limits — All models"
          value={usage?.weekly?.utilization || 0}
          resetsAt={usage?.weekly?.resetsAt}
        />
        <UsageBar
          label="Weekly limits — Sonnet only"
          value={usage?.sonnet?.utilization || 0}
          resetsAt={usage?.sonnet?.resetsAt}
        />
        {(usage?.opus?.utilization > 0 || usage?.opus?.resetsAt) && (
          <UsageBar
            label="Weekly limits — Opus only"
            value={usage?.opus?.utilization || 0}
            resetsAt={usage?.opus?.resetsAt}
          />
        )}
      </div>

      {/* History Chart */}
      {history.length > 1 && (
        <div className="bg-slate-800 rounded-xl p-4 sm:p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-300">Usage History</h2>
            <div className="flex gap-1">
              {[6, 12, 24, 48, 168].map(h => (
                <button
                  key={h}
                  onClick={() => setTimeRange(h)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    timeRange === h
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {h <= 24 ? `${h}h` : `${h / 24}d`}
                </button>
              ))}
            </div>
          </div>
          <FullscreenChart title="Usage History" height="h-44 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorSession" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorWeekly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSonnet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatHistoryTime}
                  stroke="#64748b"
                  fontSize={10}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="#64748b"
                  fontSize={10}
                  width={35}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '80%', fill: '#ef4444', fontSize: 9 }} />
                <Area type="monotone" dataKey="session" name="Session" stroke="#3b82f6" fill="url(#colorSession)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="weekly" name="Weekly" stroke="#8b5cf6" fill="url(#colorWeekly)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="sonnet" name="Sonnet" stroke="#06b6d4" fill="url(#colorSonnet)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </FullscreenChart>
        </div>
      )}

      {/* Extra Usage Info */}
      {usage?.extraUsage?.is_enabled && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h2 className="text-sm font-medium text-slate-300 mb-2">Extra Usage</h2>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Monthly limit: ${usage.extraUsage.monthly_limit || 'Unlimited'}
            </span>
            <span className="text-xs text-slate-400">
              Used: ${usage.extraUsage.used_credits || 0}
            </span>
          </div>
          {usage.extraUsage.utilization != null && (
            <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${usage.extraUsage.utilization}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Account Info */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Subscription: <strong className="text-slate-300">{usage?.subscription || 'N/A'}</strong></span>
          <span>Tier: <strong className="text-slate-300">{usage?.rateLimitTier || 'N/A'}</strong></span>
          <span>Last updated: <strong className="text-slate-300">{usage?.timestamp ? new Date(usage.timestamp).toLocaleTimeString() : 'N/A'}</strong></span>
          <span>History points: <strong className="text-slate-300">{history.length}</strong></span>
        </div>
      </div>
    </div>
  );
}

export default UsagePage;
