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
const PROJECTS_BASE_DIR = '/home/ubuntu';

// Known project root directories (can be extended dynamically)
const KNOWN_PROJECT_ROOTS = {
  'agent-skill': '/home/ubuntu/agent-skill',
  'richs': '/home/ubuntu/agent-skill/ai-investment-platform',
  'neuropack': '/home/ubuntu/agent-skill/NeuroPack',
};

/**
 * Auto-discover project root from session type.
 * Searches common locations for project directories.
 */
function findProjectRoot(projectSlug) {
  // Check known projects first
  if (KNOWN_PROJECT_ROOTS[projectSlug]) {
    return KNOWN_PROJECT_ROOTS[projectSlug];
  }

  // Handle paths with slashes (e.g., "agent-skill/NeuroPack")
  if (projectSlug.includes('/')) {
    const fullPath = path.join(PROJECTS_BASE_DIR, projectSlug);
    if (existsSync(fullPath)) return fullPath;
  }

  // Auto-discover: try common patterns
  const possiblePaths = [
    path.join(PROJECTS_BASE_DIR, projectSlug),
    path.join(PROJECTS_BASE_DIR, 'agent-skill', projectSlug),
    path.join(PROJECTS_BASE_DIR, projectSlug + '-project'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) return p;
  }

  // Fallback to agent-skill
  return KNOWN_PROJECT_ROOTS['agent-skill'];
}

/**
 * Auto-discover project memory directory from project root path.
 * Uses Claude's standard memory directory naming convention.
 */
function findProjectMemoryDir(projectRoot) {
  if (!projectRoot) return null;

  // Convert project root to Claude memory dir format
  // e.g., /home/ubuntu/agent-skill → -home-ubuntu-agent-skill
  const memorySlug = projectRoot.replace(/\//g, '-');
  const memDir = path.join(CLAUDE_DIR, 'projects', memorySlug, 'memory');

  return existsSync(memDir) ? memDir : null;
}

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
 * Read memory files (MEMORY.md + instincts.md) from project root path
 */
function loadProjectMemory(projectRoot) {
  const memDir = findProjectMemoryDir(projectRoot);
  if (!memDir) return '';

  const parts = [];
  const memory = safeRead(path.join(memDir, 'MEMORY.md'));
  if (memory) parts.push(`# Project Memory\n\n${memory}`);

  const instincts = safeRead(path.join(memDir, 'instincts.md'));
  if (instincts) parts.push(`# Learned Instincts\n\n${instincts}`);

  return parts.join('\n\n---\n\n');
}

/**
 * Extract project slug from session type
 */
function extractProjectSlug(sessionType) {
  if (!sessionType) return 'agent-skill';
  if (sessionType === 'deep-clean') return 'agent-skill';
  if (sessionType.startsWith('project-')) {
    return sessionType.replace('project-', '');
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
  const projectSlug = extractProjectSlug(sessionType);
  const projectRoot = findProjectRoot(projectSlug);
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
  const projectSlug = extractProjectSlug(sessionType);
  return findProjectRoot(projectSlug);
}

/**
 * List available project keys and their roots.
 * Includes both known projects and auto-discovered projects from memory dirs.
 */
export function listProjects() {
  const projects = [];
  const seen = new Set();

  // Add known projects
  for (const [key, root] of Object.entries(KNOWN_PROJECT_ROOTS)) {
    const memDir = findProjectMemoryDir(root);
    projects.push({
      key,
      root,
      hasClaudeMd: existsSync(path.join(root, 'CLAUDE.md')),
      hasMemory: !!memDir,
      rulesCount: loadGlobalRules().length,
    });
    seen.add(key);
  }

  // Auto-discover projects from memory dirs
  try {
    const projectsDir = path.join(CLAUDE_DIR, 'projects');
    if (existsSync(projectsDir)) {
      const memoryDirs = readdirSync(projectsDir);
      for (const dirName of memoryDirs) {
        const memDir = path.join(projectsDir, dirName, 'memory');
        if (!existsSync(memDir)) continue;

        // Convert memory dir name to project slug
        // Standard format: -home-ubuntu-path-to-project
        // Extract everything after /home/ubuntu/
        const match = dirName.match(/-home-ubuntu-(.+)$/);
        if (!match) continue;

        const slug = match[1]; // e.g., "agent-skill" or "ai-investment-platform"
        if (seen.has(slug)) continue; // Skip if already listed

        const projectRoot = findProjectRoot(slug);
        projects.push({
          key: slug,
          root: projectRoot,
          hasClaudeMd: existsSync(path.join(projectRoot, 'CLAUDE.md')),
          hasMemory: true,
          rulesCount: loadGlobalRules().length,
          discovered: true, // Flag for auto-discovered projects
        });
        seen.add(slug);
      }
    }
  } catch { /* ignore discovery errors */ }

  return projects;
}
