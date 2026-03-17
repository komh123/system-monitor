import React, { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = '/api/chat';

// Quick reply templates for common mobile responses
const QUICK_REPLIES = [
  { label: 'Yes', text: 'Yes, proceed', icon: '✓' },
  { label: 'No', text: 'No, stop', icon: '✗' },
  { label: 'Diff', text: 'Show me the diff first', icon: '±' },
  { label: 'Test', text: 'Run tests before committing', icon: '▶' },
  { label: 'Push', text: 'Commit and push', icon: '↑' },
  { label: 'Retry', text: 'Try a different approach', icon: '↻' },
];

function MessageInput({ onSend, disabled, onStop, isStreaming, onOpenPalette, commands = [], selectedCommand = null }) {
  const [text, setText] = useState('');
  const [filteredCommands, setFilteredCommands] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef(null);
  const autocompleteRef = useRef(null);
  const recognitionRef = useRef(null);

  // Check if voice input is available
  const speechSupported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );

  // Auto-resize textarea (max 4 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [text]);

  // Handle command selected from CommandPalette
  useEffect(() => {
    if (selectedCommand && selectedCommand.name) {
      setText(prev => {
        const trimmed = prev.trim();
        if (trimmed) {
          return trimmed + ' ' + selectedCommand.name;
        }
        return selectedCommand.name;
      });
      textareaRef.current?.focus();
    }
  }, [selectedCommand]);

  // Handle command filtering
  useEffect(() => {
    const trimmed = text.trim();

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

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Haptic feedback helper
  const haptic = useCallback((pattern = [10]) => {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
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
    setShowQuickReplies(false);

    // Haptic feedback on send
    haptic([15]);

    // Dismiss keyboard on mobile after send
    if (textareaRef.current) {
      textareaRef.current.blur();
    }
  };

  const handleQuickReply = (reply) => {
    haptic([10]);
    onSend(reply.text);
    setShowQuickReplies(false);
  };

  // Voice input
  const toggleVoiceInput = useCallback(() => {
    if (!speechSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      haptic([10]);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-TW'; // Default Chinese, can be changed
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      haptic([20, 50, 20]); // Double tap pattern
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText(prev => prev ? prev + ' ' + transcript : transcript);
    };

    recognition.onerror = (event) => {
      console.error('[Voice] Recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      textareaRef.current?.focus();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [speechSupported, isListening, haptic]);

  const handleKeyDown = (e) => {
    // Cmd+K or Ctrl+K to open Command Palette (even with text)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (onOpenPalette) {
        onOpenPalette();
      }
      return;
    }

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

      {/* Quick Reply Templates (mobile-friendly) */}
      {showQuickReplies && !showAutocomplete && (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 sm:mx-3 bg-slate-800 border border-slate-600 rounded-lg shadow-lg p-2 z-20">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply.label}
                onClick={() => handleQuickReply(reply)}
                className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-600"
                style={{ minHeight: '44px' }}
              >
                <span>{reply.icon}</span>
                <span>{reply.label}</span>
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 text-center">Tap to send quick reply</div>
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-2">
        {/* Quick Reply toggle (mobile) */}
        <button
          onClick={() => { setShowQuickReplies(!showQuickReplies); haptic([5]); }}
          className={`shrink-0 h-11 w-11 flex items-center justify-center rounded-lg text-lg transition-colors border ${
            showQuickReplies
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 active:bg-slate-700'
          }`}
          title="Quick Replies"
        >
          ⚡
        </button>

        {/* Command Palette button (visible on all sizes) */}
        {onOpenPalette && (
          <button
            onClick={onOpenPalette}
            className="shrink-0 h-11 w-11 flex items-center justify-center bg-slate-800 border border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 active:bg-slate-700 transition-colors text-lg font-mono"
            title="Commands (Ctrl+K)"
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

        {/* Voice Input button (mobile-first) */}
        {speechSupported && !isStreaming && (
          <button
            onClick={toggleVoiceInput}
            className={`shrink-0 h-11 w-11 flex items-center justify-center rounded-lg text-sm font-medium transition-all border ${
              isListening
                ? 'bg-red-600 border-red-500 text-white animate-pulse scale-110'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 active:bg-slate-700'
            }`}
            title={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? '⏹' : '🎤'}
          </button>
        )}

        {isStreaming ? (
          <button
            onClick={() => { onStop(); haptic([30, 30, 30]); }}
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
