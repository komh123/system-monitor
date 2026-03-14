import { readFileSync, statSync } from 'fs';
import { existsSync } from 'fs';

/**
 * Load and validate SSH private key
 * @param {string} keyPath - Path to SSH private key
 * @returns {{key: string, valid: boolean, error: string|null}}
 */
export function loadSSHKey(keyPath) {
  try {
    // Check if key file exists
    if (!existsSync(keyPath)) {
      return {
        key: null,
        valid: false,
        error: `SSH key not found at ${keyPath}`
      };
    }

    // Check file permissions (should be 600)
    const stats = statSync(keyPath);
    const mode = (stats.mode & parseInt('777', 8)).toString(8);

    if (mode !== '600') {
      console.warn(`Warning: SSH key permissions are ${mode}, recommended 600`);
    }

    // Read the key
    const key = readFileSync(keyPath, 'utf8');

    // Basic validation - check if it looks like a valid key
    if (!key.includes('BEGIN') || !key.includes('PRIVATE KEY')) {
      return {
        key: null,
        valid: false,
        error: 'Invalid SSH key format'
      };
    }

    return {
      key,
      valid: true,
      error: null
    };
  } catch (error) {
    return {
      key: null,
      valid: false,
      error: `Failed to load SSH key: ${error.message}`
    };
  }
}

/**
 * Validate SSH key permissions
 * @param {string} keyPath - Path to SSH private key
 * @returns {boolean}
 */
export function validateKeyPermissions(keyPath) {
  try {
    const stats = statSync(keyPath);
    const mode = (stats.mode & parseInt('777', 8)).toString(8);
    return mode === '600';
  } catch {
    return false;
  }
}
