/**
 * Network Health Check Module
 * Checks connectivity to api.anthropic.com
 */

import { getSSHPool } from './sshPool.js';

class NetworkHealth {
  async checkHealth(ip) {
    try {
      const reachable = await this.pingAPI(ip);
      const httpsAccessible = await this.testHTTPS(ip);
      const dnsLatency = await this.measureDNSLatency(ip);

      let dnsHealth = 'good';
      if (dnsLatency === null) {
        dnsHealth = 'failed';
      } else if (dnsLatency > 500) {
        dnsHealth = 'degraded';
      }

      return {
        reachable,
        httpsAccessible,
        dnsLatency,
        dnsHealth
      };
    } catch (error) {
      console.error(`Error checking network health on ${ip}:`, error.message);
      return {
        reachable: false,
        httpsAccessible: false,
        dnsLatency: null,
        dnsHealth: 'failed',
        error: error.message
      };
    }
  }

  /**
   * 5.2: ICMP ping to api.anthropic.com
   */
  async pingAPI(ip) {
    try {
      const sshPool = getSSHPool();
      await sshPool.exec(ip, 'ping -c 1 -W 2 api.anthropic.com', { timeout: 4000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 5.3: HTTPS connectivity test (port 443)
   */
  async testHTTPS(ip) {
    try {
      const sshPool = getSSHPool();
      await sshPool.exec(
        ip,
        'timeout 3 bash -c "cat < /dev/null > /dev/tcp/api.anthropic.com/443"',
        { timeout: 4000 }
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 5.4: Measure DNS resolution latency
   */
  async measureDNSLatency(ip) {
    try {
      const sshPool = getSSHPool();
      const startTime = Date.now();
      await sshPool.exec(ip, 'host api.anthropic.com', { timeout: 2000 });
      const latency = Date.now() - startTime;
      return latency;
    } catch (error) {
      return null;
    }
  }
}

let healthInstance = null;

export function getNetworkHealth() {
  if (!healthInstance) {
    healthInstance = new NetworkHealth();
  }
  return healthInstance;
}

export { NetworkHealth };
