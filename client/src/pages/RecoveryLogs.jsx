import React, { useState, useEffect } from 'react';

const API_BASE = '/api';

function RecoveryLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterServer, setFilterServer] = useState('all');
  const [filterEvent, setFilterEvent] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [alerts, setAlerts] = useState([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchLogs();
    fetchAlerts();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/claude-remote/logs?limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch(`${API_BASE}/claude-remote/alerts?limit=5`);
      if (!response.ok) return; // Alerts are optional
      const data = await response.json();
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  };

  const handleResendEmail = async (alertId) => {
    if (!confirm('Resend this email alert?')) return;

    try {
      const response = await fetch(`${API_BASE}/claude-remote/alerts/${alertId}/resend`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to resend email');
      alert('Email resent successfully');
      fetchAlerts();
    } catch (err) {
      alert('Failed to resend email: ' + err.message);
    }
  };

  const getEventColor = (event) => {
    if (event.includes('success') || event.includes('恢復')) return 'text-green-400 bg-green-500/10';
    if (event.includes('failed') || event.includes('失敗')) return 'text-red-400 bg-red-500/10';
    if (event.includes('started') || event.includes('開始')) return 'text-blue-400 bg-blue-500/10';
    return 'text-slate-400 bg-slate-500/10';
  };

  const getResultBadge = (outcome) => {
    if (!outcome) return null;
    const isSuccess = outcome.toLowerCase().includes('success') || outcome.includes('成功');
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
        isSuccess ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      }`}>
        {outcome}
      </span>
    );
  };

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (filterServer !== 'all' && log.server !== filterServer) return false;
    if (filterEvent !== 'all' && !log.event.toLowerCase().includes(filterEvent.toLowerCase())) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  // Get unique servers for filter
  const uniqueServers = [...new Set(logs.map(log => log.server))];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading recovery logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <span>📋</span> <span className="hidden sm:inline">Recovery Event Timeline</span><span className="sm:hidden">Recovery Logs</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            {filteredLogs.length} events
            {filteredLogs.length !== logs.length && ` (of ${logs.length})`}
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="btn btn-primary text-xs sm:text-sm"
        >
          ↻ Refresh
        </button>
      </header>

      {error && (
        <div className="card bg-red-500/10 border-red-500/30 mb-6">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4 sm:mb-6">
        <div className="flex gap-2 sm:gap-4">
          <div className="flex-1">
            <label className="block text-[10px] sm:text-sm font-medium mb-1.5 sm:mb-2 text-slate-400">Server</label>
            <select
              value={filterServer}
              onChange={(e) => {
                setFilterServer(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 sm:px-3 py-2 bg-slate-700 border border-slate-600 rounded text-xs sm:text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All</option>
              {uniqueServers.map(server => (
                <option key={server} value={server}>{server}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] sm:text-sm font-medium mb-1.5 sm:mb-2 text-slate-400">Event</label>
            <select
              value={filterEvent}
              onChange={(e) => {
                setFilterEvent(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 sm:px-3 py-2 bg-slate-700 border border-slate-600 rounded text-xs sm:text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All</option>
              <option value="started">Started</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {paginatedLogs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-lg mb-2">No recovery events found</p>
          <p className="text-slate-500 text-sm">
            {logs.length === 0
              ? 'No events have been logged yet'
              : 'Try adjusting the filters'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">時間</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">伺服器</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">事件</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm hidden md:table-cell">原因</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm hidden sm:table-cell">方法</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">結果</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map((log, index) => (
                <tr key={index} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-sm text-slate-300 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium">
                    {log.server}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4">
                    <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${getEventColor(log.event)}`}>
                      {log.event}
                    </span>
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-400 hidden md:table-cell">
                    {log.reason || 'N/A'}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-400 hidden sm:table-cell">
                    {log.method || 'N/A'}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4">
                    {getResultBadge(log.outcome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 sm:mt-6 flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm"
          >
            Prev
          </button>
          <span className="text-slate-400 text-xs sm:text-sm">
            {currentPage}/{totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm"
          >
            Next
          </button>
        </div>
      )}

      {/* Email Alerts Section */}
      {alerts.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <h2 className="text-base sm:text-xl font-bold mb-3 sm:mb-4 flex items-center gap-2">
            <span>📧</span> 最後告警
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">時間</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">伺服器</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">類型</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">郵件主旨</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">發送狀態</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert, index) => (
                  <tr key={index} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-sm text-slate-300">
                      {new Date(alert.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium">
                      {alert.server}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-400">
                      {alert.type}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-300">
                      {alert.subject}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        alert.status === 'sent'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {alert.status === 'sent' ? '已發送' : '發送失敗'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedEmail(alert);
                            setShowEmailModal(true);
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                        >
                          查看
                        </button>
                        {alert.status !== 'sent' && (
                          <button
                            onClick={() => handleResendEmail(alert.id)}
                            className="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs"
                          >
                            重發
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Email Content Modal */}
      {showEmailModal && selectedEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEmailModal(false)}>
          <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full border border-slate-700 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">郵件內容</h2>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm">主旨</label>
                <div className="mt-1 text-white font-medium">{selectedEmail.subject}</div>
              </div>
              <div>
                <label className="text-slate-400 text-sm">時間</label>
                <div className="mt-1 text-slate-300">{new Date(selectedEmail.timestamp).toLocaleString()}</div>
              </div>
              <div>
                <label className="text-slate-400 text-sm">伺服器</label>
                <div className="mt-1 text-slate-300">{selectedEmail.server}</div>
              </div>
              <div>
                <label className="text-slate-400 text-sm">郵件內容</label>
                <div className="mt-1 bg-slate-700/50 p-4 rounded text-sm text-slate-300 whitespace-pre-wrap">
                  {selectedEmail.content || '（無內容）'}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowEmailModal(false)}
              className="mt-6 w-full btn btn-primary"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecoveryLogs;
