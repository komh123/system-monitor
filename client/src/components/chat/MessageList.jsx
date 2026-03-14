import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble.jsx';

function MessageList({ messages, streamingText }) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 pb-4">
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

      {/* Streaming indicator */}
      {streamingText !== null && (
        <div className="flex justify-start mb-3">
          <div className="max-w-[85%] sm:max-w-[75%] bg-slate-800 text-slate-200 rounded-2xl rounded-bl-md border border-slate-700 px-3.5 py-2.5">
            <div className="text-sm whitespace-pre-wrap break-words">
              {streamingText || (
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
