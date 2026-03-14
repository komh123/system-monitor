import { Client } from 'ssh2';
import { loadSSHKey } from './sshKeyLoader.js';
import { readFileSync } from 'fs';

/**
 * SSH Connection Pool Manager
 * Maintains persistent SSH connections to multiple servers
 */
class SSHPool {
  constructor() {
    this.connections = new Map(); // Map<ip, {client, config, status, lastHeartbeat, latency}>
    this.heartbeatInterval = null;
    this.reconnectAttempts = new Map(); // Map<ip, {count, lastAttempt}>
  }

  /**
   * Initialize connection pool with server list
   * @param {Array} servers - Array of server config objects {ip, user, privateKeyPath}
   */
  async initialize(servers) {
    console.log(`Initializing SSH pool for ${servers.length} servers...`);

    const promises = servers.map(server => this.addServer(server));
    const results = await Promise.allSettled(promises);

    const connected = results.filter(r => r.status === 'fulfilled').length;
    console.log(`SSH pool initialized: ${connected}/${servers.length} servers connected`);

    // Start heartbeat mechanism (every 60 seconds)
    this.startHeartbeat();

    return connected;
  }

  /**
   * Add a server to the pool and establish connection
   * @param {Object} serverConfig - {ip, user, privateKeyPath}
   */
  async addServer(serverConfig) {
    const { ip, user, privateKeyPath } = serverConfig;

    try {
      // Load SSH private key
      const keyData = loadSSHKey(privateKeyPath);
      if (!keyData.valid) {
        throw new Error(keyData.error);
      }

      // Create SSH client
      const client = new Client();

      // Establish connection with promise wrapper
      await new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timeout (10s)'));
        }, 10000);

        client
          .on('ready', () => {
            clearTimeout(connectTimeout);
            console.log(`✓ SSH connected to ${ip}`);
            resolve();
          })
          .on('error', (err) => {
            clearTimeout(connectTimeout);
            reject(err);
          })
          .on('end', () => {
            console.log(`SSH connection ended: ${ip}`);
            this.handleDisconnect(ip);
          })
          .on('close', () => {
            console.log(`SSH connection closed: ${ip}`);
            this.handleDisconnect(ip);
          })
          .connect({
            host: ip,
            port: 22,
            username: user,
            privateKey: keyData.key,
            readyTimeout: 10000,
            keepaliveInterval: 10000, // TCP keep-alive every 10s
            keepaliveCountMax: 3
          });
      });

      // Store connection info
      this.connections.set(ip, {
        client,
        config: serverConfig,
        status: 'connected',
        lastHeartbeat: Date.now(),
        latency: 0,
        quality: 'excellent'
      });

      // Reset reconnection attempts
      this.reconnectAttempts.delete(ip);

      // Run pre-flight connectivity check
      await this.preFlightCheck(ip);

      return { ip, success: true };
    } catch (error) {
      console.error(`✗ Failed to connect to ${ip}:`, error.message);
      this.connections.set(ip, {
        client: null,
        config: serverConfig,
        status: 'disconnected',
        lastHeartbeat: null,
        latency: null,
        quality: 'failed',
        error: error.message
      });

      // Schedule reconnect
      this.scheduleReconnect(ip);

      return { ip, success: false, error: error.message };
    }
  }

  /**
   * Pre-flight connectivity check
   */
  async preFlightCheck(ip) {
    try {
      const result = await this.exec(ip, 'whoami', { timeout: 5000 });
      console.log(`✓ Pre-flight check passed for ${ip}: ${result.trim()}`);
      return true;
    } catch (error) {
      console.warn(`✗ Pre-flight check failed for ${ip}:`, error.message);
      return false;
    }
  }

  /**
   * Execute command on remote server
   * @param {string} ip - Server IP
   * @param {string} command - Command to execute
   * @param {Object} options - {timeout: 5000}
   * @returns {Promise<string>} - Command output
   */
  async exec(ip, command, options = {}) {
    const timeout = options.timeout || 5000;
    const conn = this.connections.get(ip);

    if (!conn || !conn.client || conn.status !== 'connected') {
      throw new Error(`No active connection to ${ip}`);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      conn.client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        stream
          .on('close', (code, signal) => {
            clearTimeout(timer);

            // Update latency
            const latency = Date.now() - startTime;
            this.updateLatency(ip, latency);

            if (code !== 0) {
              reject(new Error(`Command exited with code ${code}: ${stderr}`));
            } else {
              resolve(stdout);
            }
          })
          .on('data', (data) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * Update connection latency and quality
   */
  updateLatency(ip, latency) {
    const conn = this.connections.get(ip);
    if (conn) {
      conn.latency = latency;

      // Determine connection quality
      if (latency < 100) {
        conn.quality = 'excellent';
      } else if (latency < 500) {
        conn.quality = 'good';
      } else {
        conn.quality = 'degraded';
        console.warn(`High latency detected for ${ip}: ${latency}ms`);
      }
    }
  }

  /**
   * Start heartbeat mechanism (every 60 seconds)
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      for (const [ip, conn] of this.connections) {
        if (conn.status === 'connected') {
          try {
            await this.exec(ip, 'echo alive', { timeout: 5000 });
            conn.lastHeartbeat = Date.now();
            conn.status = 'connected';
          } catch (error) {
            console.error(`Heartbeat failed for ${ip}:`, error.message);
            conn.status = 'unhealthy';
            this.scheduleReconnect(ip);
          }
        }
      }
    }, 60000); // Every 60 seconds
  }

  /**
   * Handle disconnection event
   */
  handleDisconnect(ip) {
    const conn = this.connections.get(ip);
    if (conn) {
      conn.status = 'disconnected';
      this.scheduleReconnect(ip);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect(ip) {
    const attempts = this.reconnectAttempts.get(ip) || { count: 0, lastAttempt: 0 };

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delays = [1000, 2000, 4000, 8000, 30000];
    const delay = delays[Math.min(attempts.count, delays.length - 1)];

    // Prevent too frequent reconnects
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
    if (timeSinceLastAttempt < delay) {
      return;
    }

    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.reconnectAttempts.set(ip, attempts);

    console.log(`Scheduling reconnect to ${ip} in ${delay}ms (attempt ${attempts.count})`);

    setTimeout(async () => {
      if (attempts.count > 5) {
        console.error(`Max reconnection attempts reached for ${ip}`);
        const conn = this.connections.get(ip);
        if (conn) {
          conn.status = 'ssh_unreachable';
          conn.error = 'Max reconnection attempts exceeded';
        }
        return;
      }

      const conn = this.connections.get(ip);
      if (conn && conn.status !== 'connected') {
        console.log(`Attempting to reconnect to ${ip}...`);
        await this.addServer(conn.config);
      }
    }, delay);
  }

  /**
   * Get connection status for a server
   */
  getStatus(ip) {
    return this.connections.get(ip) || null;
  }

  /**
   * Get all connection statuses
   */
  getAllStatuses() {
    const statuses = {};
    for (const [ip, conn] of this.connections) {
      statuses[ip] = {
        status: conn.status,
        latency: conn.latency,
        quality: conn.quality,
        lastHeartbeat: conn.lastHeartbeat,
        error: conn.error || null
      };
    }
    return statuses;
  }

  /**
   * Close a specific connection
   */
  async closeConnection(ip) {
    const conn = this.connections.get(ip);
    if (conn && conn.client) {
      conn.client.end();
      this.connections.delete(ip);
      console.log(`Closed connection to ${ip}`);
    }
  }

  /**
   * Close all connections
   */
  async closeAll() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [ip, conn] of this.connections) {
      if (conn.client) {
        conn.client.end();
      }
    }

    this.connections.clear();
    console.log('All SSH connections closed');
  }
}

// Singleton instance
let sshPoolInstance = null;

export function getSSHPool() {
  if (!sshPoolInstance) {
    sshPoolInstance = new SSHPool();
  }
  return sshPoolInstance;
}

export { SSHPool };
