/**
 * System Metrics Collection Module
 * Collects CPU, Memory, and Network status
 */

import { getSSHPool } from './sshPool.js';
import { getNetworkHealth } from './networkHealth.js';

class SystemMetrics {
  async collectMetrics(ip) {
    try {
      const [cpu, memory, networkHealth] = await Promise.all([
        this.getCPU(ip),
        this.getMemory(ip),
        getNetworkHealth().checkHealth(ip)
      ]);

      return {
        cpu,
        memory,
        networkReachable: networkHealth.reachable,
        networkHealth
      };
    } catch (error) {
      console.error(`Error collecting metrics on ${ip}:`, error.message);
      return {
        cpu: null,
        memory: null,
        networkReachable: false,
        error: error.message
      };
    }
  }

  /**
   * 6.2: Get CPU usage
   */
  async getCPU(ip) {
    try {
      const sshPool = getSSHPool();
      const output = await sshPool.exec(
        ip,
        'top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | cut -d\'%\' -f1',
        { timeout: 3000 }
      );
      return parseFloat(output.trim()) || 0;
    } catch (error) {
      return null;
    }
  }

  /**
   * 6.3: Get Memory usage
   */
  async getMemory(ip) {
    try {
      const sshPool = getSSHPool();
      const output = await sshPool.exec(
        ip,
        'free | grep Mem | awk \'{printf("%.1f"), $3/$2 * 100.0}\'',
        { timeout: 3000 }
      );
      return parseFloat(output.trim()) || 0;
    } catch (error) {
      return null;
    }
  }
}

let metricsInstance = null;

export function getSystemMetrics() {
  if (!metricsInstance) {
    metricsInstance = new SystemMetrics();
  }
  return metricsInstance;
}

export { SystemMetrics };
