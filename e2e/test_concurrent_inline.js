/**
 * Inline E2E test for concurrent chat sessions.
 * Designed to run INSIDE the system-monitor pod via kubectl exec.
 * Uses node's built-in http module to handle SSE streaming.
 */
const http = require('http');

const API_HOST = '127.0.0.1';
const API_PORT = 3000;
const API_PREFIX = '/api/chat';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: API_HOST,
      port: API_PORT,
      path: API_PREFIX + path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (d) => buf += d);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch { resolve(buf); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sendSSE(sessionId, content) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const data = JSON.stringify({ content, mode: 'ask' });
    let fullText = '';
    let tokenCount = 0;
    let toolCount = 0;
    let firstTokenTime = null;
    let buffer = '';
    let currentEvent = 'assistant_text';

    const opts = {
      hostname: API_HOST,
      port: API_PORT,
      path: `${API_PREFIX}/sessions/${sessionId}/message`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
    };

    const req = http.request(opts, (res) => {
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.substring(6));
              if (currentEvent === 'assistant_text' && d.text) {
                if (!firstTokenTime) firstTokenTime = Date.now();
                fullText += d.text;
                tokenCount++;
              }
              if (currentEvent === 'tool_use') toolCount++;
            } catch {}
          }
        }
      });

      res.on('end', () => {
        const elapsed = Date.now() - start;
        const ttft = firstTokenTime ? firstTokenTime - start : null;
        resolve({ fullText, tokenCount, toolCount, elapsed, ttft });
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Concurrent Chat E2E Test (in-pod) ===\n');

  // Get server IP
  const serversData = await request('GET', '/servers');
  const serverIp = serversData.servers[0].ip;
  console.log(`[SERVER] ${serverIp}\n`);

  // Create sessions
  const sA = await request('POST', '/sessions', { serverIp, model: 'haiku', sessionName: 'E2E-ConcA' });
  const sB = await request('POST', '/sessions', { serverIp, model: 'haiku', sessionName: 'E2E-ConcB' });
  console.log(`[SESSION A] ${sA.id}`);
  console.log(`[SESSION B] ${sB.id}\n`);

  // Send messages concurrently
  console.log('--- Sending messages simultaneously ---');
  const promptA = 'Reply with exactly: "ALPHA" and nothing else.';
  const promptB = 'Reply with exactly: "BRAVO" and nothing else.';

  const wallStart = Date.now();
  const [rA, rB] = await Promise.all([
    sendSSE(sA.id, promptA),
    sendSSE(sB.id, promptB),
  ]);
  const wallTime = Date.now() - wallStart;

  // Results
  console.log(`\n--- Results ---`);
  console.log(`[A] ${rA.tokenCount} tokens, ${rA.elapsed}ms, TTFT ${rA.ttft}ms`);
  console.log(`[A] "${rA.fullText.substring(0, 200)}"`);
  console.log(`[B] ${rB.tokenCount} tokens, ${rB.elapsed}ms, TTFT ${rB.ttft}ms`);
  console.log(`[B] "${rB.fullText.substring(0, 200)}"`);
  console.log(`[WALL] ${wallTime}ms (sum: ${rA.elapsed + rB.elapsed}ms)\n`);

  // Assertions
  console.log('--- Assertions ---');
  let pass = 0, total = 0;
  function assert(cond, msg) {
    total++;
    if (cond) { pass++; console.log('  ✅ ' + msg); }
    else { console.log('  ❌ ' + msg); }
  }

  assert(rA.fullText.length > 0, 'Session A received text');
  assert(rB.fullText.length > 0, 'Session B received text');
  assert(rA.tokenCount > 0, 'Session A got streaming tokens');
  assert(rB.tokenCount > 0, 'Session B got streaming tokens');
  assert(rA.ttft !== null, 'Session A got first token');
  assert(rB.ttft !== null, 'Session B got first token');
  assert(rA.fullText !== rB.fullText, 'Responses are different');

  const sumMs = rA.elapsed + rB.elapsed;
  assert(wallTime < sumMs * 0.9, `Parallel speedup (${wallTime}ms < 90% of ${sumMs}ms)`);

  console.log(`\n=== ${pass}/${total} passed ===`);

  // Cleanup
  await request('DELETE', `/sessions/${sA.id}`);
  await request('DELETE', `/sessions/${sB.id}`);
  console.log('[CLEANUP] Done');

  process.exit(pass === total ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
