import { getSSHPool } from './sshPool.js';
import { getChatSessionStore } from './chatSessionStore.js';
import { buildSystemPrompt, getProjectCwd } from './configLoader.js';
import { EventEmitter } from 'events';

/**
 * ClaudeRunner — communicates with sdk-runner process on remote servers
 * via SSH channel using NDJSON protocol over stdin (commands) / stderr (events).
 *
 * The SDK runner uses stderr for protocol because the Agent SDK internally
 * captures stdout for its child process communication.
 */
class ClaudeRunner extends EventEmitter {
  constructor() {
    super();
    this.activeProcesses = new Map(); // sessionId → { stream, requestId }
  }

  /**
   * Send a message to a Claude session and stream the response.
   * Returns an EventEmitter that emits: 'data' (SSE events), 'error', 'end'
   *
   * @param {string} sessionId - Session ID
   * @param {string} content - Message content
   * @param {object} options - Optional parameters
   * @param {string} options.mode - Mode (ask/plan/bypass), affects permissionMode
   * @param {Array} options.images - Optional image content blocks for multimodal
   */
  async sendMessage(sessionId, content, options = {}) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) throw new Error('Session not found');

    const { serverIp, model, claudeSessionId, allowedTools, systemPrompt, mode: sessionMode } = session;
    const mode = options.mode || sessionMode || 'ask';

    // Map mode to SDK permissionMode
    const permissionModeMap = {
      'ask': 'default',
      'plan': 'plan',
      'bypass': 'bypassPermissions',
      'auto': 'auto',
      'acceptEdits': 'acceptEdits',
      'dontAsk': 'dontAsk',
    };
    const permissionMode = permissionModeMap[mode] || 'default';

    // Build SDK query command
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Detect project from session type for config injection
    const sessionType = session.type || '';
    const projectCwd = getProjectCwd(sessionType);

    const queryCmd = {
      cmd: 'query',
      id: requestId,
      prompt: content,
      options: {
        model: model || 'sonnet',
        cwd: projectCwd,
        permissionMode,
        allowedTools: allowedTools || ['Read', 'Edit', 'Bash', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
      }
    };

    // Include images for multimodal
    if (options.images && options.images.length > 0) {
      queryCmd.images = options.images;
    }

    // Resume existing session
    if (claudeSessionId) {
      queryCmd.options.resume = claudeSessionId;
    }

    // System prompt only on first message — inject rules + CLAUDE.md + memory
    if (!claudeSessionId) {
      queryCmd.options.systemPrompt = systemPrompt || buildSystemPrompt({
        sessionType,
        customPrompt: session.customPrompt
      });
    }

    console.log(`[ClaudeRunner] Sending SDK query ${requestId} to ${serverIp} (model=${model}, resume=${!!claudeSessionId})`);

    // Save user message (store image metadata but not base64 data)
    const hasImages = !!(options.images && options.images.length > 0);
    store.addMessage(sessionId, 'user', content, null, {
      hasImages,
      imageCount: hasImages ? options.images.length : 0
    });

    const emitter = new EventEmitter();

    try {
      const pool = getSSHPool();
      const connection = pool.connections?.get(serverIp);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`No active SSH connection to ${serverIp}`);
      }

      const client = connection.client;

      // Launch sdk-runner process via SSH exec
      const sdkRunnerCmd = 'cd /home/ubuntu/agent-skill/sdk-runner && node index.js';

      client.exec(sdkRunnerCmd, {}, (err, stream) => {
        if (err) {
          emitter.emit('error', err);
          return;
        }

        let fullResponse = '';
        let stderrBuffer = '';

        // Store reference for cancellation
        this.activeProcesses.set(sessionId, { stream, requestId });

        // Send the query command via stdin, then close stdin to signal no more commands
        const cmdJson = JSON.stringify(queryCmd) + '\n';
        stream.write(cmdJson);
        stream.end(); // Close stdin — sdk-runner will finish the query then exit

        // Protocol events come from STDERR (SDK captures stdout)
        stream.stderr.on('data', (data) => {
          stderrBuffer += data.toString();

          // Process complete lines
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            // Debug log lines start with [LOG]
            if (line.startsWith('[LOG]')) {
              console.log(`[SdkRunner:${serverIp}] ${line}`);
              continue;
            }

            try {
              const event = JSON.parse(line);

              // Only process events for our request
              if (event.id !== requestId) continue;

              this._handleSdkEvent(event, sessionId, emitter, { fullResponse: { value: fullResponse }, store });
              // Update fullResponse from closure
              if (event.event === 'text' && event.data) {
                fullResponse += event.data;
              }
            } catch (parseErr) {
              // Not JSON protocol line — log it
              if (line.trim()) {
                console.log(`[SdkRunner:${serverIp}] Non-JSON: ${line.substring(0, 200)}`);
              }
            }
          }
        });

        // stdout — the SDK may write here, we ignore it for protocol purposes
        stream.on('data', (data) => {
          // SDK internal communication — ignore
        });

        stream.on('close', (code) => {
          // Process remaining stderr buffer
          if (stderrBuffer.trim()) {
            const remainingLines = stderrBuffer.split('\n');
            for (const line of remainingLines) {
              if (!line.trim() || line.startsWith('[LOG]')) continue;
              try {
                const event = JSON.parse(line);
                if (event.id === requestId) {
                  this._handleSdkEvent(event, sessionId, emitter, { fullResponse: { value: fullResponse }, store });
                  if (event.event === 'text' && event.data) {
                    fullResponse += event.data;
                  }
                }
              } catch { /* ignore */ }
            }
          }

          // Save assistant response
          if (fullResponse) {
            store.addMessage(sessionId, 'assistant', fullResponse);
          }

          store.update(sessionId, { lastActivity: new Date().toISOString() });

          // Emit done if not already emitted by sdk-runner
          emitter.emit('data', {
            event: 'done',
            data: { exitCode: code, messageCount: store.get(sessionId)?.messageCount }
          });
          emitter.emit('end');

          this.activeProcesses.delete(sessionId);
        });
      });

    } catch (err) {
      emitter.emit('error', err);
    }

    return emitter;
  }

  /**
   * Handle a single SDK runner event and map to SSE events
   */
  _handleSdkEvent(event, sessionId, emitter, ctx) {
    const store = ctx.store;

    switch (event.event) {
      case 'init': {
        // SDK session initialized — store claude session ID
        if (event.sessionId) {
          store.update(sessionId, {
            claudeSessionId: event.sessionId,
            status: 'running'
          });
        }
        break;
      }

      case 'text': {
        // Streaming text chunk
        if (event.data) {
          emitter.emit('data', {
            event: 'assistant_text',
            data: { text: event.data }
          });
        }
        break;
      }

      case 'tool_use': {
        // Tool invocation
        if (event.data) {
          emitter.emit('data', {
            event: 'tool_use',
            data: event.data
          });
        }
        break;
      }

      case 'tool_progress': {
        // Tool execution progress
        if (event.data) {
          emitter.emit('data', {
            event: 'tool_progress',
            data: event.data
          });
        }
        break;
      }

      case 'tool_summary': {
        // Tool result summary
        if (event.data) {
          emitter.emit('data', {
            event: 'tool_summary',
            data: event.data
          });
        }
        break;
      }

      case 'result': {
        // Final result with usage stats
        const resultData = event.data || {};

        if (resultData.sessionId) {
          store.update(sessionId, {
            claudeSessionId: resultData.sessionId,
            status: 'running'
          });
        }

        const contextUsed = resultData.contextUsed || 0;
        const contextTotal = resultData.contextTotal || 200000;

        if (contextUsed > 0) {
          store.update(sessionId, {
            contextUsed,
            contextTotal,
            contextPercentage: Math.round((contextUsed / contextTotal) * 100)
          });
        }

        emitter.emit('data', {
          event: 'result',
          data: {
            sessionId: resultData.sessionId,
            costUsd: resultData.costUsd,
            durationMs: resultData.durationMs,
            numTurns: resultData.numTurns,
            contextUsed,
            contextTotal,
            isError: resultData.isError
          }
        });
        break;
      }

      case 'rate_limit': {
        // Rate limit info
        if (event.data) {
          emitter.emit('data', {
            event: 'rate_limit',
            data: event.data
          });
        }
        break;
      }

      case 'status': {
        // Status updates (retrying, etc.)
        emitter.emit('data', {
          event: 'status',
          data: event
        });
        break;
      }

      case 'error': {
        emitter.emit('data', {
          event: 'error',
          data: { message: event.error || 'Unknown error' }
        });
        break;
      }

      case 'done': {
        // SDK runner signals query complete — don't emit SSE done here,
        // wait for stream close to ensure we've collected all data
        break;
      }

      case 'pong': {
        // Health check response — handled separately
        break;
      }

      // Ignore: interrupted, aborted (handled by stopSession)
      default:
        break;
    }
  }

  /**
   * Stop a running session by closing the SSH stream
   */
  async stopSession(sessionId) {
    const active = this.activeProcesses.get(sessionId);
    if (active?.stream) {
      // Send SIGINT to the sdk-runner process
      active.stream.signal('SIGINT');
      this.activeProcesses.delete(sessionId);
    }
  }

  /**
   * Check if Claude process is alive on the remote server
   */
  async checkHealth(sessionId) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) return { alive: false, reason: 'Session not found' };

    try {
      const sshPool = getSSHPool();
      // Check if node/claude processes are running
      await sshPool.exec(session.serverIp, 'pgrep -f "claude"', { timeout: 5000 });
      return { alive: true };
    } catch {
      return { alive: false, reason: 'Process not found' };
    }
  }

  /**
   * Get context usage for a session from cached session data.
   * No SSH call needed — context is tracked from 'result' events during messages.
   */
  async getContext(sessionId) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) return null;

    return {
      used: session.contextUsed || 0,
      total: session.contextTotal || 200000,
      percentage: session.contextPercentage || 0
    };
  }

  /**
   * Compact a session's context by sending /compact through sdk-runner
   */
  async compact(sessionId) {
    const store = getChatSessionStore();
    const session = store.get(sessionId);
    if (!session) throw new Error('Session not found');

    const { serverIp, claudeSessionId, model, allowedTools } = session;
    if (!claudeSessionId) {
      throw new Error('Cannot compact: No active Claude session');
    }

    console.log(`[ClaudeRunner] Compacting session ${sessionId} on ${serverIp}`);

    try {
      const pool = getSSHPool();
      const connection = pool.connections?.get(serverIp);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`No active SSH connection to ${serverIp}`);
      }

      const client = connection.client;
      const requestId = `compact-${Date.now()}`;

      const sessionType = session.type || '';
      const projectCwd = getProjectCwd(sessionType);

      const queryCmd = {
        cmd: 'query',
        id: requestId,
        prompt: '/compact',
        options: {
          model: model || 'sonnet',
          cwd: projectCwd,
          permissionMode: 'bypassPermissions',
          allowedTools: allowedTools || ['Read', 'Edit', 'Bash', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
          resume: claudeSessionId,
        }
      };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Compact timeout (60s)'));
        }, 60000);

        client.exec('cd /home/ubuntu/agent-skill/sdk-runner && node index.js', {}, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            return reject(err);
          }

          let resultMessage = 'Context compacted successfully';
          let stderrBuffer = '';

          // Send compact command
          stream.write(JSON.stringify(queryCmd) + '\n');
          stream.end();

          stream.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
            const lines = stderrBuffer.split('\n');
            stderrBuffer = lines.pop();

            for (const line of lines) {
              if (!line.trim() || line.startsWith('[LOG]')) continue;
              try {
                const event = JSON.parse(line);
                if (event.id !== requestId) continue;

                if (event.event === 'text' && event.data) {
                  resultMessage = event.data;
                }
                if (event.event === 'result' && event.data?.sessionId) {
                  store.update(sessionId, {
                    claudeSessionId: event.data.sessionId,
                  });
                }
              } catch { /* ignore */ }
            }
          });

          stream.on('data', () => { /* ignore stdout */ });

          stream.on('close', () => {
            clearTimeout(timeout);
            store.addMessage(sessionId, 'assistant', resultMessage);
            resolve({ success: true, message: resultMessage });
          });
        });
      });
    } catch (err) {
      console.error(`[ClaudeRunner] Failed to compact ${sessionId}:`, err.message);
      throw new Error(`Compact failed: ${err.message}`);
    }
  }
}

let instance = null;
export function getClaudeRunner() {
  if (!instance) instance = new ClaudeRunner();
  return instance;
}
export { ClaudeRunner };
