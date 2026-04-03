/**
 * E2E Test: Concurrent Chat Sessions
 *
 * Tests that two chat sessions can stream simultaneously and independently.
 * Uses raw HTTP to verify the SSE streaming works concurrently.
 */

const BASE = process.env.CHAT_API || 'https://monitor.ko.unieai.com/api/chat';

async function getServerIp() {
  const res = await fetch(`${BASE}/servers`);
  const data = await res.json();
  return data.servers?.[0]?.ip || '172.31.6.240';
}

async function createSession(name, serverIp) {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverIp,
      model: 'haiku',
      sessionName: name
    })
  });
  const data = await res.json();
  console.log(`[CREATE] Session "${name}" → ${data.id}`);
  return data;
}

function sendMessageSSE(sessionId, content) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let fullText = '';
    let firstTokenTime = null;
    let tokenCount = 0;
    let toolCount = 0;

    fetch(`${BASE}/sessions/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mode: 'ask' })
    }).then(res => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'assistant_text';

      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) {
            const elapsed = Date.now() - startTime;
            const ttft = firstTokenTime ? firstTokenTime - startTime : null;
            resolve({ fullText, tokenCount, toolCount, elapsed, ttft, sessionId });
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (currentEvent === 'assistant_text' && data.text) {
                  if (!firstTokenTime) firstTokenTime = Date.now();
                  fullText += data.text;
                  tokenCount++;
                }
                if (currentEvent === 'tool_use') toolCount++;
              } catch {}
            }
          }

          pump();
        }).catch(reject);
      }

      pump();
    }).catch(reject);
  });
}

async function deleteSession(sessionId) {
  await fetch(`${BASE}/sessions/${sessionId}`, { method: 'DELETE' });
}

async function main() {
  console.log('=== Concurrent Chat Session E2E Test ===\n');

  // Step 0: Get real server IP
  const serverIp = await getServerIp();
  console.log(`[SERVER] Using ${serverIp}\n`);

  // Step 1: Create two sessions
  console.log('--- Step 1: Create two sessions ---');
  const sessionA = await createSession('E2E-ConcurrentA', serverIp);
  const sessionB = await createSession('E2E-ConcurrentB', serverIp);
  console.log('');

  // Step 2: Send messages SIMULTANEOUSLY
  console.log('--- Step 2: Send messages simultaneously ---');
  const promptA = 'Say exactly: "Session A complete." Nothing else.';
  const promptB = 'Say exactly: "Session B complete." Nothing else.';

  console.log(`[SEND] Session A: "${promptA.substring(0, 50)}..."`);
  console.log(`[SEND] Session B: "${promptB.substring(0, 50)}..."`);
  console.log('');

  const startTime = Date.now();

  // Fire both requests at the same time
  const [resultA, resultB] = await Promise.all([
    sendMessageSSE(sessionA.id, promptA),
    sendMessageSSE(sessionB.id, promptB),
  ]);

  const totalTime = Date.now() - startTime;

  // Step 3: Verify results
  console.log('--- Step 3: Results ---');
  console.log(`[A] Tokens: ${resultA.tokenCount}, Tools: ${resultA.toolCount}, Time: ${resultA.elapsed}ms, TTFT: ${resultA.ttft}ms`);
  console.log(`[A] Response: "${resultA.fullText.substring(0, 100)}..."`);
  console.log('');
  console.log(`[B] Tokens: ${resultB.tokenCount}, Tools: ${resultB.toolCount}, Time: ${resultB.elapsed}ms, TTFT: ${resultB.ttft}ms`);
  console.log(`[B] Response: "${resultB.fullText.substring(0, 100)}..."`);
  console.log('');
  console.log(`[TOTAL] Both completed in ${totalTime}ms`);
  console.log('');

  // Step 4: Assertions
  console.log('--- Step 4: Assertions ---');
  const tests = [];

  // Both should have received text
  tests.push({
    name: 'Session A received text',
    pass: resultA.fullText.length > 0
  });
  tests.push({
    name: 'Session B received text',
    pass: resultB.fullText.length > 0
  });

  // Responses should be different (each mentions its own session)
  tests.push({
    name: 'Responses are independent (A mentions A)',
    pass: resultA.fullText.toLowerCase().includes('session a') || resultA.fullText.toLowerCase().includes('a complete')
  });
  tests.push({
    name: 'Responses are independent (B mentions B)',
    pass: resultB.fullText.toLowerCase().includes('session b') || resultB.fullText.toLowerCase().includes('b complete')
  });

  // If sessions ran truly in parallel, total time should be less than sum
  // (Allow some overhead — parallel should be < 1.5x the slower one)
  const maxSingle = Math.max(resultA.elapsed, resultB.elapsed);
  const sumBoth = resultA.elapsed + resultB.elapsed;
  tests.push({
    name: `Ran in parallel (total ${totalTime}ms < sum ${sumBoth}ms)`,
    pass: totalTime < sumBoth * 0.85 // At least 15% faster than sequential
  });

  // Both should have gotten first token
  tests.push({
    name: 'Session A got first token (TTFT)',
    pass: resultA.ttft !== null && resultA.ttft > 0
  });
  tests.push({
    name: 'Session B got first token (TTFT)',
    pass: resultB.ttft !== null && resultB.ttft > 0
  });

  let passed = 0;
  for (const t of tests) {
    const icon = t.pass ? '\u2705' : '\u274C';
    console.log(`  ${icon} ${t.name}`);
    if (t.pass) passed++;
  }

  console.log(`\n--- Summary: ${passed}/${tests.length} passed ---`);

  // Cleanup
  console.log('\n--- Cleanup ---');
  await deleteSession(sessionA.id);
  await deleteSession(sessionB.id);
  console.log('[CLEANUP] Sessions deleted');

  // Exit with code
  process.exit(passed === tests.length ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
