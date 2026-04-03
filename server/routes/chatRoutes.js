import { Router } from 'express';
import { getChatSessionStore } from '../modules/chatSessionStore.js';
import { getClaudeRunner } from '../modules/claudeRunner.js';
import { getSSHPool } from '../modules/sshPool.js';
import { listProjects as listConfigProjects } from '../modules/configLoader.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const MODELS = [
  { id: 'sonnet', name: 'Claude Sonnet 4.5', default: true, contextWindow: 200000 },
  { id: 'opus', name: 'Claude Opus 4.6', contextWindow: 200000 },
  { id: 'haiku', name: 'Claude Haiku 4.5', contextWindow: 200000 },
  { id: 'sonnet[1m]', name: 'Claude Sonnet 4.5 (1M)', contextWindow: 1000000 },
  { id: 'opus[1m]', name: 'Claude Opus 4.6 (1M)', contextWindow: 1000000 }
];

// GET /api/chat/models
router.get('/models', (req, res) => {
  res.json({ models: MODELS });
});

// GET /api/chat/commands - List available slash commands, skills, agents
router.get('/commands', (req, res) => {
  res.json({
    sessionCommands: [
      { id: 'compact', name: '/compact', description: 'Compress conversation context (~70% token reduction)', category: 'session' },
      { id: 'cost', name: '/cost', description: 'Show API usage costs for this session', category: 'session' },
      { id: 'context', name: '/context', description: 'Show context window token usage', category: 'session' },
      { id: 'clear', name: '/clear', description: 'Clear conversation and start fresh', category: 'session' },
      { id: 'help', name: '/help', description: 'Show available commands and help', category: 'session' },
      { id: 'release-notes', name: '/release-notes', description: 'View Claude Code changelog', category: 'session' },
      { id: 'refresh-skills', name: '/refresh-skills', description: '🔄 Reload skills from server (force refresh)', category: 'session' }
    ],
    skills: [
      // Superpower workflow
      { id: 'superpower:brainstorm', name: '/superpower:brainstorm', description: 'Explore requirements and design before implementation', category: 'skill' },
      { id: 'superpower:write-plan', name: '/superpower:write-plan', description: 'Convert design into TDD implementation plan', category: 'skill' },
      { id: 'superpower:execute-plan', name: '/superpower:execute-plan', description: 'Execute implementation plans with review checkpoints', category: 'skill' },
      { id: 'superpower:tdd', name: '/superpower:tdd', description: 'Test-Driven Development (RED-GREEN-REFACTOR)', category: 'skill' },
      { id: 'superpower:subagent-dev', name: '/superpower:subagent-dev', description: 'Parallel subagent implementation + dual review', category: 'skill' },
      { id: 'superpower:finish-branch', name: '/superpower:finish-branch', description: 'Finish a dev branch (verify tests → merge/PR options)', category: 'skill' },
      { id: 'superpower:code-review', name: '/superpower:code-review', description: 'Request code review (spec compliance + quality)', category: 'skill' },
      { id: 'superpower:debug', name: '/superpower:debug', description: 'Systematic debugging with root cause analysis', category: 'skill' },

      // Code quality
      { id: 'code-review-expert', name: '/code-review-expert', description: 'SOLID audit + security scan + structured severity (P0-P3)', category: 'skill' },
      { id: 'react-best-practices', name: '/react-best-practices', description: 'Vercel React/Next.js performance best practices', category: 'skill' },
      { id: 'simplify', name: '/simplify', description: 'Review changed code for reuse, quality, efficiency', category: 'skill' },

      // OpenSpec (OPSX)
      { id: 'opsx:new', name: '/opsx:new', description: 'Start a new change', category: 'skill' },
      { id: 'opsx:propose', name: '/opsx:propose', description: 'Propose a change with all artifacts', category: 'skill' },
      { id: 'opsx:continue', name: '/opsx:continue', description: 'Continue working on a change', category: 'skill' },
      { id: 'opsx:ff', name: '/opsx:ff', description: 'Fast-forward through artifact creation', category: 'skill' },
      { id: 'opsx:apply', name: '/opsx:apply', description: 'Implement tasks from a change', category: 'skill' },
      { id: 'opsx:verify', name: '/opsx:verify', description: 'Verify implementation matches artifacts', category: 'skill' },
      { id: 'opsx:archive', name: '/opsx:archive', description: 'Archive a completed change', category: 'skill' },
      { id: 'opsx:bulk-archive', name: '/opsx:bulk-archive', description: 'Archive multiple changes', category: 'skill' },
      { id: 'opsx:sync', name: '/opsx:sync', description: 'Sync delta specs to main specs', category: 'skill' },
      { id: 'opsx:explore', name: '/opsx:explore', description: 'Think through ideas before/during a change', category: 'skill' },
      { id: 'opsx:onboard', name: '/opsx:onboard', description: 'Guided OpenSpec onboarding', category: 'skill' },

      // UI/UX & Design
      { id: 'ui-ux-pro-max', name: '/ui-ux-pro-max', description: 'UI/UX design intelligence (50 styles, 9 stacks, charts, palettes)', category: 'skill' },

      // API Development
      { id: 'claude-api', name: '/claude-api', description: 'Build apps with Claude API / Anthropic SDK', category: 'skill' },

      // Automation
      { id: 'loop', name: '/loop', description: 'Run a command on a recurring interval', category: 'skill' },

      // Debugging force
      { id: 'pua:pua', name: '/pua:pua', description: 'Push harder when stuck on errors', category: 'skill' },
      { id: 'pua:pua-debugging', name: '/pua:pua-debugging', description: 'Exhaustive debugging methodology', category: 'skill' },

      // Tools
      { id: 'keybindings-help', name: '/keybindings-help', description: 'Customize keyboard shortcuts', category: 'skill' },
      { id: 'debug', name: '/debug', description: 'Debug skill', category: 'skill' }
    ],
    agents: [
      { id: 'general-purpose', name: 'General Purpose', description: 'Multi-step tasks, research, code execution', category: 'agent' },
      { id: 'Explore', name: 'Explore', description: 'Fast codebase search and exploration', category: 'agent' },
      { id: 'Plan', name: 'Plan', description: 'Software architect for implementation plans', category: 'agent' },
      { id: 'Bash', name: 'Bash', description: 'Command execution specialist', category: 'agent' }
    ]
  });
});

// GET /api/chat/skills - Return available skills (dynamic per server)
router.get('/skills', async (req, res) => {
  const { serverIp } = req.query;

  try {
    // Feature flag: Enable dynamic SSH detection (set DYNAMIC_SKILLS=true in .env to activate)
    const useDynamicDetection = process.env.DYNAMIC_SKILLS === 'true';

    if (useDynamicDetection && serverIp) {
      // Future: Dynamic SSH-based detection
      const skills = await getSkillsFromSSH(serverIp);
      res.json({ skills });
    } else {
      // Current: Static comprehensive list (29 skills)
      res.json({ skills: getStaticSkills() });
    }
  } catch (err) {
    console.error('[Skills] Error loading skills:', err.message);
    // Fallback to static list on error
    res.json({ skills: getStaticSkills() });
  }
});

// GET /api/chat/mcp-tools - Discover MCP servers from remote server
router.get('/mcp-tools', async (req, res) => {
  const { serverIp } = req.query;
  if (!serverIp) {
    return res.status(400).json({ error: 'serverIp query param is required' });
  }

  try {
    const pool = getSSHPool();
    const mcpConfigRaw = await pool.exec(serverIp,
      'cat ~/.claude/mcp_settings.json 2>/dev/null || echo "{}"',
      { timeout: 5000 }
    );

    const mcpConfig = JSON.parse(mcpConfigRaw.trim());
    const servers = mcpConfig.mcpServers || {};

    const tools = Object.entries(servers).map(([name, config]) => ({
      name,
      command: config.command,
      args: config.args || [],
      description: getMCPDescription(name),
      status: 'available'
    }));

    res.json({ tools });
  } catch (err) {
    console.error('[MCP Tools] Error reading MCP config:', err.message);
    res.json({ tools: [] });
  }
});

// ============================================================================
// SKILLS DETECTION SYSTEM
// ============================================================================
//
// Architecture:
//   1. getStaticSkills() - Comprehensive static list (29 skills)
//   2. getSkillsFromSSH(serverIp) - Future: Dynamic SSH detection (framework ready)
//   3. Feature flag: DYNAMIC_SKILLS=true in .env to enable SSH detection
//
// To enable dynamic detection in the future:
//   - Set DYNAMIC_SKILLS=true in .env
//   - Implement getSkillsFromSSH() logic below
//   - All other code remains unchanged
// ============================================================================

/**
 * Get skills from remote server via SSH (FUTURE IMPLEMENTATION)
 *
 * When implementing:
 * 1. Read skill directories: `ls -1 ~/.claude/skills/`
 * 2. Parse SKILL.md files for metadata
 * 3. Convert to command format (e.g., "superpower-tdd" → "/superpower:tdd")
 * 4. Return array matching getStaticSkills() format
 *
 * @param {string} serverIp - Target server IP
 * @returns {Promise<Array>} Skills list
 */
async function getSkillsFromSSH(serverIp) {
  const pool = getSSHPool();

  try {
    console.log(`[SSH Skills] Reading skills from ${serverIp}...`);

    // Try using 'claude skills list' first (includes plugin skills)
    try {
      const cliOutput = await pool.exec(serverIp,
        'cd ~/.claude/projects/-home-ubuntu-agent-skill 2>/dev/null && claude skills list 2>&1 || claude skills list 2>&1',
        { timeout: 10000 }
      );

      const trimmedCli = cliOutput.trim();
      console.log(`[SSH Skills] claude CLI output (first 200 chars): ${trimmedCli.substring(0, 200)}`);

      if (trimmedCli && !trimmedCli.includes('command not found') && !trimmedCli.includes('No such file')) {
        // Parse output: extract skill names from lines like "  skill-name · description"
        const skillNames = [];
        const lines = trimmedCli.split('\n');

        for (const line of lines) {
          // Match lines starting with 2 spaces followed by skill name
          const match = line.match(/^  ([a-z0-9-]+(?::[a-z0-9-]+)?)/);
          if (match) {
            skillNames.push(match[1]);
          }
        }

        console.log(`[SSH Skills] Parsed ${skillNames.length} skills from claude CLI output`);

        if (skillNames.length > 0) {
          const skills = skillNames.map(name => ({
            id: name,
            name: `/${name}`,
            description: `Skill: ${name}`,
            category: 'skill'
          }));

          console.log(`[SSH Skills] Found ${skills.length} skills from ${serverIp} (via claude CLI - includes plugins)`);
          return skills;
        }
      }
      console.log(`[SSH Skills] claude CLI returned no usable skills, falling back to directory scan`);
    } catch (cliErr) {
      console.log(`[SSH Skills] claude CLI error: ${cliErr.message}, falling back to directory scan`);
    }

    // Fallback: Read skill directories from ALL possible locations
    // 1. User skills: ~/.claude/skills/ (global user skills)
    // 2. Project skills: /home/ubuntu/.claude/skills/ (absolute)
    // 3. Project-specific skills: find in common project locations
    const skillDirs = await pool.exec(serverIp,
      '(ls -1 ~/.claude/skills/ 2>/dev/null; ls -1 /home/ubuntu/.claude/skills/ 2>/dev/null; find /home/ubuntu -maxdepth 3 -type d -name skills -path "*/.claude/skills" 2>/dev/null | while read dir; do ls -1 "$dir" 2>/dev/null; done) | sort -u',
      { timeout: 10000 }
    );

    const trimmed = skillDirs.trim();
    if (!trimmed) {
      console.log('[SSH Skills] No skills directory found, using static list');
      return getStaticSkills();
    }

    // Parse directories to skill commands
    const skillNames = trimmed.split('\n')
      .filter(Boolean)
      .filter(dir => !dir.startsWith('.')); // Skip hidden dirs

    const skills = skillNames.map(dirName => {
      // Convert directory name to command format
      // Examples:
      //   "superpower-tdd" → "superpower:tdd"
      //   "openspec-new-change" → "openspec-new-change"
      //   "pua-debugging" → "pua:debugging"

      let cmdName = dirName;

      // Special handling for known patterns
      if (dirName.startsWith('superpower-')) {
        cmdName = dirName.replace('superpower-', 'superpower:');
      } else if (dirName.startsWith('opsx-')) {
        cmdName = dirName.replace('opsx-', 'opsx:');
      } else if (dirName.startsWith('pua-')) {
        cmdName = dirName.replace('pua-', 'pua:');
      } else if (dirName.startsWith('openspec-')) {
        // openspec-new-change stays as /openspec-new-change
        cmdName = dirName;
      }

      return {
        id: cmdName,
        name: `/${cmdName}`,
        description: `Skill: ${cmdName}`,
        category: 'skill'
      };
    });

    console.log(`[SSH Skills] Found ${skills.length} skills from ${serverIp} (user + project combined)`);

    // Return dynamic list if found, otherwise fallback to static
    return skills.length > 0 ? skills : getStaticSkills();

  } catch (err) {
    console.error('[SSH Skills] Error reading skills:', err.message);
    return getStaticSkills(); // Safe fallback
  }
}

/**
 * Get static comprehensive skills list (29 skills)
 * This is the current implementation and fallback for SSH failures
 */
function getStaticSkills() {
  return [
    // Superpower workflow
    { id: 'superpower:brainstorm', name: '/superpower:brainstorm', description: 'Explore requirements and design before implementation', category: 'skill' },
    { id: 'superpower:write-plan', name: '/superpower:write-plan', description: 'Convert design into TDD implementation plan', category: 'skill' },
    { id: 'superpower:execute-plan', name: '/superpower:execute-plan', description: 'Execute implementation plans with review checkpoints', category: 'skill' },
    { id: 'superpower:tdd', name: '/superpower:tdd', description: 'Test-Driven Development (RED-GREEN-REFACTOR)', category: 'skill' },
    { id: 'superpower:subagent-dev', name: '/superpower:subagent-dev', description: 'Parallel subagent implementation + dual review', category: 'skill' },
    { id: 'superpower:finish-branch', name: '/superpower:finish-branch', description: 'Finish a dev branch (verify tests → merge/PR options)', category: 'skill' },
    { id: 'superpower:code-review', name: '/superpower:code-review', description: 'Request code review (spec compliance + quality)', category: 'skill' },
    { id: 'superpower:debug', name: '/superpower:debug', description: 'Systematic debugging with root cause analysis', category: 'skill' },

    // Code quality
    { id: 'code-review-expert', name: '/code-review-expert', description: 'SOLID audit + security scan + structured severity (P0-P3)', category: 'skill' },
    { id: 'react-best-practices', name: '/react-best-practices', description: 'Vercel React/Next.js performance best practices', category: 'skill' },
    { id: 'simplify', name: '/simplify', description: 'Review changed code for reuse, quality, efficiency', category: 'skill' },

    // OpenSpec (OPSX)
    { id: 'opsx:new', name: '/opsx:new', description: 'Start a new change', category: 'skill' },
    { id: 'opsx:propose', name: '/opsx:propose', description: 'Propose a change with all artifacts', category: 'skill' },
    { id: 'opsx:continue', name: '/opsx:continue', description: 'Continue working on a change', category: 'skill' },
    { id: 'opsx:ff', name: '/opsx:ff', description: 'Fast-forward through artifact creation', category: 'skill' },
    { id: 'opsx:apply', name: '/opsx:apply', description: 'Implement tasks from a change', category: 'skill' },
    { id: 'opsx:verify', name: '/opsx:verify', description: 'Verify implementation matches artifacts', category: 'skill' },
    { id: 'opsx:archive', name: '/opsx:archive', description: 'Archive a completed change', category: 'skill' },
    { id: 'opsx:bulk-archive', name: '/opsx:bulk-archive', description: 'Archive multiple changes', category: 'skill' },
    { id: 'opsx:sync', name: '/opsx:sync', description: 'Sync delta specs to main specs', category: 'skill' },
    { id: 'opsx:explore', name: '/opsx:explore', description: 'Think through ideas before/during a change', category: 'skill' },
    { id: 'opsx:onboard', name: '/opsx:onboard', description: 'Guided OpenSpec onboarding', category: 'skill' },

    // UI/UX & Design
    { id: 'ui-ux-pro-max', name: '/ui-ux-pro-max', description: 'UI/UX design intelligence (50 styles, 9 stacks, charts, palettes)', category: 'skill' },

    // API Development
    { id: 'claude-api', name: '/claude-api', description: 'Build apps with Claude API / Anthropic SDK', category: 'skill' },

    // Automation
    { id: 'loop', name: '/loop', description: 'Run a command on a recurring interval', category: 'skill' },

    // Debugging force
    { id: 'pua:pua', name: '/pua:pua', description: 'Push harder when stuck on errors', category: 'skill' },
    { id: 'pua:pua-debugging', name: '/pua:pua-debugging', description: 'Exhaustive debugging methodology', category: 'skill' },

    // Tools
    { id: 'keybindings-help', name: '/keybindings-help', description: 'Customize keyboard shortcuts', category: 'skill' },
    { id: 'debug', name: '/debug', description: 'Debug skill', category: 'skill' }
  ];
}


// Helper: Map MCP server names to human-readable descriptions
function getMCPDescription(name) {
  const descriptions = {
    'mcp-obsidian': 'Access and search Obsidian vault notes',
    'chrome-devtools': 'Browser automation and DevTools control',
    'mcp-filesystem': 'File system operations',
    'mcp-github': 'GitHub API integration',
    'mcp-slack': 'Slack messaging integration',
    'mcp-postgres': 'PostgreSQL database access',
    'mcp-sqlite': 'SQLite database operations',
    'mcp-fetch': 'HTTP fetch and web scraping',
    'mcp-memory': 'Persistent memory storage',
    'mcp-puppeteer': 'Headless browser automation',
    'mcp-brave-search': 'Brave search engine API',
    'mcp-google-maps': 'Google Maps API',
    'mcp-everart': 'AI image generation',
    'mcp-sequential-thinking': 'Step-by-step reasoning tool'
  };
  return descriptions[name] || `MCP server: ${name}`;
}

// GET /api/chat/servers
router.get('/servers', (req, res) => {
  try {
    const configPath = process.env.SERVERS_CONFIG_PATH ||
      path.join(__dirname, '../config/servers.json');
    const servers = JSON.parse(readFileSync(configPath, 'utf-8'));
    res.json({
      servers: servers.map(s => ({
        ip: s.ip,
        alias: s.alias,
        hostname: s.hostname
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/sessions
router.get('/sessions', (req, res) => {
  const store = getChatSessionStore();
  const sessions = store.list().map(s => ({
    id: s.id,
    sessionName: s.sessionName,
    serverIp: s.serverIp,
    model: s.model,
    type: s.type || 'general',
    status: s.status,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    messageCount: s.messageCount
  }));
  res.json({ sessions });
});

// POST /api/chat/sessions
router.post('/sessions', (req, res) => {
  const { serverIp, model, sessionName, allowedTools, systemPrompt, type } = req.body;
  if (!serverIp) {
    return res.status(400).json({ error: 'serverIp is required' });
  }

  const store = getChatSessionStore();
  const session = store.create({ serverIp, model, sessionName, allowedTools, systemPrompt, type });
  res.json({
    id: session.id,
    sessionName: session.sessionName,
    type: session.type,
    status: session.status
  });
});

// Deep Clean system prompt
const DEEP_CLEAN_SYSTEM_PROMPT = `你是磁碟清理專家。你的職責是：
1. 分析磁碟使用狀況，找出佔用空間最大的目錄和檔案
2. 建議安全的清理策略
3. 執行清理操作前，總是先顯示要刪除的內容和預估可釋放的空間
4. 每次操作後報告清理前/後的磁碟使用對比

重要安全規則：
- 永遠不要刪除 /home/ubuntu 下的原始碼目錄（如 agent-skill, system-monitor, k8s-auto-deployer-fastapi 等）
- 永遠不要刪除 .env、credentials.json、token.json 等敏感檔案
- Docker 清理只刪除 dangling images 和停止的 containers
- 刪除前必須列出要刪除的檔案清單讓使用者確認
- 使用 df -h 顯示磁碟使用統計

常用診斷指令：
- df -h /
- du -sh /* 2>/dev/null | sort -rh | head -20
- find / -xdev -size +100M -type f 2>/dev/null | head -20
- docker system df
- journalctl --disk-usage`;

// POST /api/chat/sessions/deep-clean — Create or get deep-clean session
router.post('/sessions/deep-clean', (req, res) => {
  const store = getChatSessionStore();

  // Find existing non-archived deep-clean session
  const existing = store.list().find(s => s.type === 'deep-clean' && s.status !== 'archived');
  if (existing) {
    return res.json({
      id: existing.id,
      sessionName: existing.sessionName,
      type: existing.type,
      model: existing.model,
      status: existing.status,
      isNew: false
    });
  }

  // Get first available server
  const configPath = process.env.SERVERS_CONFIG_PATH || path.join(__dirname, '../config/servers.json');
  let servers = [];
  try { servers = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
  const serverIp = req.body.serverIp || servers[0]?.ip;
  if (!serverIp) {
    return res.status(400).json({ error: 'No server available' });
  }

  const session = store.create({
    serverIp,
    model: 'opus[1m]',
    sessionName: 'Deep Clean',
    allowedTools: ['Bash', 'Read', 'Glob', 'Grep'],
    systemPrompt: DEEP_CLEAN_SYSTEM_PROMPT,
    type: 'deep-clean'
  });

  res.json({
    id: session.id,
    sessionName: session.sessionName,
    type: session.type,
    model: session.model,
    status: session.status,
    isNew: true
  });
});

// ============================================================
// Project Sessions — persistent, named project workspaces
// ============================================================

// Default project definitions
const DEFAULT_PROJECTS = [
  {
    slug: 'neuropack',
    name: 'NeuroPack',
    emoji: '🧠',
    model: 'opus[1m]',
    systemPrompt: `你是 NeuroPack 專案的專屬開發助手。NeuroPack 是一個 AI/ML 工具包專案。
你的職責是：
1. 熟悉並追蹤 NeuroPack 的架構、代碼和進度
2. 協助開發、除錯、測試和部署
3. 維護專案的技術上下文，讓開發者不需要每次重新解釋

首次開啟時，請先回顧專案目錄結構和最近的 git 歷史來建立上下文。`,
    reviewPrompt: `請回顧 NeuroPack 專案的現況：
1. 找到專案根目錄（搜尋 ~/NeuroPack 或類似路徑）
2. ls 查看目錄結構
3. git log --oneline -10 查看最近提交
4. 讀取 README.md 或主要入口檔案了解專案概況
5. 總結專案現狀和可能的下一步工作`
  },
  {
    slug: 'richs',
    name: 'Richs',
    emoji: '💰',
    model: 'opus[1m]',
    systemPrompt: `你是 Richs (AI Investment Platform) 專案的專屬開發助手。
專案路徑：~/agent-skill/ai-investment-platform
前端：Next.js (app router) → https://richs.ko.unieai.com
後端：FastAPI → https://api-richs.ko.unieai.com
K8s namespace: deployer-dev

你的職責是：
1. 熟悉並追蹤 Richs 平台的前後端架構和進度
2. 協助開發、除錯、測試和部署
3. 維護專案的技術上下文，讓開發者不需要每次重新解釋

首次開啟時，請先回顧專案結構和最近的 git 歷史來建立上下文。`,
    reviewPrompt: `請回顧 Richs AI Investment Platform 的現況：
1. ls ~/agent-skill/ai-investment-platform/ 查看目錄結構
2. git -C ~/agent-skill/ai-investment-platform log --oneline -10 查看最近提交
3. git -C ~/agent-skill/ai-investment-platform status --short 查看未提交的變更
4. kubectl get pods -n deployer-dev | grep -E "(frontend|backend)" 查看部署狀態
5. 總結專案現狀和可能的下一步工作`
  }
];

// GET /api/chat/projects — List available projects
router.get('/projects', (req, res) => {
  const store = getChatSessionStore();
  const allSessions = store.list();

  // Build project list from defaults + user-created projects
  const projects = [];

  // Add default projects
  for (const proj of DEFAULT_PROJECTS) {
    const session = allSessions.find(s => s.type === `project-${proj.slug}` && s.status !== 'archived');
    projects.push({
      slug: proj.slug,
      name: proj.name,
      emoji: proj.emoji,
      sessionId: session?.id || null,
      hasSession: !!session,
      messageCount: session?.messageCount || 0,
      lastActivity: session?.lastActivity || null,
      isDefault: true
    });
  }

  // Add Deep Clean as a project too
  const deepCleanSession = allSessions.find(s => s.type === 'deep-clean' && s.status !== 'archived');
  projects.push({
    slug: 'deep-clean',
    name: 'Deep Clean',
    emoji: '🧹',
    sessionId: deepCleanSession?.id || null,
    hasSession: !!deepCleanSession,
    messageCount: deepCleanSession?.messageCount || 0,
    lastActivity: deepCleanSession?.lastActivity || null,
    isDefault: true
  });

  // Add user-created projects
  const userProjects = allSessions.filter(s =>
    s.type?.startsWith('project-') &&
    !DEFAULT_PROJECTS.some(d => s.type === `project-${d.slug}`) &&
    s.status !== 'archived'
  );
  for (const s of userProjects) {
    const slug = s.type.replace('project-', '');
    projects.push({
      slug,
      name: s.sessionName,
      emoji: '📁',
      sessionId: s.id,
      hasSession: true,
      messageCount: s.messageCount || 0,
      lastActivity: s.lastActivity || null,
      isDefault: false
    });
  }

  res.json({ projects });
});

// GET /api/chat/projects/config — Show config injection status per project
router.get('/projects/config', (req, res) => {
  try {
    const configs = listConfigProjects();
    res.json({ configs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/projects/:slug/open — Open or create a project session
router.post('/projects/:slug/open', (req, res) => {
  const store = getChatSessionStore();
  const { slug } = req.params;

  // Check for existing session
  const sessionType = slug === 'deep-clean' ? 'deep-clean' : `project-${slug}`;
  const existing = store.list().find(s => s.type === sessionType && s.status !== 'archived');
  if (existing) {
    return res.json({
      id: existing.id,
      sessionName: existing.sessionName,
      type: existing.type,
      model: existing.model,
      status: existing.status,
      isNew: false
    });
  }

  // Handle deep-clean specially (reuse existing logic)
  if (slug === 'deep-clean') {
    const configPath = process.env.SERVERS_CONFIG_PATH || path.join(__dirname, '../config/servers.json');
    let servers = [];
    try { servers = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
    const serverIp = req.body.serverIp || servers[0]?.ip;
    if (!serverIp) return res.status(400).json({ error: 'No server available' });

    const session = store.create({
      serverIp,
      model: 'opus[1m]',
      sessionName: 'Deep Clean',
      allowedTools: ['Bash', 'Read', 'Glob', 'Grep'],
      systemPrompt: DEEP_CLEAN_SYSTEM_PROMPT,
      type: 'deep-clean'
    });
    return res.json({ id: session.id, sessionName: session.sessionName, type: session.type, model: session.model, status: session.status, isNew: true });
  }

  // Find default project definition
  const defaultProj = DEFAULT_PROJECTS.find(p => p.slug === slug);

  // Get server
  const configPath = process.env.SERVERS_CONFIG_PATH || path.join(__dirname, '../config/servers.json');
  let servers = [];
  try { servers = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
  const serverIp = req.body.serverIp || servers[0]?.ip;
  if (!serverIp) return res.status(400).json({ error: 'No server available' });

  const session = store.create({
    serverIp,
    model: defaultProj?.model || 'opus[1m]',
    sessionName: defaultProj?.name || req.body.name || slug,
    allowedTools: ['Read', 'Edit', 'Bash', 'Write', 'Glob', 'Grep'],
    systemPrompt: defaultProj?.systemPrompt || `你是 ${req.body.name || slug} 專案的專屬開發助手。首次開啟時，請先回顧專案結構和最近的 git 歷史來建立上下文。`,
    type: `project-${slug}`
  });

  res.json({
    id: session.id,
    sessionName: session.sessionName,
    type: session.type,
    model: session.model,
    status: session.status,
    isNew: true,
    reviewPrompt: defaultProj?.reviewPrompt || `請回顧 ${req.body.name || slug} 專案的現況：\n1. 找到專案根目錄\n2. ls 查看目錄結構\n3. git log --oneline -10 查看最近提交\n4. 總結專案現狀和可能的下一步工作`
  });
});

// POST /api/chat/projects — Create a new user project
router.post('/projects', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return res.status(400).json({ error: 'Invalid project name' });

  const store = getChatSessionStore();
  // Check if project already exists
  const existing = store.list().find(s => s.type === `project-${slug}` && s.status !== 'archived');
  if (existing) return res.status(409).json({ error: 'Project already exists', slug });

  res.json({ slug, name: name.trim() });
});

// PATCH /api/chat/sessions/:id
router.patch('/sessions/:id', (req, res) => {
  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const allowed = ['model', 'sessionName', 'allowedTools', 'systemPrompt'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const updated = store.update(req.params.id, updates);
  res.json({ success: true, session: updated });
});

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const runner = getClaudeRunner();
  await runner.stopSession(req.params.id);

  store.archive(req.params.id);
  res.json({ success: true });
});

// GET /api/chat/sessions/:id/history
router.get('/sessions/:id/history', (req, res) => {
  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  res.json({ messages: store.getMessages(req.params.id) });
});

// GET /api/chat/sessions/:id/context — Get context usage
router.get('/sessions/:id/context', async (req, res) => {
  try {
    const runner = getClaudeRunner();
    const contextInfo = await runner.getContext(req.params.id);

    if (!contextInfo) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(contextInfo);
  } catch (err) {
    console.error(`[API] Failed to get context for ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/sessions/:id/compact — Compact context
router.post('/sessions/:id/compact', async (req, res) => {
  try {
    const runner = getClaudeRunner();
    const result = await runner.compact(req.params.id);
    res.json(result);
  } catch (err) {
    console.error(`[API] Failed to compact ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/sessions/:id/message — SSE streaming response
// Accepts: { content: string, mode?: string, images?: Array<ImageContentBlock> }
// Images format: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }]
router.post('/sessions/:id/message', async (req, res) => {
  const { content, mode, images } = req.body;
  if (!content && (!images || images.length === 0)) {
    return res.status(400).json({ error: 'content or images is required' });
  }

  const store = getChatSessionStore();
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Store mode in session for future reference
  if (mode) {
    store.update(req.params.id, { mode });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const runner = getClaudeRunner();
    const emitter = await runner.sendMessage(req.params.id, content || '', { mode, images });

    emitter.on('data', (event) => {
      res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      // Flush immediately to prevent proxy/buffer delays
      if (typeof res.flush === 'function') res.flush();
    });

    emitter.on('error', (err) => {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      res.end();
    });

    emitter.on('end', () => {
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      emitter.removeAllListeners();
    });

  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/chat/sessions/:id/stop
router.post('/sessions/:id/stop', async (req, res) => {
  try {
    const runner = getClaudeRunner();
    await runner.stopSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/sessions/:id/health
router.get('/sessions/:id/health', async (req, res) => {
  try {
    const runner = getClaudeRunner();
    const health = await runner.checkHealth(req.params.id);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
