/**
 * E2E Test: Multi-turn Concurrent Chat Sessions
 *
 * Tests that two sessions can hold independent multi-turn conversations
 * with context preserved, while running concurrently.
 */
const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3000;
const PREFIX = '/api/chat';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: HOST, port: PORT, path: PREFIX + path, method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sendSSE(sessionId, content) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let fullText = '', tokenCount = 0, toolCount = 0, firstTokenTime = null;
    let buffer = '', currentEvent = 'assistant_text';

    const req = http.request({
      hostname: HOST, port: PORT,
      path: `${PREFIX}/sessions/${sessionId}/message`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    }, (res) => {
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event: ')) currentEvent = line.substring(7).trim();
          else if (line.startsWith('data: ')) {
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
        resolve({ fullText, tokenCount, toolCount, elapsed: Date.now() - start, ttft: firstTokenTime ? firstTokenTime - start : null });
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify({ content, mode: 'ask' }));
    req.end();
  });
}

async function main() {
  console.log('=== Multi-Turn Concurrent Chat E2E Test ===\n');

  const servers = await request('GET', '/servers');
  const serverIp = servers.servers[0].ip;
  console.log(`[SERVER] ${serverIp}\n`);

  // Create two sessions
  const sA = await request('POST', '/sessions', { serverIp, model: 'haiku', sessionName: 'Multi-A' });
  const sB = await request('POST', '/sessions', { serverIp, model: 'haiku', sessionName: 'Multi-B' });
  console.log(`[A] ${sA.id}`);
  console.log(`[B] ${sB.id}\n`);

  let pass = 0, total = 0;
  function assert(cond, msg) {
    total++;
    if (cond) { pass++; console.log(`  ✅ ${msg}`); }
    else { console.log(`  ❌ ${msg}`); }
  }

  // =========================================
  // Turn 1: Give each session a secret word
  // =========================================
  console.log('--- Turn 1: Set secret words (parallel) ---');
  const t1Start = Date.now();
  const [r1A, r1B] = await Promise.all([
    sendSSE(sA.id, 'Remember this secret word: PHOENIX. Just confirm you remember it. Reply briefly.'),
    sendSSE(sB.id, 'Remember this secret word: GLACIER. Just confirm you remember it. Reply briefly.'),
  ]);
  const t1Wall = Date.now() - t1Start;

  console.log(`[A] (${r1A.elapsed}ms): "${r1A.fullText.substring(0, 120)}"`);
  console.log(`[B] (${r1B.elapsed}ms): "${r1B.fullText.substring(0, 120)}"`);
  console.log(`[WALL] ${t1Wall}ms\n`);

  assert(r1A.fullText.length > 0, 'T1: Session A responded');
  assert(r1B.fullText.length > 0, 'T1: Session B responded');
  assert(t1Wall < (r1A.elapsed + r1B.elapsed) * 0.9, `T1: Parallel (${t1Wall}ms < 90% of ${r1A.elapsed + r1B.elapsed}ms)`);

  // =========================================
  // Turn 2: Ask unrelated question (parallel)
  // =========================================
  console.log('--- Turn 2: Unrelated question (parallel) ---');
  const t2Start = Date.now();
  const [r2A, r2B] = await Promise.all([
    sendSSE(sA.id, 'What is 7 * 8? Just the number.'),
    sendSSE(sB.id, 'What is 12 + 15? Just the number.'),
  ]);
  const t2Wall = Date.now() - t2Start;

  console.log(`[A] (${r2A.elapsed}ms): "${r2A.fullText.substring(0, 120)}"`);
  console.log(`[B] (${r2B.elapsed}ms): "${r2B.fullText.substring(0, 120)}"`);
  console.log(`[WALL] ${t2Wall}ms\n`);

  assert(r2A.fullText.includes('56'), 'T2: Session A knows 7*8=56');
  assert(r2B.fullText.includes('27'), 'T2: Session B knows 12+15=27');
  assert(t2Wall < (r2A.elapsed + r2B.elapsed) * 0.9, `T2: Parallel (${t2Wall}ms < 90% of ${r2A.elapsed + r2B.elapsed}ms)`);

  // =========================================
  // Turn 3: Recall the secret word (parallel)
  // This is the KEY test — each session must
  // remember its OWN secret word and NOT the other's.
  // =========================================
  console.log('--- Turn 3: Recall secret words (parallel) ---');
  const t3Start = Date.now();
  const [r3A, r3B] = await Promise.all([
    sendSSE(sA.id, 'What was the secret word I told you? Reply with ONLY the word.'),
    sendSSE(sB.id, 'What was the secret word I told you? Reply with ONLY the word.'),
  ]);
  const t3Wall = Date.now() - t3Start;

  console.log(`[A] (${r3A.elapsed}ms): "${r3A.fullText.substring(0, 120)}"`);
  console.log(`[B] (${r3B.elapsed}ms): "${r3B.fullText.substring(0, 120)}"`);
  console.log(`[WALL] ${t3Wall}ms\n`);

  const aRecalled = r3A.fullText.toUpperCase().includes('PHOENIX');
  const bRecalled = r3B.fullText.toUpperCase().includes('GLACIER');
  const aCrossContaminated = r3A.fullText.toUpperCase().includes('GLACIER');
  const bCrossContaminated = r3B.fullText.toUpperCase().includes('PHOENIX');

  assert(aRecalled, 'T3: Session A recalls PHOENIX');
  assert(bRecalled, 'T3: Session B recalls GLACIER');
  assert(!aCrossContaminated, 'T3: Session A NOT contaminated with GLACIER');
  assert(!bCrossContaminated, 'T3: Session B NOT contaminated with PHOENIX');
  assert(t3Wall < (r3A.elapsed + r3B.elapsed) * 0.9, `T3: Parallel (${t3Wall}ms < 90% of ${r3A.elapsed + r3B.elapsed}ms)`);

  // =========================================
  // Turn 4: Sequential — A then B (verify no blocking)
  // =========================================
  console.log('--- Turn 4: Sequential A→B (verify B not blocked) ---');
  const r4A = await sendSSE(sA.id, 'Say "DONE-A" and nothing else.');
  console.log(`[A] (${r4A.elapsed}ms): "${r4A.fullText.substring(0, 80)}"`);

  const r4B = await sendSSE(sB.id, 'Say "DONE-B" and nothing else.');
  console.log(`[B] (${r4B.elapsed}ms): "${r4B.fullText.substring(0, 80)}"`);
  console.log('');

  assert(r4A.fullText.toUpperCase().includes('DONE-A') || r4A.fullText.toUpperCase().includes('DONE'), 'T4: Session A responded after 4 turns');
  assert(r4B.fullText.toUpperCase().includes('DONE-B') || r4B.fullText.toUpperCase().includes('DONE'), 'T4: Session B responded after 4 turns');

  // =========================================
  // Summary
  // =========================================
  console.log(`\n=== ${pass}/${total} passed ===\n`);

  // Verify message history
  const histA = await request('GET', `/sessions/${sA.id}/history`);
  const histB = await request('GET', `/sessions/${sB.id}/history`);
  console.log(`[HISTORY] Session A: ${histA.messages?.length || 0} messages`);
  console.log(`[HISTORY] Session B: ${histB.messages?.length || 0} messages`);

  // Cleanup
  await request('DELETE', `/sessions/${sA.id}`);
  await request('DELETE', `/sessions/${sB.id}`);
  console.log('[CLEANUP] Done');

  process.exit(pass === total ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
