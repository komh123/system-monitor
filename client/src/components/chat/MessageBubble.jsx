import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ToolCard from './ToolCard.jsx';

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isSlashCommand = isUser && message.content?.startsWith('/');
  const [expandedImage, setExpandedImage] = useState(null);

  // Markdown components for assistant messages
  const markdownComponents = useMemo(() => ({
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');

      if (!inline && (lang || codeString.includes('\n'))) {
        return (
          <div className="relative group my-2">
            {lang && (
              <div className="text-[10px] text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded-t border-b border-slate-700/50 font-mono">
                {lang}
              </div>
            )}
            <SyntaxHighlighter
              style={oneDark}
              language={lang || 'text'}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: lang ? '0 0 0.5rem 0.5rem' : '0.5rem',
                fontSize: '0.8rem',
                padding: '0.75rem',
              }}
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
            <button
              onClick={() => navigator.clipboard?.writeText(codeString)}
              className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] bg-slate-700/80 text-slate-300 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-600"
              title="Copy code"
            >
              Copy
            </button>
          </div>
        );
      }

      return (
        <code className="bg-slate-700/60 px-1 py-0.5 rounded text-[0.85em] text-pink-300" {...props}>
          {children}
        </code>
      );
    },
    // Links open in new tab
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
          {children}
        </a>
      );
    },
    // Tables
    table({ children }) {
      return (
        <div className="overflow-x-auto my-2">
          <table className="min-w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      );
    },
    th({ children }) {
      return <th className="border border-slate-600 bg-slate-700/50 px-2 py-1 text-left text-xs font-medium">{children}</th>;
    },
    td({ children }) {
      return <td className="border border-slate-700 px-2 py-1 text-xs">{children}</td>;
    },
    // Lists
    ul({ children }) {
      return <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>;
    },
    // Blockquote
    blockquote({ children }) {
      return <blockquote className="border-l-2 border-blue-500/50 pl-3 my-2 text-slate-400 italic">{children}</blockquote>;
    },
    // Headings
    h1({ children }) { return <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>; },
    h2({ children }) { return <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>; },
    h3({ children }) { return <h3 className="text-sm font-bold mt-2 mb-0.5">{children}</h3>; },
    // Horizontal rule
    hr() { return <hr className="my-2 border-slate-700" />; },
    // Paragraphs - no extra margin for tighter layout
    p({ children }) { return <p className="my-1">{children}</p>; },
  }), []);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`
        max-w-full w-full sm:max-w-[85%] sm:w-auto
        ${isUser
          ? isSlashCommand
            ? 'bg-purple-600/80 text-white rounded-2xl rounded-br-md border border-purple-500/30 sm:ml-auto'
            : 'bg-blue-600 text-white rounded-2xl rounded-br-md sm:ml-auto'
          : 'bg-slate-800 text-slate-200 rounded-2xl rounded-bl-md border border-slate-700 sm:mr-auto'
        } px-3 py-2.5 sm:px-3.5
      `}>
        {/* User images */}
        {isUser && message.hasImages && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {Array.from({ length: message.imageCount || 0 }).map((_, i) => (
              <div key={i} className="h-8 w-8 bg-blue-500/30 rounded flex items-center justify-center text-xs text-blue-200">
                {'\uD83D\uDDBC\uFE0F'}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="text-sm break-words overflow-hidden">
          {isSlashCommand && (
            <span className="font-mono text-purple-200">{message.content}</span>
          )}
          {!isSlashCommand && isUser && message.content}
          {!isUser && message.content && (
            <div className="prose-chat">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
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

      {/* Fullscreen image modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <img src={expandedImage} alt="Full size" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

export default MessageBubble;
