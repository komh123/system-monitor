import React, { useState, useEffect, useRef } from 'react';

const CATEGORY_LABELS = {
  session: { label: 'Session', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  skill: { label: 'Skill', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  agent: { label: 'Agent', color: 'bg-green-500/20 text-green-400 border-green-500/40' },
  mcp: { label: 'MCP', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' }
};

function CommandPalette({ isOpen, onClose, onSelect, commands, mcpTools }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Merge all items
  const allItems = [
    ...commands,
    ...(mcpTools || []).map(t => ({
      id: `mcp:${t.name}`,
      name: t.name,
      description: t.description,
      category: 'mcp'
    }))
  ];

  // Filter
  const filtered = query
    ? allItems.filter(item =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.description.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  // Group by category
  const grouped = {};
  for (const item of filtered) {
    const cat = item.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  // Flat list for keyboard navigation
  const flatList = Object.values(grouped).flat();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[selectedIndex]) {
        const item = flatList[selectedIndex];
        onSelect(item);
        // Only close palette for non-skill items
        // Skills stay open for multi-selection
        if (item.category !== 'skill') {
          onClose();
        }
      }
    }
  };

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] sm:pt-[20vh] z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-lg mx-3 shadow-2xl max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-700">
          <span className="text-slate-400 text-lg">&#x2315;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search commands, skills, MCP tools..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
            style={{ minHeight: '36px' }}
          />
          <kbd className="hidden sm:inline-block text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded border border-slate-600">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {flatList.length === 0 && (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">
              No matching commands found
            </div>
          )}

          {Object.entries(grouped).map(([category, items]) => {
            const catInfo = CATEGORY_LABELS[category] || { label: category, color: 'bg-slate-500/20 text-slate-400' };
            return (
              <div key={category}>
                {/* Category Header */}
                <div className="px-3 sm:px-4 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide bg-slate-800/80 sticky top-0">
                  {catInfo.label}
                </div>

                {/* Items */}
                {items.map((item) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={() => {
                        onSelect(item);
                        // Only close for non-skill items
                        if (item.category !== 'skill') {
                          onClose();
                        }
                      }}
                      className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3 transition-colors ${
                        idx === selectedIndex
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-700/70 text-slate-200'
                      }`}
                      style={{ minHeight: '48px' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-medium truncate">
                          {item.name}
                        </div>
                        <div className={`text-xs mt-0.5 truncate ${
                          idx === selectedIndex ? 'text-blue-100' : 'text-slate-400'
                        }`}>
                          {item.description}
                        </div>
                      </div>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs border ${
                        idx === selectedIndex
                          ? 'bg-blue-500/30 text-blue-100 border-blue-400/30'
                          : catInfo.color
                      }`}>
                        {catInfo.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-3 sm:px-4 py-2 border-t border-slate-700 flex items-center gap-3 text-xs text-slate-500">
          <span><kbd className="bg-slate-700 px-1 rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="bg-slate-700 px-1 rounded">↵</kbd> Select</span>
          <span><kbd className="bg-slate-700 px-1 rounded">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
