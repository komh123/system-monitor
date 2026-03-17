import React, { useState, useEffect, useRef, useCallback } from 'react';

const CATEGORY_LABELS = {
  session: { label: 'Session', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  skill: { label: 'Skill', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  agent: { label: 'Agent', color: 'bg-green-500/20 text-green-400 border-green-500/40' },
  mcp: { label: 'MCP', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' }
};

function CommandPalette({ isOpen, onClose, onSelect, commands, mcpTools }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const modalRef = useRef(null);

  // Detect mobile (no physical keyboard / narrow viewport)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

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

  // Lock body scroll when palette is open (critical for iOS)
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSelectedSkills([]);
      // Defer focus on mobile to avoid keyboard jank
      const delay = isMobile ? 150 : 50;
      setTimeout(() => inputRef.current?.focus(), delay);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Prevent touch scrolling on backdrop
  const handleBackdropTouch = useCallback((e) => {
    e.preventDefault();
    onClose();
  }, [onClose]);

  const handleSelect = useCallback((item) => {
    onSelect(item);

    if (item.category === 'skill') {
      // Track selected skills
      setSelectedSkills(prev => {
        const already = prev.includes(item.id);
        return already ? prev : [...prev, item.id];
      });
      // On mobile: close after first skill selection (no multi-select UX on touch)
      if (isMobile) {
        onClose();
      }
      // On desktop: keep open for multi-selection
    } else {
      onClose();
    }
  }, [onSelect, onClose, isMobile]);

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
        handleSelect(flatList[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] sm:pt-[20vh] z-50"
      onClick={onClose}
      onTouchEnd={handleBackdropTouch}
      style={{ touchAction: 'none' }}
    >
      <div
        ref={modalRef}
        className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-lg mx-3 shadow-2xl max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
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
            style={{ minHeight: '44px' }}
          />
          {/* Close button — visible on all sizes */}
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 px-2.5 py-2 rounded border border-slate-600 transition-colors"
            aria-label="Close command palette"
          >
            <span className="sm:hidden">✕</span>
            <span className="hidden sm:inline">ESC</span>
          </button>
        </div>

        {/* Selected skills indicator (desktop multi-select) */}
        {selectedSkills.length > 0 && !isMobile && (
          <div className="px-3 sm:px-4 py-1.5 border-b border-slate-700 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500">Selected:</span>
            {selectedSkills.map(id => {
              const item = allItems.find(i => i.id === id);
              return (
                <span key={id} className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                  {item?.name || id}
                </span>
              );
            })}
            <button
              onClick={onClose}
              className="text-xs text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 px-2 py-0.5 rounded border border-green-500/30 ml-auto transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1 overscroll-contain">
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
                  const isSelected = selectedSkills.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={() => handleSelect(item)}
                      className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3 transition-colors ${
                        idx === selectedIndex
                          ? 'bg-blue-600 text-white'
                          : isSelected
                          ? 'bg-purple-600/20 text-purple-200'
                          : 'hover:bg-slate-700/70 text-slate-200'
                      }`}
                      style={{ minHeight: '48px' }}
                    >
                      {/* Checkmark for selected skills */}
                      {isSelected && (
                        <span className="text-purple-400 text-sm shrink-0">✓</span>
                      )}
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
          <span className="hidden sm:inline"><kbd className="bg-slate-700 px-1 rounded">↑↓</kbd> Navigate</span>
          <span className="hidden sm:inline"><kbd className="bg-slate-700 px-1 rounded">↵</kbd> Select</span>
          <span className="sm:hidden">Tap to select</span>
          <span className="ml-auto"><kbd className="bg-slate-700 px-1 rounded">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
