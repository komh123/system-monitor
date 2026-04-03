import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

/**
 * ConfigLoader — reads Claude Code Extension configuration files
 * (rules, CLAUDE.md, memory) and builds a composite system prompt.
 *
 * Designed to be extensible: each project can have its own config path.
 * The loader reads from the remote server's filesystem via SSH,
 * but since we're in the same host, we read directly.
 */

const CLAUDE_DIR = '/home/ubuntu/.claude';
const RULES_DIR = path.join(CLAUDE_DIR, 'rules');

// Project root directories — extensible registry
const PROJECT_ROOTS = {
  'agent-skill': '/home/ubuntu/agent-skill',
  'richs': '/home/ubuntu/agent-skill/ai-investment-platform',
  'neuropack': '/home/ubuntu/agent-skill/NeuroPack',
};

// Per-project memory directories
const PROJECT_MEMORY_DIRS = {
  'agent-skill': '/home/ubuntu/.claude/projects/-home-ubuntu-agent-skill/memory',
  'richs': '/home/ubuntu/.claude/projects/-home-ubuntu-agent-skill-ai-investment-platform/memory',
  'neuropack': '/home/ubuntu/.claude/projects/-home-ubuntu-agent-skill-NeuroPack/memory',
};

/**
 * Read a file safely, return empty string if missing
 */
function safeRead(filePath) {
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8').trim();
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * Read all .md files from the global rules directory
 */
function loadGlobalRules() {
  const rules = [];
  try {
    if (!existsSync(RULES_DIR)) return rules;
    const files = readdirSync(RULES_DIR).filter(f => f.endsWith('.md')).sort();
    for (const file of files) {
      const content = safeRead(path.join(RULES_DIR, file));
      if (content) {
        rules.push({ file, content });
      }
    }
  } catch { /* ignore */ }
  return rules;
}

/**
 * Read CLAUDE.md from a project root (if exists)
 */
function loadProjectClaudeMd(projectRoot) {
  if (!projectRoot) return '';
  // Check multiple possible locations
  for (const name of ['CLAUDE.md', 'claude.md', 'AGENTS.md']) {
    const content = safeRead(path.join(projectRoot, name));
    if (content) return content;
  }
  return '';
}

/**
 * Read memory files (MEMORY.md + instincts.md) from project memory dir
 */
function loadProjectMemory(projectKey) {
  const memDir = PROJECT_MEMORY_DIRS[projectKey];
  if (!memDir || !existsSync(memDir)) return '';

  const parts = [];
  const memory = safeRead(path.join(memDir, 'MEMORY.md'));
  if (memory) parts.push(`# Project Memory\n\n${memory}`);

  const instincts = safeRead(path.join(memDir, 'instincts.md'));
  if (instincts) parts.push(`# Learned Instincts\n\n${instincts}`);

  return parts.join('\n\n---\n\n');
}

/**
 * Detect which project a session type belongs to
 */
function detectProject(sessionType) {
  if (!sessionType) return 'agent-skill';
  if (sessionType === 'deep-clean') return 'agent-skill';
  if (sessionType.startsWith('project-')) {
    const slug = sessionType.replace('project-', '');
    if (slug === 'richs' || slug.includes('investment')) return 'richs';
    if (slug === 'neuropack' || slug.includes('neuro')) return 'neuropack';
  }
  return 'agent-skill';
}

/**
 * Build a full system prompt by composing:
 * 1. Base agentic prompt
 * 2. Global rules (common, typescript, python, devops)
 * 3. Project CLAUDE.md
 * 4. Project memory (MEMORY.md + instincts.md)
 * 5. Custom session system prompt (if any)
 *
 * @param {object} options
 * @param {string} options.sessionType - Session type (e.g., 'general', 'project-richs')
 * @param {string} options.customPrompt - Custom system prompt from session creation
 * @returns {string} Composed system prompt
 */
export function buildSystemPrompt({ sessionType, customPrompt } = {}) {
  const projectKey = detectProject(sessionType);
  const projectRoot = PROJECT_ROOTS[projectKey];
  const sections = [];

  // 1. Base agentic behavior
  sections.push(`# AI Assistant Configuration

你是一個 agentic AI 助手。你的工作模式：
1. 主動行動：收到任務後立即採取行動，不要等待用戶逐步指示。先分析問題，然後使用工具執行。
2. Web 搜尋：當問題涉及最新資訊、即時數據、新聞、價格、天氣等，主動使用 WebSearch 搜尋網路獲取最新資訊。不要憑記憶回答時效性問題。
3. 搜尋後總結時，附上來源連結。
4. 回答使用繁體中文，除非用戶用其他語言提問。
5. 回答要簡潔、有結構，善用 markdown 格式。
6. 當前日期：${new Date().toISOString().split('T')[0]}`);

  // 2. Global rules
  const rules = loadGlobalRules();
  if (rules.length > 0) {
    sections.push('# Global Coding Rules\n\n' +
      rules.map(r => `## ${r.file}\n\n${r.content}`).join('\n\n---\n\n'));
  }

  // 3. Project CLAUDE.md
  const claudeMd = loadProjectClaudeMd(projectRoot);
  if (claudeMd) {
    // Truncate if too long (context budget management)
    const maxClaudeMd = 8000;
    const truncated = claudeMd.length > maxClaudeMd
      ? claudeMd.substring(0, maxClaudeMd) + '\n\n... (truncated for context budget)'
      : claudeMd;
    sections.push(`# Project Instructions (CLAUDE.md)\n\n${truncated}`);
  }

  // 4. Project memory
  const memory = loadProjectMemory(projectKey);
  if (memory) {
    const maxMemory = 4000;
    const truncated = memory.length > maxMemory
      ? memory.substring(0, maxMemory) + '\n\n... (truncated for context budget)'
      : memory;
    sections.push(truncated);
  }

  // 5. Custom session prompt (from project definition or user)
  if (customPrompt) {
    sections.push(`# Session-Specific Instructions\n\n${customPrompt}`);
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Get the working directory for a project
 */
export function getProjectCwd(sessionType) {
  const projectKey = detectProject(sessionType);
  return PROJECT_ROOTS[projectKey] || '/home/ubuntu/agent-skill';
}

/**
 * List available project keys and their roots
 */
export function listProjects() {
  return Object.entries(PROJECT_ROOTS).map(([key, root]) => ({
    key,
    root,
    hasClaudeMd: existsSync(path.join(root, 'CLAUDE.md')),
    hasMemory: existsSync(PROJECT_MEMORY_DIRS[key] || ''),
    rulesCount: loadGlobalRules().length,
  }));
}
