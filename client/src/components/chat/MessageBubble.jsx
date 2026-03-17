import React from 'react';
import ToolCard from './ToolCard.jsx';
import CommandResult from './CommandResult.jsx';

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isSlashCommand = isUser && message.content?.startsWith('/');

  // For assistant responses, try structured rendering
  const structuredResult = !isUser ? (
    <CommandResult text={message.content || ''} />
  ) : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[92%] sm:max-w-[75%] ${
        isUser
          ? isSlashCommand
            ? 'bg-purple-600/80 text-white rounded-2xl rounded-br-md border border-purple-500/30'
            : 'bg-blue-600 text-white rounded-2xl rounded-br-md'
          : 'bg-slate-800 text-slate-200 rounded-2xl rounded-bl-md border border-slate-700'
      } px-3.5 py-2.5`}>
        {/* Structured command result (if detected) */}
        {structuredResult}

        {/* Text content */}
        <div className="text-sm whitespace-pre-wrap break-words">
          {isSlashCommand && (
            <span className="font-mono text-purple-200">{message.content}</span>
          )}
          {!isSlashCommand && message.content}
        </div>

        {/* Tool usage */}
        {message.toolUse && message.toolUse.length > 0 && (
          <div className="mt-2">
            {message.toolUse.map((tool, i) => (
              <ToolCard
                key={i}
                tool={tool.name || tool.tool}
                input={tool.input}
                output={tool.output}
              />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className={`text-[11px] mt-1 ${isUser ? 'text-blue-200' : 'text-slate-500'}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
