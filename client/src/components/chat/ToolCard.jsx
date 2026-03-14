import React, { useState } from 'react';

function ToolCard({ tool, input, output }) {
  const [expanded, setExpanded] = useState(false);

  const toolIcons = {
    Read: '📄', Edit: '✏️', Write: '📝',
    Bash: '🖥️', Glob: '🔍', Grep: '🔎'
  };

  return (
    <div className="my-1.5 border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/50 text-left text-xs sm:text-sm btn-inline"
      >
        <span>{toolIcons[tool] || '🔧'}</span>
        <span className="font-medium text-slate-300">{tool}</span>
        {input?.file_path && (
          <span className="text-slate-500 truncate flex-1 font-mono text-[10px] sm:text-xs">
            {input.file_path.split('/').pop()}
          </span>
        )}
        {input?.command && (
          <span className="text-slate-500 truncate flex-1 font-mono text-[10px] sm:text-xs">
            $ {input.command.substring(0, 40)}
          </span>
        )}
        <span className="text-slate-500 shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && output && (
        <div className="px-3 py-2 bg-slate-900/50 border-t border-slate-700 max-h-48 overflow-y-auto">
          <pre className="text-[10px] sm:text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
            {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ToolCard;
