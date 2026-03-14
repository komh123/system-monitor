/**
 * Test 16.2-16.4: Auto-Recovery Test
 * Tests soft restart, hard restart, and recovery verification
 */

import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serversConfigPath = join(__dirname, '../server/config/servers.json');
const servers = JSON.parse(readFileSync(serversConfigPath, 'utf8'));

/**
 * Execute SSH command on a server
 */
async function execCommand(server, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        stream.on('close', (code) => {
          conn.end();
          resolve({ code, output, errorOutput });
        });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    const privateKey = readFileSync(server.privateKeyPath);
    conn.connect({
      host: server.ip,
      port: 22,
      username: server.user,
      privateKey,
      readyTimeout: 10000
    });
  });
}

/**
 * Wait for a condition to be true
 */
async function waitFor(checkFn, timeout = 15000, interval = 2000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await checkFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Check if Claude Remote Control is running
 */
async function isClaudeRemoteRunning(server) {
  try {
    const result = await execCommand(server, 'ps aux | grep "[c]laude remote-control"');
    return result.code === 0 && result.output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if tmux session exists
 */
async function tmuxSessionExists(server) {
  try {
    const result = await execCommand(server, 'tmux ls | grep claude-remote');
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Test 16.2: Simulate failure and verify process detection
 */
async function testProcessDetection(server) {
  console.log(`\nTest 16.2: Process Detection on ${server.alias}`);
  console.log('-'.repeat(60));

  try {
    // Stop the process
    console.log('  Stopping Claude Remote Control process...');
    await execCommand(server, 'tmux send-keys -t claude-remote C-c');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify process is stopped
    const isRunning = await isClaudeRemoteRunning(server);
    if (isRunning) {
      console.log('  ❌ FAILED: Process still running after stop command');
      return false;
    }

    console.log('  ✅ PASSED: Process detection working (process stopped)');
    return true;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}`);
    return false;
  }
}

/**
 * Test 16.3: Soft restart
 */
async function testSoftRestart(server) {
  console.log(`\nTest 16.3: Soft Restart on ${server.alias}`);
  console.log('-'.repeat(60));

  try {
    // Ensure process is stopped first
    await execCommand(server, 'tmux send-keys -t claude-remote C-c');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Soft restart: send new command
    console.log('  Executing soft restart (send command via tmux)...');
    await execCommand(server, 'tmux send-keys -t claude-remote "claude remote-control" C-m');

    // Wait for process to start
    console.log('  Waiting for process to start (max 15 seconds)...');
    const started = await waitFor(() => isClaudeRemoteRunning(server), 15000, 2000);

    if (!started) {
      console.log('  ❌ FAILED: Process did not start within timeout');
      return false;
    }

    console.log('  ✅ PASSED: Soft restart successful, process running');
    return true;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}`);
    return false;
  }
}

/**
 * Test 16.4: Hard restart (kill session and recreate)
 */
async function testHardRestart(server) {
  console.log(`\nTest 16.4: Hard Restart on ${server.alias}`);
  console.log('-'.repeat(60));

  try {
    // Kill the tmux session
    console.log('  Killing tmux session...');
    try {
      await execCommand(server, 'tmux kill-session -t claude-remote');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {
      // Session might not exist, ignore
    }

    // Verify session is gone
    const sessionExists = await tmuxSessionExists(server);
    if (sessionExists) {
      console.log('  ❌ FAILED: Tmux session still exists after kill command');
      return false;
    }

    console.log('  ✅ Session killed successfully');

    // Hard restart: create new session
    console.log('  Creating new tmux session with Claude Remote Control...');
    await execCommand(
      server,
      'tmux new-session -d -s claude-remote "claude remote-control"'
    );

    // Wait for process to start
    console.log('  Waiting for process to start (max 15 seconds)...');
    const started = await waitFor(() => isClaudeRemoteRunning(server), 15000, 2000);

    if (!started) {
      console.log('  ❌ FAILED: Process did not start within timeout');
      return false;
    }

    // Verify tmux session exists
    const newSessionExists = await tmuxSessionExists(server);
    if (!newSessionExists) {
      console.log('  ❌ FAILED: Tmux session does not exist');
      return false;
    }

    console.log('  ✅ PASSED: Hard restart successful, session and process running');
    return true;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}`);
    return false;
  }
}

/**
 * Run all auto-recovery tests
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('Auto-Recovery Tests (Tasks 16.2-16.4)');
  console.log('='.repeat(60));
  console.log();
  console.log('⚠️  WARNING: These tests will stop and restart Claude Remote Control');
  console.log('⚠️  This may cause temporary disconnection from remote sessions');
  console.log();

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test first server only to avoid disrupting both servers
  const server = servers[0];
  console.log(`Testing on: ${server.alias} (${server.ip})`);

  // Test 16.2: Process detection
  results.total++;
  if (await testProcessDetection(server)) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Test 16.3: Soft restart
  results.total++;
  if (await testSoftRestart(server)) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Test 16.4: Hard restart
  results.total++;
  if (await testHardRestart(server)) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Summary
  console.log();
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log();
  console.log(results.failed === 0 ? '✅ All tests passed!' : '❌ Some tests failed!');

  process.exit(results.failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
