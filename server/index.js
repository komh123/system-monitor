import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { readFileSync, existsSync, readFile, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import cron from 'node-cron';
import { getMonitorOrchestrator } from './modules/monitorOrchestrator.js';
import chatRoutes from './routes/chatRoutes.js';
import authRoutes from './routes/authRoutes.js';
import usageRoutes from './routes/usageRoutes.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Enable gzip/brotli compression for all responses
app.use(compression());
const PORT = process.env.PORT || 3000;
const METRICS_FILE = '/home/ubuntu/cpu-watchdog-metrics.json';
const LOG_FILE = '/home/ubuntu/cpu-watchdog.log';
const CONFIG_FILE = '/home/ubuntu/cpu-watchdog-config.json';

// CPU threshold configuration (in-memory, persists during container lifetime)
let warningThreshold = 80; // Default: 80% - Send email alert
let killThreshold = 95; // Default: 95% - Suggest termination
let alertEmail = ''; // Email address for alerts
let autoKillEnabled = false; // Default: Disabled - Auto-kill Claude processes
let lastAlertTime = {}; // Track last alert time per PID (cooldown)

// CPU sustained threshold tracking (prevent spike alerts)
const SUSTAINED_DURATION_MS = 2000; // 2 seconds
let cpuHistory = {}; // { pid: { firstExceededTime, lastCpu } }

// Email configuration (using environment variables)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// Send email alert for high CPU process
async function sendCpuAlert(pid, cpu, threshold) {
  if (!alertEmail || !process.env.SMTP_USER) {
    console.log(`Alert skipped (no email config): PID ${pid} at ${cpu}%`);
    return;
  }

  // Cooldown: Only send one alert per PID per hour
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  if (lastAlertTime[pid] && (now - lastAlertTime[pid]) < hourInMs) {
    console.log(`Alert cooldown: PID ${pid} already alerted recently`);
    return;
  }

  // Parse multiple email addresses (comma or semicolon separated)
  const emailList = alertEmail
    .split(/[,;]/)
    .map(e => e.trim())
    .filter(e => e.length > 0);

  if (emailList.length === 0) {
    console.log(`Alert skipped: No valid email addresses`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: emailList.join(', '), // Send to multiple recipients
      subject: `⚠️ High CPU Alert: Claude Process ${pid} at ${cpu}%`,
      html: `
        <h2>⚠️ High CPU Usage Alert</h2>
        <p>A Claude process has exceeded the warning threshold.</p>
        <ul>
          <li><strong>PID:</strong> ${pid}</li>
          <li><strong>CPU Usage:</strong> ${cpu}%</li>
          <li><strong>Warning Threshold:</strong> ${threshold}%</li>
          <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>You can monitor and manage this process at: <a href="https://monitor.ko.unieai.com">https://monitor.ko.unieai.com</a></p>
      `
    });
    lastAlertTime[pid] = now;
    console.log(`Email alert sent to ${emailList.length} recipient(s) for PID ${pid}`);
  } catch (error) {
    console.error('Failed to send email alert:', error.message);
  }
}

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/usage', usageRoutes);

// Serve static files in production with smart cache headers
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist'), {
    setHeaders: (res, filePath) => {
      // Hashed assets (e.g., /assets/index-CTawsT0u.js) — cache aggressively
      // These filenames change on every build, so cached versions are always valid
      if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      // sw.js and index.html — NEVER cache
      // Stale sw.js causes stale cache; stale index.html causes white screen
      if (filePath.endsWith('sw.js') || filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return;
      }
      // Everything else (manifest, icons) — short cache with revalidation
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }));
}

// Get system metrics from watchdog file
app.get('/api/metrics', async (req, res) => {
  try {
    let metrics;
    if (existsSync(METRICS_FILE)) {
      const data = readFileSync(METRICS_FILE, 'utf8');
      metrics = JSON.parse(data);
    } else {
      // Generate metrics on the fly if file doesn't exist
      metrics = await generateMetrics();
    }

    // Check for processes exceeding warning threshold and send alerts
    // Only send if CPU has been high for sustained duration (prevent spikes)
    const now = Date.now();
    if (metrics.processes?.claude?.length > 0) {
      const currentPids = new Set();

      for (const proc of metrics.processes.claude) {
        currentPids.add(proc.pid);

        if (proc.cpu >= warningThreshold) {
          // Track CPU history for this PID
          if (!cpuHistory[proc.pid]) {
            // First time exceeding threshold
            cpuHistory[proc.pid] = {
              firstExceededTime: now,
              lastCpu: proc.cpu
            };
          } else {
            // Update last CPU reading
            cpuHistory[proc.pid].lastCpu = proc.cpu;

            // Check if sustained for required duration
            const duration = now - cpuHistory[proc.pid].firstExceededTime;
            if (duration >= SUSTAINED_DURATION_MS) {
              // Send alert (with cooldown handled inside sendCpuAlert)
              sendCpuAlert(proc.pid, proc.cpu, warningThreshold).catch(err => {
                console.error(`Failed to send alert for PID ${proc.pid}:`, err);
              });
            }
          }
        } else {
          // CPU dropped below threshold, reset tracking
          delete cpuHistory[proc.pid];
        }
      }

      // Clean up history for processes that no longer exist
      for (const pid in cpuHistory) {
        if (!currentPids.has(parseInt(pid))) {
          delete cpuHistory[pid];
        }
      }
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error reading metrics:', error);
    res.status(500).json({ error: 'Failed to read metrics' });
  }
});

// Get recent watchdog logs
app.get('/api/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { stdout } = await execAsync(`tail -n ${limit} ${LOG_FILE} 2>/dev/null || echo "No logs yet"`);
    const logs = stdout.trim().split('\n').map(line => {
      const match = line.match(/\[(.*?)\] (.*)/);
      if (match) {
        return { timestamp: match[1], message: match[2] };
      }
      return { timestamp: '', message: line };
    });
    res.json(logs);
  } catch (error) {
    res.json([{ timestamp: '', message: 'No logs available' }]);
  }
});

// Kill a specific process
app.post('/api/processes/:pid/kill', async (req, res) => {
  try {
    const { pid } = req.params;
    // Validate PID is numeric
    if (!/^\d+$/.test(pid)) {
      return res.status(400).json({ error: 'Invalid PID' });
    }

    // Only allow killing claude processes (check command line for "native-binary/claude")
    const { stdout: cmdline } = await execAsync(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\000' ' ' || echo ""`);
    if (!cmdline.includes('native-binary/claude') && !cmdline.includes('claude --output-format')) {
      return res.status(403).json({ error: 'Can only kill Claude Code processes' });
    }

    await execAsync(`kill -TERM ${pid}`);
    res.json({ success: true, message: `Process ${pid} terminated` });
  } catch (error) {
    console.error('Failed to kill process:', error);
    res.status(500).json({ error: 'Failed to kill process: ' + (error.message || 'Unknown error') });
  }
});

// Adjust OOM Score Adj for a process
app.post('/api/processes/:pid/oom', async (req, res) => {
  try {
    const { pid } = req.params;
    const { delta, value } = req.body;

    // Validate PID is numeric
    if (!/^\d+$/.test(pid)) {
      return res.status(400).json({ error: 'Invalid PID' });
    }

    // Only allow adjusting claude processes (check command line for "native-binary/claude")
    const { stdout: cmdline } = await execAsync(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\000' ' ' || echo ""`);
    if (!cmdline.includes('native-binary/claude') && !cmdline.includes('claude --output-format')) {
      return res.status(403).json({ error: 'Can only adjust Claude Code processes' });
    }

    // Read current OOM adj
    const { stdout: currentAdj } = await execAsync(`cat /proc/${pid}/oom_score_adj 2>/dev/null || echo "0"`);
    const current = parseInt(currentAdj.trim()) || 0;

    // Calculate new value
    let newValue;
    if (value !== undefined) {
      // Absolute value set
      newValue = parseInt(value);
    } else if (delta !== undefined) {
      // Relative adjustment
      newValue = current + parseInt(delta);
    } else {
      return res.status(400).json({ error: 'Must provide delta or value' });
    }

    // Clamp to valid range (-1000 to 1000)
    newValue = Math.max(-1000, Math.min(1000, newValue));

    // Write new value (requires appropriate permissions)
    await execAsync(`echo ${newValue} > /proc/${pid}/oom_score_adj`);

    // Create lock file to prevent claude-oom-protector from overwriting this adjustment
    // Lock expires after 1 hour (handled by the protector script)
    await execAsync(`mkdir -p /var/run/claude-oom-locks && touch /var/run/claude-oom-locks/${pid}.lock`);

    // Read back to verify
    const { stdout: newAdj } = await execAsync(`cat /proc/${pid}/oom_score_adj 2>/dev/null || echo "0"`);
    const { stdout: newScore } = await execAsync(`cat /proc/${pid}/oom_score 2>/dev/null || echo "0"`);

    res.json({
      success: true,
      pid: parseInt(pid),
      oldAdj: current,
      newAdj: parseInt(newAdj.trim()),
      newScore: parseInt(newScore.trim())
    });
  } catch (error) {
    console.error('Failed to adjust OOM:', error);
    res.status(500).json({ error: 'Failed to adjust OOM score. May require elevated permissions.' });
  }
});

// Get OOM info for all Claude processes
app.get('/api/oom', async (req, res) => {
  try {
    const { stdout: pids } = await execAsync(`pgrep -f "claude.*native-binary" 2>/dev/null || echo ""`);
    const pidList = pids.trim().split('\n').filter(p => p);

    const processes = await Promise.all(pidList.map(async (pid) => {
      try {
        const [scoreResult, adjResult] = await Promise.all([
          execAsync(`cat /proc/${pid}/oom_score 2>/dev/null || echo "0"`),
          execAsync(`cat /proc/${pid}/oom_score_adj 2>/dev/null || echo "0"`)
        ]);
        return {
          pid: parseInt(pid),
          oomScore: parseInt(scoreResult.stdout.trim()),
          oomAdj: parseInt(adjResult.stdout.trim())
        };
      } catch {
        return null;
      }
    }));

    res.json(processes.filter(p => p !== null));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get OOM info' });
  }
});

// Get configuration
app.get('/api/config', (req, res) => {
  res.json({
    warningThreshold,
    killThreshold,
    alertEmail,
    autoKillEnabled
  });
});

// Update configuration
app.post('/api/config', (req, res) => {
  const { warningThreshold: newWarning, killThreshold: newKill, alertEmail: newEmail, autoKillEnabled: newAutoKill } = req.body;

  // Validate warning threshold
  if (newWarning !== undefined) {
    if (typeof newWarning !== 'number' || newWarning < 1 || newWarning > 100) {
      return res.status(400).json({ error: 'Warning threshold must be a number between 1 and 100' });
    }
    warningThreshold = newWarning;
  }

  // Validate kill threshold
  if (newKill !== undefined) {
    if (typeof newKill !== 'number' || newKill < 1 || newKill > 100) {
      return res.status(400).json({ error: 'Kill threshold must be a number between 1 and 100' });
    }
    if (newKill <= warningThreshold) {
      return res.status(400).json({ error: 'Kill threshold must be greater than warning threshold' });
    }
    killThreshold = newKill;
  }

  // Validate email
  if (newEmail !== undefined) {
    if (typeof newEmail !== 'string') {
      return res.status(400).json({ error: 'Email must be a string' });
    }
    alertEmail = newEmail.trim();
  }

  // Validate auto-kill toggle
  if (newAutoKill !== undefined) {
    if (typeof newAutoKill !== 'boolean') {
      return res.status(400).json({ error: 'autoKillEnabled must be a boolean' });
    }
    autoKillEnabled = newAutoKill;

    // Write to config file for watchdog script to read
    try {
      const configData = JSON.stringify({ autoKillEnabled }, null, 2);
      writeFileSync(CONFIG_FILE, configData);
      console.log(`Auto-kill config updated: ${autoKillEnabled ? 'ENABLED' : 'DISABLED'}`);
      console.log(`Config file written to: ${CONFIG_FILE}`);
    } catch (err) {
      console.error('Failed to write config file:', err);
      console.error('Error details:', err.message);
    }
  }

  res.json({
    success: true,
    warningThreshold,
    killThreshold,
    alertEmail,
    autoKillEnabled
  });
});

// Force refresh metrics (generate fresh metrics)
app.post('/api/refresh', async (req, res) => {
  try {
    // Generate fresh metrics using built-in function
    const metrics = await generateMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Failed to refresh metrics:', error);
    res.status(500).json({ error: 'Failed to refresh metrics' });
  }
});

// Generate metrics on the fly
async function generateMetrics() {
  try {
    const [loadAvg, memInfo, cpuPressure, diskInfo] = await Promise.all([
      execAsync("cat /proc/loadavg | awk '{print $1, $2, $3}'"),
      execAsync("free -m | awk 'NR==2{print $2, $3, $7}'"),
      execAsync("awk '/^some/ {print $2}' /sys/fs/cgroup/cpu.pressure 2>/dev/null | cut -d= -f2 || echo '0'"),
      execAsync("df -BM / | awk 'NR==2{gsub(/M/,\"\"); print $2, $3, $4}'")
    ]);

    const [load1, load5, load15] = loadAvg.stdout.trim().split(' ').map(Number);
    const [memTotal, memUsed, memAvail] = memInfo.stdout.trim().split(' ').map(Number);
    const pressure = parseFloat(cpuPressure.stdout.trim()) || 0;
    const [diskTotal, diskUsed, diskAvail] = diskInfo.stdout.trim().split(' ').map(Number);

    return {
      cpu: {
        usage: pressure,
        load: [load1, load5, load15],
        pressure: pressure,
        cores: 2
      },
      memory: {
        total: memTotal,
        used: memUsed,
        available: memAvail,
        swap: { total: 2048, used: 0 }
      },
      processes: { claude: [], count: 0 },
      docker: [],
      disk: {
        total: diskTotal,
        used: diskUsed,
        available: diskAvail,
        percent: Math.round((diskUsed / diskTotal) * 100)
      },
      warnings: [],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return { error: 'Failed to generate metrics' };
  }
}

// Disk cleanup endpoint
app.post('/api/disk/cleanup', async (req, res) => {
  try {
    const cleanupResults = [];
    let totalFreed = 0;

    // Helper: run command on host via nsenter (requires hostPID: true)
    const runOnHost = (cmd) => {
      // Use single quotes for outer shell, escape single quotes in command
      const escapedCmd = cmd.replace(/'/g, "'\\''");
      return execAsync(`nsenter -t 1 -m -u -n -i sh -c '${escapedCmd}'`, { timeout: 300000 });
    };

    // 1. Clean Docker unused images and build cache (run on host)
    try {
      const { stdout: dockerPrune } = await runOnHost('docker system prune -a --volumes -f 2>/dev/null; docker builder prune -a -f 2>/dev/null');
      const dockerMatch = dockerPrune.match(/Total reclaimed space:\s*([\d.]+)\s*(\w+)/i);
      if (dockerMatch) {
        const size = parseFloat(dockerMatch[1]);
        const unit = dockerMatch[2].toUpperCase();
        const sizeInMB = unit === 'GB' ? size * 1024 : unit === 'KB' ? size / 1024 : size;
        totalFreed += sizeInMB;
        cleanupResults.push({ task: 'Docker cleanup', freed: `${dockerMatch[1]} ${dockerMatch[2]}`, success: true });
      } else {
        cleanupResults.push({ task: 'Docker cleanup', freed: '0 B', success: true });
      }
    } catch (err) {
      cleanupResults.push({ task: 'Docker cleanup', error: err.message, success: false });
    }

    // 2. Clean browser caches (Puppeteer, Playwright) - run on host
    try {
      await runOnHost('rm -rf /home/ubuntu/.cache/puppeteer /home/ubuntu/.cache/ms-playwright-go /home/ubuntu/.cache/typescript 2>/dev/null || true');
      cleanupResults.push({ task: 'Browser caches', freed: '~1.3 GB', success: true });
      totalFreed += 1300; // Estimated
    } catch (err) {
      cleanupResults.push({ task: 'Browser caches', error: err.message, success: false });
    }

    // 3. Clean system journal logs - run on host
    try {
      await runOnHost('journalctl --vacuum-size=100M 2>/dev/null || true');
      cleanupResults.push({ task: 'Journal logs', freed: 'trimmed to 100MB', success: true });
      totalFreed += 700; // Estimated based on typical usage
    } catch (err) {
      cleanupResults.push({ task: 'Journal logs', error: err.message, success: false });
    }

    // 4. Clean APT cache - run on host
    try {
      await runOnHost('apt-get clean 2>/dev/null; apt-get autoremove -y 2>/dev/null || true');
      cleanupResults.push({ task: 'APT cache', freed: '~400 MB', success: true });
      totalFreed += 400; // Estimated
    } catch (err) {
      cleanupResults.push({ task: 'APT cache', error: err.message, success: false });
    }

    // 5. Clean tmp files older than 7 days - run on host
    try {
      await runOnHost('find /tmp -type f -atime +7 -delete 2>/dev/null || true');
      cleanupResults.push({ task: 'Old tmp files', freed: 'cleaned', success: true });
    } catch (err) {
      cleanupResults.push({ task: 'Old tmp files', error: err.message, success: false });
    }

    // 6. Clean old claude-code-buddy processes (NEW)
    try {
      const { stdout: oldPids } = await runOnHost(
        'ps -eo pid,etime,cmd | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | awk \'$2 ~ /-/ {print $1}\''
      );
      const pids = oldPids.trim().split('\n').filter(p => p);

      if (pids.length > 0) {
        // Kill old processes
        await runOnHost(`echo "${pids.join(' ')}" | xargs kill 2>/dev/null || true`);
        cleanupResults.push({
          task: 'Old claude-code-buddy processes',
          freed: `${pids.length} processes killed`,
          success: true
        });
        totalFreed += pids.length * 35; // Estimate 35 MB per process
      } else {
        cleanupResults.push({
          task: 'Old claude-code-buddy processes',
          freed: '0 processes',
          success: true
        });
      }
    } catch (err) {
      cleanupResults.push({
        task: 'Old claude-code-buddy processes',
        error: err.message,
        success: false
      });
    }

    // Get updated disk info from host
    const { stdout: diskInfo } = await runOnHost("df -BM / | awk 'NR==2{gsub(/M/,\"\"); print $2, $3, $4}'");
    const [diskTotal, diskUsed, diskAvail] = diskInfo.trim().split(' ').map(Number);

    res.json({
      success: true,
      results: cleanupResults,
      totalFreedEstimate: totalFreed > 1024 ? `${(totalFreed / 1024).toFixed(1)} GB` : `${totalFreed.toFixed(0)} MB`,
      disk: {
        total: diskTotal,
        used: diskUsed,
        available: diskAvail,
        percent: Math.round((diskUsed / diskTotal) * 100)
      }
    });
  } catch (error) {
    console.error('Disk cleanup failed:', error);
    res.status(500).json({ error: 'Disk cleanup failed: ' + error.message });
  }
});

// Clean old claude-code-buddy processes
app.post('/api/processes/claude-buddy/cleanup', async (req, res) => {
  try {
    const cleanupResults = {
      before: { count: 0, memory: 0 },
      after: { count: 0, memory: 0 },
      killed: []
    };

    // Helper: run command on host via nsenter
    const runOnHost = (cmd) => {
      const escapedCmd = cmd.replace(/'/g, "'\\''");
      return execAsync(`nsenter -t 1 -m -u -n -i sh -c '${escapedCmd}'`, { timeout: 60000 });
    };

    // 1. Count processes before cleanup
    const { stdout: beforeCount } = await runOnHost(
      'ps aux | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | wc -l'
    );
    cleanupResults.before.count = parseInt(beforeCount.trim());

    // 2. Calculate memory usage before cleanup
    const { stdout: beforeMem } = await runOnHost(
      'ps aux | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | awk \'{sum+=$6} END {print sum/1024}\''
    );
    cleanupResults.before.memory = Math.round(parseFloat(beforeMem.trim()) || 0);

    // 3. Find and kill processes running more than 1 day
    const { stdout: oldPids } = await runOnHost(
      'ps -eo pid,etime,cmd | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | awk \'$2 ~ /-/ {print $1}\''
    );

    const pids = oldPids.trim().split('\n').filter(p => p);

    // Kill old processes
    for (const pid of pids) {
      try {
        await runOnHost(`kill ${pid}`);
        cleanupResults.killed.push(parseInt(pid));
      } catch (err) {
        console.error(`Failed to kill PID ${pid}:`, err.message);
      }
    }

    // Wait for processes to terminate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Count processes after cleanup
    const { stdout: afterCount } = await runOnHost(
      'ps aux | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | wc -l'
    );
    cleanupResults.after.count = parseInt(afterCount.trim());

    // 5. Calculate memory usage after cleanup
    const { stdout: afterMem } = await runOnHost(
      'ps aux | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | awk \'{sum+=$6} END {print sum/1024}\''
    );
    cleanupResults.after.memory = Math.round(parseFloat(afterMem.trim()) || 0);

    // Calculate freed resources
    const processesKilled = cleanupResults.killed.length;
    const memoryFreed = cleanupResults.before.memory - cleanupResults.after.memory;

    res.json({
      success: true,
      processesKilled,
      memoryFreed: `${memoryFreed} MB`,
      before: cleanupResults.before,
      after: cleanupResults.after,
      killed: cleanupResults.killed
    });
  } catch (error) {
    console.error('Claude-Code-Buddy cleanup failed:', error);
    res.status(500).json({ error: 'Cleanup failed: ' + error.message });
  }
});

// Get claude-code-buddy process statistics
app.get('/api/processes/claude-buddy/stats', async (req, res) => {
  try {
    const runOnHost = (cmd) => {
      const escapedCmd = cmd.replace(/'/g, "'\\''");
      return execAsync(`nsenter -t 1 -m -u -n -i sh -c '${escapedCmd}'`, { timeout: 30000 });
    };

    // Get all claude-code-buddy processes
    const { stdout: processList } = await runOnHost(
      'ps aux --sort=-%mem | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | head -n 50'
    );

    const processes = processList.trim().split('\n').filter(p => p).map(line => {
      const parts = line.split(/\s+/);
      return {
        pid: parseInt(parts[1]),
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        memMB: Math.round(parseFloat(parts[5]) / 1024),
        startTime: parts[8],
        runtime: parts[9]
      };
    });

    // Calculate totals
    const totalCount = processes.length;
    const totalMemory = processes.reduce((sum, p) => sum + p.memMB, 0);
    const avgMemory = totalCount > 0 ? Math.round(totalMemory / totalCount) : 0;

    // Count by age (older than 1 day)
    const { stdout: oldCount } = await runOnHost(
      'ps -eo pid,etime,cmd | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | awk \'$2 ~ /-/ {print $1}\' | wc -l'
    );
    const oldProcessCount = parseInt(oldCount.trim());

    res.json({
      success: true,
      summary: {
        total: totalCount,
        old: oldProcessCount,
        totalMemoryMB: totalMemory,
        avgMemoryMB: avgMemory
      },
      processes: processes.slice(0, 10) // Top 10 by memory
    });
  } catch (error) {
    console.error('Failed to get claude-buddy stats:', error);
    res.status(500).json({ error: 'Failed to get stats: ' + error.message });
  }
});

// ============================================
// Claude Remote Control Monitoring API
// ============================================

// 10.1: Get status of all servers
app.get('/api/claude-remote/status', (req, res) => {
  try {
    const orchestrator = getMonitorOrchestrator();
    const serverStates = orchestrator.getServerStates();

    // Transform claudeRemote object to sessions property for frontend compatibility
    const transformedStates = {};
    for (const [ip, state] of Object.entries(serverStates)) {
      transformedStates[ip] = {
        ...state,
        sessions: state.claudeRemote?.sessions || []
      };
    }

    res.json({
      success: true,
      servers: transformedStates,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting Claude Remote status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.2: Get recovery logs
app.get('/api/claude-remote/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    // Validate limit
    if (limit < 1 || limit > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 1000'
      });
    }

    const orchestrator = getMonitorOrchestrator();
    const logs = orchestrator.getRecoveryLogs({ limit });

    res.json({
      success: true,
      logs,
      count: logs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting recovery logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.3: Manual recovery trigger for specific server
app.post('/api/claude-remote/recover/:ip', async (req, res) => {
  try {
    const { ip } = req.params;

    // Validate IP format (basic check)
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    const orchestrator = getMonitorOrchestrator();
    const result = await orchestrator.manualRecover(ip, 'manual_trigger');

    res.json({
      success: result.success,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering manual recovery:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Network diagnostics endpoint
app.get('/api/network-diagnostics/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    const { getSSHPool } = await import('./modules/sshPool.js');
    const sshPool = getSSHPool();

    const tests = [
      { name: 'Ping Claude.ai', cmd: 'ping -c 5 -W 2 claude.ai 2>&1 | tail -3' },
      { name: 'DNS Resolution', cmd: 'time nslookup api.anthropic.com 2>&1 | grep -E "real|Server" || echo "DNS test completed"' },
      { name: 'Network Interface', cmd: 'ip link show | grep -E "eth0|UP"' },
      { name: 'Route Table', cmd: 'ip route | head -3' },
      { name: 'TCP Connections', cmd: 'ss -s 2>&1 | grep -E "TCP:|ESTAB"' },
      { name: 'Load Average', cmd: 'uptime' },
      { name: 'Memory Usage', cmd: 'free -h | grep -E "Mem:|Swap:"' }
    ];

    const results = [];
    for (const test of tests) {
      try {
        const output = await sshPool.exec(ip, test.cmd, { timeout: 10000 });
        results.push({
          name: test.name,
          success: true,
          output: output.trim()
        });
      } catch (error) {
        results.push({
          name: test.name,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      ip,
      tests: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start new Claude Remote Control session
app.post('/api/claude-remote/start-session/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    const { sessionName = 'claude-remote', workingDir = '/home/ubuntu/agent-skill' } = req.body;

    // Validate IP format
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    const { getSSHPool } = await import('./modules/sshPool.js');
    const sshPool = getSSHPool();

    // Kill existing session if exists (to avoid conflicts)
    try {
      await sshPool.exec(ip, `tmux kill-session -t ${sessionName}`, { timeout: 3000 });
      console.log(`Killed existing session: ${sessionName}`);
    } catch {
      // Session doesn't exist, that's fine
    }

    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create new tmux session with Claude Remote Control
    const createCmd = `cd ${workingDir} && tmux new-session -d -s ${sessionName} "claude remote-control"`;
    await sshPool.exec(ip, createCmd, { timeout: 5000 });

    // Wait 3 seconds for Claude to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify session started
    const psOutput = await sshPool.exec(ip,
      'ps aux | grep "[c]laude remote-control" | wc -l',
      { timeout: 3000 });
    const processCount = parseInt(psOutput.trim());

    res.json({
      success: processCount > 0,
      ip,
      sessionName,
      workingDir,
      processCount,
      message: processCount > 0
        ? `Session ${sessionName} started successfully`
        : 'Session created but Claude process not detected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.4: Restart session (殺掉舊的並建立新的)
app.post('/api/claude-remote/restart-session/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    const { sessionName, workingDir, forceKill = true } = req.body;

    // Validate IP
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    const { SessionManager } = await import('./modules/sessionManager.js');
    const result = await SessionManager.restartSession(ip, {
      sessionName,
      workingDir,
      forceKill
    });

    res.json(result);
  } catch (error) {
    console.error('Error restarting session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.5: Reconnect (重新連線到 server，不重啟 session)
app.post('/api/claude-remote/reconnect/:ip', async (req, res) => {
  try {
    const { ip } = req.params;

    // Validate IP
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    const { SessionManager } = await import('./modules/sessionManager.js');
    const result = await SessionManager.reconnectSession(ip);

    res.json(result);
  } catch (error) {
    console.error('Error reconnecting:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.6: Get session status
app.get('/api/claude-remote/session-status/:ip/:sessionName', async (req, res) => {
  try {
    const { ip, sessionName } = req.params;

    const { SessionManager } = await import('./modules/sessionManager.js');
    const result = await SessionManager.getSessionStatus(ip, sessionName);

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint to execute custom command
app.post('/api/debug/exec/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ success: false, error: 'Command is required' });
    }

    const { getSSHPool } = await import('./modules/sshPool.js');
    const sshPool = getSSHPool();

    const output = await sshPool.exec(ip, command, { timeout: 10000 });

    res.json({
      success: true,
      ip,
      command,
      output: output.trim(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.4: Detailed health check for single server
app.get('/api/claude-remote/health/:ip', async (req, res) => {
  try {
    const { ip } = req.params;

    // Validate IP format
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    const orchestrator = getMonitorOrchestrator();

    // Get current state from orchestrator
    const serverStates = orchestrator.getServerStates();
    const serverState = serverStates[ip];

    if (!serverState) {
      return res.status(404).json({
        success: false,
        error: `Server ${ip} not found in configuration`
      });
    }

    res.json({
      success: true,
      health: serverState,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting server health:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.5: Test SSH connectivity to a server
app.post('/api/claude-remote/test-ssh/:ip', async (req, res) => {
  try {
    const { ip } = req.params;

    // Validate IP format
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    // Import SSH pool
    const { getSSHPool } = await import('./modules/sshPool.js');
    const sshPool = getSSHPool();

    const startTime = Date.now();

    try {
      // Test SSH connection with whoami command
      const output = await sshPool.exec(ip, 'whoami', { timeout: 5000 });
      const latency = Date.now() - startTime;

      res.json({
        success: true,
        connected: true,
        latency,
        user: output.trim(),
        message: `SSH connection successful (${latency}ms)`,
        timestamp: new Date().toISOString()
      });
    } catch (sshError) {
      const latency = Date.now() - startTime;

      res.status(503).json({
        success: false,
        connected: false,
        latency,
        error: sshError.message,
        message: `SSH connection failed: ${sshError.message}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error testing SSH connection:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10.6: Get monitoring configuration
app.get('/api/claude-remote/config', (req, res) => {
  try {
    const orchestrator = getMonitorOrchestrator();

    // Get server list from orchestrator
    const serverStates = orchestrator.getServerStates();
    const servers = Object.keys(serverStates).map(ip => {
      const state = serverStates[ip];
      return {
        ip,
        alias: state.alias,
        hostname: state.hostname
      };
    });

    const config = {
      servers,
      monitoring: {
        interval: 30, // seconds
        enabled: orchestrator.isRunning || false
      },
      autoRecovery: {
        enabled: true,
        maxAttempts: 3,
        cooldownDuration: 1800 // 30 minutes in seconds
      },
      alerts: {
        email: alertEmail || '',
        cooldownDuration: 3600 // 1 hour in seconds
      }
    };

    res.json({
      success: true,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting monitoring config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Documentation API endpoint
app.get('/api/docs/claude-remote-monitoring', (req, res) => {
  try {
    const docsPath = path.join(__dirname, '../docs/CLAUDE_REMOTE_MONITORING.md');
    if (!existsSync(docsPath)) {
      return res.status(404).json({ error: 'Documentation not found' });
    }
    const content = readFileSync(docsPath, 'utf-8');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve documentation page
app.get('/claude-remote/docs', (req, res) => {
  const docsHtmlPath = path.join(__dirname, '../docs/index.html');
  if (existsSync(docsHtmlPath)) {
    res.sendFile(docsHtmlPath);
  } else {
    res.status(404).send('Documentation not found');
  }
});

// Serve React app for all other routes in production (SPA fallback)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Load auto-kill config from file on startup
try {
  if (existsSync(CONFIG_FILE)) {
    const configData = readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configData);
    if (typeof config.autoKillEnabled === 'boolean') {
      autoKillEnabled = config.autoKillEnabled;
      console.log(`Loaded auto-kill config: ${autoKillEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
  }
} catch (err) {
  console.error('Failed to load config file:', err);
}

// Weekly cleanup of old claude-code-buddy processes
// Runs every Monday at 2:00 AM
cron.schedule('0 2 * * 1', async () => {
  console.log('[Weekly Cleanup] Starting scheduled claude-code-buddy cleanup...');

  try {
    const runOnHost = (cmd) => {
      const escapedCmd = cmd.replace(/'/g, "'\\''");
      return execAsync(`nsenter -t 1 -m -u -n -i sh -c '${escapedCmd}'`, { timeout: 60000 });
    };

    // Count processes before
    const { stdout: beforeCount } = await runOnHost(
      'ps aux | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | wc -l'
    );
    const before = parseInt(beforeCount.trim());

    // Kill old processes (>1 day)
    const { stdout: oldPids } = await runOnHost(
      'ps -eo pid,etime,cmd | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | awk \'$2 ~ /-/ {print $1}\''
    );
    const pids = oldPids.trim().split('\n').filter(p => p);

    if (pids.length > 0) {
      await runOnHost(`echo "${pids.join(' ')}" | xargs kill 2>/dev/null || true`);
    }

    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Count processes after
    const { stdout: afterCount } = await runOnHost(
      'ps aux | grep -E "claude-code-buddy|npm exec @pcircle" | grep -v grep | wc -l'
    );
    const after = parseInt(afterCount.trim());

    console.log(`[Weekly Cleanup] Completed. Killed ${pids.length} processes. Before: ${before}, After: ${after}`);
  } catch (error) {
    console.error('[Weekly Cleanup] Failed:', error.message);
  }
}, {
  timezone: 'Asia/Taipei'
});

console.log('✓ Weekly cleanup cron job scheduled (Every Monday 2:00 AM)');

// Initialize Claude Remote Control monitoring
async function initializeClaudeRemoteMonitoring() {
  try {
    console.log('Initializing Claude Remote Control monitoring...');
    const orchestrator = getMonitorOrchestrator();

    // Initialize with email transporter and alert email
    await orchestrator.initialize(transporter, alertEmail);

    // Start monitoring loop
    orchestrator.start();

    console.log('✓ Claude Remote Control monitoring started');
  } catch (error) {
    console.error('Failed to initialize Claude Remote Control monitoring:', error.message);
    console.error('Monitoring will not be active. Please check configuration.');
  }
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`System Monitor API running on port ${PORT}`);
  console.log(`Auto-Kill: ${autoKillEnabled ? 'ENABLED' : 'DISABLED'}`);

  // Initialize Claude Remote monitoring
  await initializeClaudeRemoteMonitoring();
});
