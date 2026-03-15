import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Cache usage data to avoid hitting API too frequently
let usageCache = { data: null, timestamp: 0 };
const CACHE_TTL = 60 * 1000; // 1 minute cache

// History file for tracking usage over time
const HISTORY_FILE = path.join(__dirname, '..', 'data', 'usage-history.json');

function loadHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveHistory(history) {
  try {
    // Keep last 7 days of data (every 5 min = ~2016 entries)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trimmed = history.filter(h => h.timestamp > cutoff);
    writeFileSync(HISTORY_FILE, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[Usage] Failed to save history:', e.message);
  }
}

// Read OAuth token from credentials files on both servers
async function getOAuthTokens() {
  const tokens = [];
  const servers = [
    { name: 'Server A', host: 'local', path: '/home/ubuntu/.claude/.credentials.json' },
    { name: 'Server B', host: '18.181.190.83', path: '/home/ubuntu/.claude/.credentials.json' }
  ];

  for (const server of servers) {
    try {
      let content;
      if (server.host === 'local') {
        // Local server - read directly
        if (existsSync(server.path)) {
          content = readFileSync(server.path, 'utf-8');
        }
      } else {
        // Remote server via SSH
        try {
          const { stdout } = await execAsync(
            `ssh -i /root/.ssh/id_rsa -o ConnectTimeout=3 -o StrictHostKeyChecking=no ubuntu@${server.host} 'cat ${server.path}'`,
            { timeout: 5000 }
          );
          content = stdout;
        } catch (e) {
          // SSH failed, skip this server
        }
      }

      if (content) {
        const creds = JSON.parse(content);
        if (creds.claudeAiOauth?.accessToken) {
          tokens.push({
            server: server.name,
            token: creds.claudeAiOauth.accessToken,
            expiresAt: creds.claudeAiOauth.expiresAt,
            subscriptionType: creds.claudeAiOauth.subscriptionType,
            rateLimitTier: creds.claudeAiOauth.rateLimitTier
          });
        }
      }
    } catch (e) {
      console.error(`[Usage] Failed to read credentials for ${server.name}:`, e.message);
    }
  }

  return tokens;
}

// Fetch usage data from Anthropic API
async function fetchUsage(token) {
  const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json();
}

// GET /api/usage - Get current usage data
router.get('/', async (req, res) => {
  try {
    // Check cache
    if (usageCache.data && Date.now() - usageCache.timestamp < CACHE_TTL) {
      return res.json(usageCache.data);
    }

    const tokens = await getOAuthTokens();
    if (tokens.length === 0) {
      return res.status(503).json({ error: 'No OAuth credentials available' });
    }

    // Use first available token (they share the same account)
    const tokenInfo = tokens[0];
    const usage = await fetchUsage(tokenInfo.token);

    const now = Date.now();
    const result = {
      timestamp: now,
      subscription: tokenInfo.subscriptionType,
      rateLimitTier: tokenInfo.rateLimitTier,
      tokenExpires: tokenInfo.expiresAt,
      session: {
        utilization: usage.five_hour?.utilization || 0,
        resetsAt: usage.five_hour?.resets_at || null,
        label: 'Current session'
      },
      weekly: {
        utilization: usage.seven_day?.utilization || 0,
        resetsAt: usage.seven_day?.resets_at || null,
        label: 'All models (weekly)'
      },
      sonnet: {
        utilization: usage.seven_day_sonnet?.utilization || 0,
        resetsAt: usage.seven_day_sonnet?.resets_at || null,
        label: 'Sonnet only (weekly)'
      },
      opus: {
        utilization: usage.seven_day_opus?.utilization || 0,
        resetsAt: usage.seven_day_opus?.resets_at || null,
        label: 'Opus only (weekly)'
      },
      extraUsage: usage.extra_usage || null
    };

    // Update cache
    usageCache = { data: result, timestamp: now };

    // Record history
    const history = loadHistory();
    history.push({
      timestamp: now,
      session: result.session.utilization,
      weekly: result.weekly.utilization,
      sonnet: result.sonnet.utilization,
      opus: result.opus.utilization
    });
    saveHistory(history);

    res.json(result);
  } catch (error) {
    console.error('[Usage] Error fetching usage:', error.message);
    // Return cached data if available
    if (usageCache.data) {
      return res.json({ ...usageCache.data, stale: true });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/usage/history - Get usage history for charts
router.get('/history', (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '24');
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const history = loadHistory().filter(h => h.timestamp > cutoff);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
