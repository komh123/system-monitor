import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import MessageBubble from './MessageBubble.jsx';

function MessageList({ messages, streamingText, onRefresh }) {
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const [pullState, setPullState] = useState('idle'); // idle | pulling | refreshing
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const PULL_THRESHOLD = 60;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Pull-to-refresh touch handlers
  const handleTouchStart = useCallback((e) => {
    if (scrollRef.current?.scrollTop === 0 && onRefresh) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, [onRefresh]);

  const handleTouchMove = useCallback((e) => {
    if (!onRefresh || pullState === 'refreshing') return;
    const scrollEl = scrollRef.current;
    if (!scrollEl || scrollEl.scrollTop > 0) return;

    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      // Dampen the pull distance
      const dampened = Math.min(delta * 0.4, 100);
      setPullDistance(dampened);
      setPullState(dampened >= PULL_THRESHOLD ? 'pulling' : 'idle');
    }
  }, [onRefresh, pullState]);

  const handleTouchEnd = useCallback(async () => {
    if (pullState === 'pulling' && onRefresh) {
      setPullState('refreshing');
      setPullDistance(PULL_THRESHOLD);
      try {
        await onRefresh();
      } catch { /* ignore */ }
    }
    setPullState('idle');
    setPullDistance(0);
  }, [pullState, onRefresh]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 pb-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {onRefresh && pullDistance > 0 && (
        <div
          className="flex items-center justify-center transition-all duration-150"
          style={{ height: `${pullDistance}px` }}
        >
          <div className={`text-xs font-medium ${
            pullState === 'refreshing' ? 'text-blue-400' :
            pullState === 'pulling' ? 'text-slate-300' : 'text-slate-500'
          }`}>
            {pullState === 'refreshing' ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="animate-spin h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full" />
                Refreshing...
              </span>
            ) : pullState === 'pulling' ? (
              '↓ Release to refresh'
            ) : (
              '↓ Pull to refresh'
            )}
          </div>
        </div>
      )}

      {messages.length === 0 && streamingText === null && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-slate-400 text-sm">Send a message to start</p>
          <p className="text-slate-500 text-xs mt-1">Messages are preserved across sessions</p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {/* Streaming indicator with markdown rendering */}
      {streamingText !== null && (
        <div className="flex justify-start mb-3">
          <div className="max-w-full w-full sm:max-w-[85%] sm:w-auto bg-slate-800 text-slate-200 rounded-2xl rounded-bl-md border border-slate-700 px-3 py-2.5 sm:px-3.5 sm:mr-auto">
            <div className="text-sm break-words overflow-hidden">
              {streamingText ? (
                <div className="prose-chat">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const lang = match ? match[1] : '';
                        const codeString = String(children).replace(/\n$/, '');
                        if (!inline && (lang || codeString.includes('\n'))) {
                          return (
                            <div className="relative my-2">
                              {lang && <div className="text-[10px] text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded-t border-b border-slate-700/50 font-mono">{lang}</div>}
                              <SyntaxHighlighter style={oneDark} language={lang || 'text'} PreTag="div" customStyle={{ margin: 0, borderRadius: lang ? '0 0 0.5rem 0.5rem' : '0.5rem', fontSize: '0.8rem', padding: '0.75rem' }} {...props}>{codeString}</SyntaxHighlighter>
                            </div>
                          );
                        }
                        return <code className="bg-slate-700/60 px-1 py-0.5 rounded text-[0.85em] text-pink-300" {...props}>{children}</code>;
                      },
                      a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">{children}</a>; },
                      p({ children }) { return <p className="my-1">{children}</p>; },
                      ul({ children }) { return <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>; },
                      ol({ children }) { return <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>; },
                    }}
                  >
                    {streamingText}
                  </ReactMarkdown>
                </div>
              ) : (
                <span className="inline-flex gap-1 text-slate-400">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
