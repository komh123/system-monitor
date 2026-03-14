import React, { useState, useEffect } from 'react';

const API_BASE = '/api/chat';

const DEFAULT_TOOLS = ['Read', 'Edit', 'Bash', 'Write', 'Glob', 'Grep'];

function NewSessionModal({ onClose, onCreate }) {
  const [servers, setServers] = useState([]);
  const [models, setModels] = useState([]);
  const [serverIp, setServerIp] = useState('');
  const [model, setModel] = useState('sonnet');
  const [sessionName, setSessionName] = useState('');
  const [tools, setTools] = useState([...DEFAULT_TOOLS]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/servers`).then(r => r.json()),
      fetch(`${API_BASE}/models`).then(r => r.json())
    ]).then(([sData, mData]) => {
      setServers(sData.servers || []);
      setModels(mData.models || []);
      if (sData.servers?.length > 0) setServerIp(sData.servers[0].ip);
    });
  }, []);

  const handleCreate = async () => {
    if (!serverIp) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverIp,
          model,
          sessionName: sessionName || undefined,
          allowedTools: tools
        })
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      onCreate(data);
      onClose();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleTool = (t) => {
    setTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md border border-slate-700 p-4 sm:p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base sm:text-lg font-semibold mb-4">New Session</h2>

        {/* Session Name */}
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5">Session Name</label>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g. Strategy Optimization"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Server */}
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5">Server</label>
          <select
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          >
            {servers.map(s => (
              <option key={s.ip} value={s.ip}>{s.alias} ({s.ip})</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5">Model</label>
          <div className="flex gap-2">
            {models.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  model === m.id
                    ? m.id === 'sonnet' ? 'bg-blue-600 text-white'
                    : m.id === 'opus' ? 'bg-purple-600 text-white'
                    : 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {m.id}
              </button>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div className="mb-6">
          <label className="block text-xs text-slate-400 mb-1.5">Allowed Tools</label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_TOOLS.map(t => (
              <button
                key={t}
                onClick={() => toggleTool(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tools.includes(t)
                    ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50'
                    : 'bg-slate-700 text-slate-400 border border-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!serverIp || creating}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewSessionModal;
