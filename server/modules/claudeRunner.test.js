import { describe, it, expect } from 'vitest';

// Test the permission mode mapping logic directly (extracted)
const PERMISSION_MODE_MAP = {
  'ask': 'default',
  'plan': 'plan',
  'bypass': 'bypassPermissions',
  'auto': 'auto',
  'acceptEdits': 'acceptEdits',
  'dontAsk': 'dontAsk',
};

const VALID_MODES = ['acceptEdits', 'bypassPermissions', 'default', 'dontAsk', 'plan', 'auto'];

function getPermissionMode(mode) {
  return PERMISSION_MODE_MAP[mode] || 'default';
}

describe('ClaudeRunner - Permission Mode Mapping', () => {
  it('should map "ask" to "default" (NOT "requireApproval")', () => {
    const result = getPermissionMode('ask');
    expect(result).toBe('default');
    expect(result).not.toBe('requireApproval');
    expect(VALID_MODES).toContain(result);
  });

  it('should map "plan" to "plan"', () => {
    const result = getPermissionMode('plan');
    expect(result).toBe('plan');
    expect(VALID_MODES).toContain(result);
  });

  it('should map "bypass" to "bypassPermissions"', () => {
    const result = getPermissionMode('bypass');
    expect(result).toBe('bypassPermissions');
    expect(VALID_MODES).toContain(result);
  });

  it('should map "auto" to "auto"', () => {
    const result = getPermissionMode('auto');
    expect(result).toBe('auto');
    expect(VALID_MODES).toContain(result);
  });

  it('should map "acceptEdits" to "acceptEdits"', () => {
    const result = getPermissionMode('acceptEdits');
    expect(result).toBe('acceptEdits');
    expect(VALID_MODES).toContain(result);
  });

  it('should map "dontAsk" to "dontAsk"', () => {
    const result = getPermissionMode('dontAsk');
    expect(result).toBe('dontAsk');
    expect(VALID_MODES).toContain(result);
  });

  it('should default to "default" for unknown modes', () => {
    const result = getPermissionMode('unknownMode');
    expect(result).toBe('default');
    expect(VALID_MODES).toContain(result);
  });

  it('should default to "default" for undefined', () => {
    const result = getPermissionMode(undefined);
    expect(result).toBe('default');
    expect(VALID_MODES).toContain(result);
  });

  it('should NEVER return "requireApproval" for any input', () => {
    const allInputs = ['ask', 'plan', 'bypass', 'auto', 'acceptEdits', 'dontAsk', undefined, null, '', 'requireApproval'];
    for (const input of allInputs) {
      const result = getPermissionMode(input);
      expect(result).not.toBe('requireApproval');
      expect(VALID_MODES).toContain(result);
    }
  });

  it('all mapped values should be valid Claude CLI permission modes', () => {
    for (const [key, value] of Object.entries(PERMISSION_MODE_MAP)) {
      expect(VALID_MODES).toContain(value);
    }
  });
});
