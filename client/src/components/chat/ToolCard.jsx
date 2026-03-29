import React, { useState } from 'react';

function ToolCard({ tool, input, output, status }) {
  const [expanded, setExpanded] = useState(false);

  const toolIcons = {
    Read: '\uD83D\uDCC4', Edit: '\u270F\uFE0F', Write: '\uD83D\uDCDD',
    Bash: '\uD83D\uDDA5\uFE0F', Glob: '\uD83D\uDD0D', Grep: '\uD83D\uDD0E',
    WebSearch: '\uD83C\uDF10', WebFetch: '\uD83C\uDF10', Task: '\uD83D\uDCCB',
    TodoWrite: '\u2705'
  };

  const isRunning = status === 'running';

  // Derive a short summary for the tool input
  let inputSummary = '';
  if (input?.file_path) {
    inputSummary = input.file_path.split('/').pop();
  } else if (input?.command) {
    inputSummary = '$ ' + input.command.substring(0, 50);
  } else if (input?.pattern) {
    inputSummary = input.pattern;
  } else if (input?.query) {
    inputSummary = input.query.substring(0, 50);
  }

  return (
    <div className={`my-1 border rounded-lg overflow-hidden transition-colors ${
      isRunning
        ? 'border-blue-500/60 bg-blue-950/20'
        : 'border-slate-700 bg-slate-800/30'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs sm:text-sm btn-inline"
      >
        {/* Status indicator */}
        {isRunning ? (
          <span className="shrink-0 h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="shrink-0">{toolIcons[tool] || '\uD83D\uDD27'}</span>
        )}

        <span className={`font-medium ${isRunning ? 'text-blue-300' : 'text-slate-300'}`}>{tool}</span>

        {inputSummary && (
          <span className="text-slate-500 truncate flex-1 font-mono text-[11px] sm:text-xs">
            {inputSummary}
          </span>
        )}

        {/* Expand indicator (only when there's output) */}
        {(output || (input && Object.keys(input).length > 0)) && (
          <span className="text-slate-500 shrink-0 text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-700 max-h-56 overflow-y-auto">
          {/* Input details */}
          {input && Object.keys(input).length > 0 && (
            <div className="px-3 py-1.5 bg-slate-900/30">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Input</div>
              <pre className="text-[11px] sm:text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
                {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {/* Output */}
          {output && (
            <div className="px-3 py-1.5 bg-slate-900/50 border-t border-slate-700/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Output</div>
              <pre className="text-[11px] sm:text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCard;
