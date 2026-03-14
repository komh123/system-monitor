import React, { useState, useRef, useEffect } from 'react';

const API_BASE = '/api/chat';

function MessageInput({ onSend, disabled, onStop, isStreaming, onOpenPalette, commands = [] }) {
  const [text, setText] = useState('');
  const [filteredCommands, setFilteredCommands] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Auto-resize textarea (max 4 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [text]);

  // Handle command filtering
  useEffect(() => {
    const trimmed = text.trim();

    // Show autocomplete only if text starts with "/" and has no spaces
    if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
      const query = trimmed.toLowerCase();
      const filtered = commands.filter(cmd =>
        cmd.name.toLowerCase().startsWith(query)
      );
      setFilteredCommands(filtered);
      setShowAutocomplete(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  }, [text, commands]);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target) &&
          textareaRef.current && !textareaRef.current.contains(e.target)) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectCommand = (command) => {
    setText(command.name);
    setShowAutocomplete(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    setShowAutocomplete(false);
  };

  const handleKeyDown = (e) => {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (filteredCommands[selectedIndex]) {
          e.preventDefault();
          selectCommand(filteredCommands[selectedIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !showAutocomplete) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-2 sm:p-3 safe-area-bottom z-10">
      {/* Command Autocomplete Dropdown */}
      {showAutocomplete && (
        <div
          ref={autocompleteRef}
          className="absolute bottom-full left-0 right-0 mb-1 mx-2 sm:mx-3 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-64 overflow-y-auto z-20"
        >
          {filteredCommands.map((cmd, idx) => (
            <button
              key={cmd.id}
              onClick={() => selectCommand(cmd)}
              className={`w-full text-left px-3 py-2.5 sm:py-3 flex items-start gap-2 transition-colors ${
                idx === selectedIndex
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-700 text-slate-200'
              }`}
              style={{ minHeight: '44px' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-medium">{cmd.name}</div>
                <div className={`text-xs mt-0.5 ${
                  idx === selectedIndex ? 'text-blue-100' : 'text-slate-400'
                }`}>
                  {cmd.description}
                </div>
              </div>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs ${
                cmd.category === 'session' ? 'bg-blue-500/20 text-blue-400' :
                cmd.category === 'skill' ? 'bg-purple-500/20 text-purple-400' :
                'bg-green-500/20 text-green-400'
              }`}>
                {cmd.category}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Command Palette button for mobile */}
        {onOpenPalette && (
          <button
            onClick={onOpenPalette}
            className="shrink-0 h-11 w-11 flex items-center justify-center bg-slate-800 border border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 active:bg-slate-700 transition-colors text-lg font-mono"
            title="Commands"
          >
            /
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or / for commands..."
          disabled={disabled}
          rows={1}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-blue-500 placeholder-slate-500 disabled:opacity-50"
          style={{ minHeight: '44px' }}
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="shrink-0 h-11 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="shrink-0 h-11 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

export default MessageInput;
