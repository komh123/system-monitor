/**
 * Test 16.1: SSH Connection Test
 * Verifies SSH connectivity from monitor to both servers
 */

import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load server configuration
const serversConfigPath = join(__dirname, '../server/config/servers.json');
const servers = JSON.parse(readFileSync(serversConfigPath, 'utf8'));

/**
 * Test SSH connection to a single server
 */
async function testServerConnection(server) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const startTime = Date.now();

    conn.on('ready', () => {
      const connectTime = Date.now() - startTime;

      // Execute a simple command to verify full connectivity
      conn.exec('whoami', (err, stream) => {
        if (err) {
          conn.end();
          reject(new Error(`Command execution failed: ${err.message}`));
          return;
        }

        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.on('close', (code) => {
          conn.end();

          if (code === 0) {
            resolve({
              success: true,
              server: server.alias,
              ip: server.ip,
              connectTime,
              user: output.trim()
            });
          } else {
            reject(new Error(`Command exited with code ${code}`));
          }
        });
      });
    });

    conn.on('error', (err) => {
      reject(new Error(`SSH connection failed: ${err.message}`));
    });

    // Connect with SSH key
    try {
      const privateKey = readFileSync(server.privateKeyPath);

      conn.connect({
        host: server.ip,
        port: 22,
        username: server.user,
        privateKey,
        readyTimeout: 10000
      });
    } catch (error) {
      reject(new Error(`Failed to read private key: ${error.message}`));
    }
  });
}

/**
 * Run all SSH connectivity tests
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('SSH Connectivity Test (Task 16.1)');
  console.log('='.repeat(60));
  console.log();

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  for (const server of servers) {
    console.log(`Testing connection to ${server.alias} (${server.ip})...`);

    try {
      const result = await testServerConnection(server);
      console.log(`✅ SUCCESS: Connected in ${result.connectTime}ms`);
      console.log(`   User: ${result.user}`);
      console.log(`   Hostname: ${server.hostname}`);
      results.passed++;
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      results.failed++;
      results.errors.push({
        server: server.alias,
        error: error.message
      });
    }

    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total Servers: ${servers.length}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log();
    console.log('Errors:');
    results.errors.forEach(({ server, error }) => {
      console.log(`  - ${server}: ${error}`);
    });
  }

  console.log();
  console.log(results.failed === 0 ? '✅ All tests passed!' : '❌ Some tests failed!');

  // Exit with appropriate code
  process.exit(results.failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
