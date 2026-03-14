import { getSSHPool } from './sshPool.js';
import { getChatSessionStore } from './chatSessionStore.js';
import { EventEmitter } from 'events';

class ClaudeRunner extends EventEmitter {
  constructor() {
    super();
    this.activeProcesses = new Map();
  }

  /**
   * Send a message to a Claude session and stream the response.
   * Returns an EventEmitter that emits: 'data' (SSE events), 'error', 'end'
   * @param {string} sessionId - Session ID
   * @param {string} content - Message content
   * @param {object} options - Optional parameters
   * @param {string} options.mode - Mode (ask/plan/bypass), affects permission-mode
   */
  async sendMessage(sessionId, content, options = {}) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) throw new Error('Session not found');

    const { serverIp, model, claudeSessionId, allowedTools, systemPrompt, mode: sessionMode } = session;
    const mode = options.mode || sessionMode || 'ask';

    // Build claude command
    // NOTE: --allowedTools is variadic and consumes all remaining positional args,
    // so the message must come BEFORE it in the command line.
    const args = ['-p'];

    if (claudeSessionId) {
      args.push('--resume', claudeSessionId);
    }

    args.push('--model', model);
    args.push('--output-format', 'stream-json');
    args.push('--verbose');

    // Map mode to permission-mode
    // ask: normal mode (requireApproval)
    // plan: plan mode (requireApproval)
    // bypass: bypass mode (bypassPermissions)
    const permissionMode = mode === 'bypass' ? 'bypassPermissions' : 'requireApproval';
    args.push('--permission-mode', permissionMode);

    if (systemPrompt && !claudeSessionId) {
      args.push('--system-prompt', JSON.stringify(systemPrompt));
    }

    // Escape the user message for shell
    const escapedContent = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

    // Variadic args (--allowedTools) must come AFTER the message
    const trailingArgs = [];
    if (allowedTools && allowedTools.length > 0) {
      trailingArgs.push('--allowedTools', allowedTools.join(','));
    }

    const claudePath = await this._detectClaudePath(serverIp);
    const fullCommand = `cd /home/ubuntu/agent-skill && ${claudePath} ${args.join(' ')} "${escapedContent}" ${trailingArgs.join(' ')}`;

    console.log(`[ClaudeRunner] Executing on ${serverIp}: ${claudePath} ${args.join(' ')} '<message>'`);

    // Save user message
    store.addMessage(sessionId, 'user', content);

    // Execute via SSH and stream output
    const emitter = new EventEmitter();

    try {
      const pool = getSSHPool();
      const connection = pool.connections?.get(serverIp);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`No active SSH connection to ${serverIp}`);
      }

      const client = connection.client;

      client.exec(fullCommand, { pty: true }, (err, stream) => {
        if (err) {
          emitter.emit('error', err);
          return;
        }

        let fullResponse = '';
        let extractedSessionId = null;
        let buffer = '';

        stream.on('data', (data) => {
          buffer += data.toString();

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const parsed = JSON.parse(line);
              // Extract Claude session ID from the first response
              if (parsed.session_id && !extractedSessionId) {
                extractedSessionId = parsed.session_id;
                store.update(sessionId, {
                  claudeSessionId: extractedSessionId,
                  status: 'running'
                });
              }

              // Map stream-json events to our SSE format
              if (parsed.type === 'assistant' && parsed.message) {
                const textBlocks = (parsed.message.content || [])
                  .filter(b => b.type === 'text')
                  .map(b => b.text)
                  .join('');
                if (textBlocks) {
                  fullResponse += textBlocks;
                  emitter.emit('data', {
                    event: 'assistant_text',
                    data: { text: textBlocks }
                  });
                }

                const toolBlocks = (parsed.message.content || [])
                  .filter(b => b.type === 'tool_use');
                for (const tool of toolBlocks) {
                  emitter.emit('data', {
                    event: 'tool_use',
                    data: { tool: tool.name, input: tool.input, id: tool.id }
                  });
                }
              }

              if (parsed.type === 'content_block_delta') {
                if (parsed.delta?.type === 'text_delta') {
                  fullResponse += parsed.delta.text;
                  emitter.emit('data', {
                    event: 'assistant_text',
                    data: { text: parsed.delta.text }
                  });
                }
              }

              if (parsed.type === 'result') {
                if (parsed.session_id) {
                  store.update(sessionId, {
                    claudeSessionId: parsed.session_id,
                    status: 'running'
                  });
                }
                emitter.emit('data', {
                  event: 'result',
                  data: {
                    sessionId: parsed.session_id,
                    costUsd: parsed.cost_usd,
                    durationMs: parsed.duration_ms,
                    numTurns: parsed.num_turns
                  }
                });
              }

            } catch (parseErr) {
              // Not JSON, might be raw text output
              if (line.trim()) {
                fullResponse += line;
                emitter.emit('data', {
                  event: 'assistant_text',
                  data: { text: line }
                });
              }
            }
          }
        });

        stream.stderr.on('data', (data) => {
          const errText = data.toString();
          console.error(`[ClaudeRunner] stderr: ${errText}`);
          if (errText.includes('Error') || errText.includes('error')) {
            emitter.emit('data', {
              event: 'error',
              data: { message: errText.trim() }
            });
          }
        });

        stream.on('close', (code) => {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer);
              if (parsed.type === 'result' && parsed.session_id) {
                store.update(sessionId, {
                  claudeSessionId: parsed.session_id,
                  status: 'running'
                });
              }
            } catch {
              // Ignore
            }
          }

          // Save assistant response
          if (fullResponse) {
            store.addMessage(sessionId, 'assistant', fullResponse);
          }

          store.update(sessionId, { lastActivity: new Date().toISOString() });

          emitter.emit('data', {
            event: 'done',
            data: { exitCode: code, messageCount: store.get(sessionId)?.messageCount }
          });
          emitter.emit('end');
        });

        // Store reference to stream for potential cancellation
        this.activeProcesses.set(sessionId, { stream, pid: null });
      });

    } catch (err) {
      emitter.emit('error', err);
    }

    return emitter;
  }

  async stopSession(sessionId) {
    const active = this.activeProcesses.get(sessionId);
    if (active?.stream) {
      active.stream.signal('SIGINT');
      this.activeProcesses.delete(sessionId);
    }
  }

  async checkHealth(sessionId) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) return { alive: false, reason: 'Session not found' };

    try {
      const sshPool = getSSHPool();
      await sshPool.exec(session.serverIp, 'pgrep -f "claude"', { timeout: 5000 });
      return { alive: true };
    } catch {
      return { alive: false, reason: 'Process not found' };
    }
  }

  /**
   * Get context usage for a session by executing /context command
   * Returns { used, total, percentage } or null if session not found
   */
  async getContext(sessionId) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) return null;

    const { serverIp, claudeSessionId } = session;
    if (!claudeSessionId) {
      // No Claude session yet, return 0 usage
      return { used: 0, total: 200000, percentage: 0 };
    }

    try {
      const claudePath = await this._detectClaudePath(serverIp);
      const command = `cd /home/ubuntu/agent-skill && ${claudePath} -p --resume ${claudeSessionId} --output-format stream-json '/context'`;

      console.log(`[ClaudeRunner] Getting context for session ${sessionId} on ${serverIp}`);

      const pool = getSSHPool();
      const output = await pool.exec(serverIp, command, { timeout: 15000 });

      // Parse the stream-json output to find context info
      const lines = output.split('\n').filter(line => line.trim());
      let contextInfo = { used: 0, total: 200000, percentage: 0 };

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          // Look for assistant response with context info
          if (parsed.type === 'assistant' && parsed.message?.content) {
            const textBlocks = parsed.message.content
              .filter(b => b.type === 'text')
              .map(b => b.text)
              .join('');

            // Match "Token usage: 75000/200000" or similar
            const tokenMatch = textBlocks.match(/Token usage:\s*(\d+)\/(\d+)/i);
            if (tokenMatch) {
              const used = parseInt(tokenMatch[1], 10);
              const total = parseInt(tokenMatch[2], 10);
              contextInfo = {
                used,
                total,
                percentage: Math.round((used / total) * 100)
              };
              break;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      return contextInfo;
    } catch (err) {
      console.error(`[ClaudeRunner] Failed to get context for ${sessionId}:`, err.message);
      return { used: 0, total: 200000, percentage: 0 };
    }
  }

  /**
   * Compact a session's context by executing /compact command
   * Returns the compaction result message or error
   */
  async compact(sessionId) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) throw new Error('Session not found');

    const { serverIp, claudeSessionId } = session;
    if (!claudeSessionId) {
      throw new Error('Cannot compact: No active Claude session');
    }

    try {
      const claudePath = await this._detectClaudePath(serverIp);
      const command = `cd /home/ubuntu/agent-skill && ${claudePath} -p --resume ${claudeSessionId} --output-format stream-json '/compact'`;

      console.log(`[ClaudeRunner] Compacting session ${sessionId} on ${serverIp}`);

      const pool = getSSHPool();
      const output = await pool.exec(serverIp, command, { timeout: 30000 });

      // Parse the stream-json output to extract compact result
      const lines = output.split('\n').filter(line => line.trim());
      let resultMessage = 'Context compacted successfully';

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          // Extract assistant response about compaction
          if (parsed.type === 'assistant' && parsed.message?.content) {
            const textBlocks = parsed.message.content
              .filter(b => b.type === 'text')
              .map(b => b.text)
              .join('');

            if (textBlocks.trim()) {
              resultMessage = textBlocks.trim();
              break;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Add system message to session history
      store.addMessage(sessionId, 'assistant', resultMessage);

      return { success: true, message: resultMessage };
    } catch (err) {
      console.error(`[ClaudeRunner] Failed to compact ${sessionId}:`, err.message);
      throw new Error(`Compact failed: ${err.message}`);
    }
  }

  async _detectClaudePath(ip) {
    const sshPool = getSSHPool();
    try {
      const result = await sshPool.exec(ip, 'which claude', { timeout: 5000 });
      return result.trim();
    } catch {
      for (const p of ['/home/ubuntu/.local/bin/claude', '/usr/local/bin/claude']) {
        try {
          await sshPool.exec(ip, `test -f ${p}`, { timeout: 3000 });
          return p;
        } catch { /* continue */ }
      }
      return 'claude';
    }
  }
}

let instance = null;
export function getClaudeRunner() {
  if (!instance) instance = new ClaudeRunner();
  return instance;
}
export { ClaudeRunner };
