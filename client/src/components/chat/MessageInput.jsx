import React, { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = '/api/chat';

// Quick reply templates
const QUICK_REPLIES = [
  { label: 'Yes', text: 'Yes, proceed', icon: '\u2713' },
  { label: 'No', text: 'No, stop', icon: '\u2717' },
  { label: 'Diff', text: 'Show me the diff first', icon: '\u00B1' },
  { label: 'Test', text: 'Run tests before committing', icon: '\u25B6' },
  { label: 'Push', text: 'Commit and push', icon: '\u2191' },
  { label: 'Retry', text: 'Try a different approach', icon: '\u21BB' },
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB per image
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function MessageInput({ onSend, disabled, onStop, isStreaming, onOpenPalette, commands = [], selectedCommand = null }) {
  const [text, setText] = useState('');
  const [filteredCommands, setFilteredCommands] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showActions, setShowActions] = useState(false); // WhatsApp-style action menu
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [pendingImages, setPendingImages] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef(null);
  const autocompleteRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const actionsRef = useRef(null);

  const speechSupported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );

  // Auto-resize textarea (max 5 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, [text]);

  // Cleanup image previews on unmount
  useEffect(() => {
    return () => {
      pendingImages.forEach(img => {
        if (img.preview) URL.revokeObjectURL(img.preview);
      });
    };
  }, []);

  // Handle command selected from CommandPalette
  useEffect(() => {
    if (selectedCommand && selectedCommand.name) {
      setText(prev => {
        const trimmed = prev.trim();
        return trimmed ? trimmed + ' ' + selectedCommand.name : selectedCommand.name;
      });
      textareaRef.current?.focus();
    }
  }, [selectedCommand]);

  // Command filtering
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
      const query = trimmed.toLowerCase();
      const filtered = commands.filter(cmd => cmd.name.toLowerCase().startsWith(query));
      setFilteredCommands(filtered);
      setShowAutocomplete(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  }, [text, commands]);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target) &&
          textareaRef.current && !textareaRef.current.contains(e.target)) {
        setShowAutocomplete(false);
      }
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.abort(); };
  }, []);

  const haptic = useCallback((pattern = [10]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }, []);

  // --- Image handling ---
  const processFiles = useCallback(async (files) => {
    const validFiles = Array.from(files).filter(f =>
      ACCEPTED_TYPES.includes(f.type) && f.size <= MAX_IMAGE_SIZE
    );
    if (validFiles.length === 0) return;

    const newImages = await Promise.all(validFiles.map(async (file) => ({
      file,
      preview: URL.createObjectURL(file),
      base64: await fileToBase64(file),
      mimeType: file.type
    })));
    setPendingImages(prev => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((index) => {
    setPendingImages(prev => {
      const updated = [...prev];
      if (updated[index]?.preview) URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      processFiles(imageFiles);
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleFileSelect = useCallback((e) => {
    if (e.target.files?.length) processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processFiles]);

  const selectCommand = (command) => {
    setText(command.name);
    setShowAutocomplete(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    const hasImages = pendingImages.length > 0;
    if ((!trimmed && !hasImages) || disabled) return;

    const images = pendingImages.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.base64 }
    }));

    onSend(trimmed, images.length > 0 ? images : undefined);

    setText('');
    pendingImages.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
    setPendingImages([]);
    setShowAutocomplete(false);
    setShowActions(false);
    haptic([15]);
    if (textareaRef.current) textareaRef.current.blur();
  };

  const handleQuickReply = (reply) => {
    haptic([10]);
    onSend(reply.text);
    setShowActions(false);
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
    recognition.lang = 'zh-TW';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { setIsListening(true); haptic([20, 50, 20]); };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setText(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => { setIsListening(false); textareaRef.current?.focus(); };
    recognitionRef.current = recognition;
    recognition.start();
  }, [speechSupported, isListening, haptic]);

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (onOpenPalette) onOpenPalette();
      return;
    }
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => Math.max(prev - 1, 0)); }
      else if ((e.key === 'Tab' || e.key === 'Enter') && filteredCommands[selectedIndex]) { e.preventDefault(); selectCommand(filteredCommands[selectedIndex]); return; }
      else if (e.key === 'Escape') { e.preventDefault(); setShowAutocomplete(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !showAutocomplete) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = text.trim() || pendingImages.length > 0;

  return (
    <div
      className="flex-shrink-0 bg-slate-900 border-t border-slate-700 safe-area-bottom z-10 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-600/20 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center z-30 pointer-events-none">
          <span className="text-blue-300 text-sm font-medium">Drop images here</span>
        </div>
      )}

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
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors ${
                idx === selectedIndex ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-200'
              }`}
              style={{ minHeight: '44px' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-medium">{cmd.name}</div>
                <div className={`text-xs mt-0.5 ${idx === selectedIndex ? 'text-blue-100' : 'text-slate-400'}`}>{cmd.description}</div>
              </div>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs ${
                cmd.category === 'session' ? 'bg-blue-500/20 text-blue-400' :
                cmd.category === 'skill' ? 'bg-purple-500/20 text-purple-400' :
                'bg-green-500/20 text-green-400'
              }`}>{cmd.category}</span>
            </button>
          ))}
        </div>
      )}

      {/* WhatsApp-style action menu (bottom sheet) */}
      {showActions && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowActions(false)} />
          <div ref={actionsRef} className="absolute bottom-full left-0 right-0 mb-1 mx-2 sm:mx-3 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-40 p-3">
            {/* Action grid */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <button
                onClick={() => { fileInputRef.current?.click(); setShowActions(false); }}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center text-xl">
                  {'\uD83D\uDDBC'}
                </div>
                <span className="text-[11px] text-slate-400">Image</span>
              </button>

              {onOpenPalette && (
                <button
                  onClick={() => { onOpenPalette(); setShowActions(false); }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center text-xl font-mono text-purple-400">
                    /
                  </div>
                  <span className="text-[11px] text-slate-400">Commands</span>
                </button>
              )}

              {speechSupported && (
                <button
                  onClick={() => { toggleVoiceInput(); setShowActions(false); }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                    isListening ? 'bg-red-600/30 animate-pulse' : 'bg-green-600/20'
                  }`}>
                    {'\uD83C\uDFA4'}
                  </div>
                  <span className="text-[11px] text-slate-400">{isListening ? 'Stop' : 'Voice'}</span>
                </button>
              )}

              <button
                onClick={() => { setShowActions(false); }}
                className="flex flex-col items-center gap-1.5 sm:hidden"
              >
                <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl text-slate-400">
                  {'\u2715'}
                </div>
                <span className="text-[11px] text-slate-400">Close</span>
              </button>
            </div>

            {/* Quick replies */}
            <div className="border-t border-slate-700 pt-2">
              <div className="text-[11px] text-slate-500 mb-1.5">Quick replies</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply.label}
                    onClick={() => handleQuickReply(reply)}
                    className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 rounded-full text-xs font-medium transition-colors flex items-center gap-1 border border-slate-600"
                  >
                    <span>{reply.icon}</span>
                    <span>{reply.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Image Preview Strip */}
      {pendingImages.length > 0 && (
        <div className="flex gap-2 px-2 pt-2 overflow-x-auto pb-1 scrollbar-thin">
          {pendingImages.map((img, idx) => (
            <div key={idx} className="relative shrink-0 group">
              <img
                src={img.preview}
                alt={`Upload ${idx + 1}`}
                className="h-16 w-16 object-cover rounded-lg border border-slate-600"
              />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center btn-inline"
              >
                {'\u2715'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row: + button, textarea, send/stop — minimal on mobile */}
      <div className="flex items-end gap-1.5 p-2">
        {/* "+" action button (WhatsApp pattern) */}
        <button
          onClick={() => { setShowActions(!showActions); haptic([5]); }}
          className={`shrink-0 h-10 w-10 flex items-center justify-center rounded-full text-lg transition-colors ${
            showActions
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 border border-slate-600 text-slate-400 hover:text-white active:bg-slate-700'
          }`}
          title="Actions"
        >
          {showActions ? '\u2715' : '+'}
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={pendingImages.length > 0 ? "Describe these images..." : "Message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-2xl px-3.5 py-2 text-[15px] leading-[1.4] resize-none focus:outline-none focus:border-blue-500 placeholder-slate-500 disabled:opacity-50 max-h-32"
          style={{ minHeight: '40px' }}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            onClick={() => { onStop(); haptic([30, 30, 30]); }}
            className="shrink-0 h-10 w-10 flex items-center justify-center bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-full transition-colors"
            title="Stop"
          >
            {'\u25A0'}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!hasContent || disabled}
            className={`shrink-0 h-10 w-10 flex items-center justify-center rounded-full transition-colors ${
              hasContent && !disabled
                ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
                : 'bg-slate-800 border border-slate-600 text-slate-600'
            }`}
            title="Send"
          >
            {'\u2191'}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default MessageInput;
