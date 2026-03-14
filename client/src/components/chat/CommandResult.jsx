import React from 'react';

/**
 * Detects and renders structured responses for slash commands.
 * Falls back to null (render as normal text) if no pattern matches.
 */
function CommandResult({ text, command }) {
  // Try to detect command-like response patterns
  const costMatch = parseCostResponse(text);
  if (costMatch) return <CostCard {...costMatch} />;

  const contextMatch = parseContextResponse(text);
  if (contextMatch) return <ContextCard {...contextMatch} />;

  const compactMatch = parseCompactResponse(text);
  if (compactMatch) return <CompactCard {...compactMatch} />;

  // No structured format detected
  return null;
}

// --- Pattern Matchers ---

function parseCostResponse(text) {
  // Match patterns like: "Total cost: $0.15" or "cost_usd: 0.15" or "Cost: $0.0342"
  const costRegex = /(?:total\s*)?cost[:\s]*\$?([\d.]+)/i;
  const tokensRegex = /(?:tokens?\s*(?:used)?[:\s]*)([\d,]+)/i;
  const inputRegex = /input[:\s]*([\d,]+)/i;
  const outputRegex = /output[:\s]*([\d,]+)/i;

  const costMatch = text.match(costRegex);
  if (!costMatch) return null;

  return {
    cost: parseFloat(costMatch[1]),
    totalTokens: extractNum(text, tokensRegex),
    inputTokens: extractNum(text, inputRegex),
    outputTokens: extractNum(text, outputRegex)
  };
}

function parseContextResponse(text) {
  // Match: "45,234 / 200,000 tokens (22%)" or "Context: 45234/200000"
  const usageRegex = /([\d,]+)\s*\/\s*([\d,]+)\s*(?:tokens?)?\s*(?:\(([\d.]+)%\))?/i;
  const match = text.match(usageRegex);
  if (!match) return null;

  const used = parseInt(match[1].replace(/,/g, ''));
  const total = parseInt(match[2].replace(/,/g, ''));
  const percent = match[3] ? parseFloat(match[3]) : (used / total * 100);

  return { used, total, percent };
}

function parseCompactResponse(text) {
  // Match: "Compressed" or "compacted" with optional token numbers
  if (!/compact|compress/i.test(text)) return null;
  const beforeRegex = /(?:from|before)[:\s]*([\d,]+)/i;
  const afterRegex = /(?:to|after)[:\s]*([\d,]+)/i;

  return {
    before: extractNum(text, beforeRegex),
    after: extractNum(text, afterRegex),
    message: text
  };
}

function extractNum(text, regex) {
  const match = text.match(regex);
  return match ? parseInt(match[1].replace(/,/g, '')) : null;
}

// --- Card Components ---

function CostCard({ cost, totalTokens, inputTokens, outputTokens }) {
  return (
    <div className="bg-slate-800/80 border border-slate-600 rounded-xl p-3 sm:p-4 my-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">$</span>
        <span className="text-sm font-medium text-slate-300">Session Cost</span>
      </div>
      <div className="text-2xl font-bold text-emerald-400 mb-2">
        ${cost.toFixed(4)}
      </div>
      {totalTokens && (
        <div className="text-xs text-slate-400 space-y-0.5">
          {inputTokens && <div>Input: {inputTokens.toLocaleString()} tokens</div>}
          {outputTokens && <div>Output: {outputTokens.toLocaleString()} tokens</div>}
          <div>Total: {totalTokens.toLocaleString()} tokens</div>
        </div>
      )}
    </div>
  );
}

function ContextCard({ used, total, percent }) {
  const color = percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = percent > 80 ? 'text-red-400' : percent > 50 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="bg-slate-800/80 border border-slate-600 rounded-xl p-3 sm:p-4 my-1">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">&#x25CB;</span>
          <span className="text-sm font-medium text-slate-300">Context Window</span>
        </div>
        <span className={`text-sm font-bold ${textColor}`}>
          {percent.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2.5 bg-slate-700 rounded-full mb-2">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <div className="text-xs text-slate-400">
        {used.toLocaleString()} / {total.toLocaleString()} tokens
      </div>
    </div>
  );
}

function CompactCard({ before, after, message }) {
  const saved = before && after ? before - after : null;
  const percent = before && after ? ((saved / before) * 100).toFixed(0) : null;

  return (
    <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl p-3 sm:p-4 my-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">&#x21B3;</span>
        <span className="text-sm font-medium text-emerald-400">Context Compressed</span>
      </div>
      {saved && (
        <div className="text-xs text-slate-400 mt-1">
          {before.toLocaleString()} → {after.toLocaleString()} tokens
          <span className="text-emerald-400 ml-1">(-{percent}%)</span>
        </div>
      )}
    </div>
  );
}

export default CommandResult;
