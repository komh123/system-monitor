/**
 * RWD Breakpoint Test — System Monitor
 * Tests responsive layout at 5 breakpoints:
 *   - 320px  (iPhone SE / tiny phone)
 *   - 393px  (iPhone 14 Pro)
 *   - 768px  (iPad mini portrait)
 *   - 1024px (iPad landscape / small laptop)
 *   - 1440px (Desktop)
 *
 * Checks: overflow, touch targets, text readability, layout integrity
 */

const puppeteer = require('/home/ubuntu/agent-skill/node_modules/puppeteer');

const BASE_URL = 'https://monitor.ko.unieai.com';
const SCREENSHOT_DIR = '/home/ubuntu/system-monitor/e2e/screenshots-rwd';

const BREAKPOINTS = [
  { name: 'iPhone SE',       width: 320,  height: 568,  dpr: 2, isMobile: true  },
  { name: 'iPhone 14 Pro',   width: 393,  height: 852,  dpr: 3, isMobile: true  },
  { name: 'iPad mini',       width: 768,  height: 1024, dpr: 2, isMobile: true  },
  { name: 'Laptop',          width: 1024, height: 768,  dpr: 1, isMobile: false },
  { name: 'Desktop',         width: 1440, height: 900,  dpr: 1, isMobile: false },
];

const PAGES_TO_TEST = [
  { path: '/',        name: 'Dashboard' },
  { path: '/chat',    name: 'Chat' },
  { path: '/cpu',     name: 'CPU Monitor' },
  { path: '/claude',  name: 'Claude Remote' },
  { path: '/usage',   name: 'Usage' },
];

let passCount = 0, warnCount = 0, failCount = 0;
const issues = [];

function log(msg, color = '') {
  const c = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m' };
  console.log(`${c[color] || ''}${msg}${c.reset}`);
}
function pass(msg, detail = '') { passCount++; log(`  ✅ ${msg}${detail ? ' — ' + detail : ''}`, 'green'); }
function warn(msg, detail = '') { warnCount++; issues.push({ type: 'warn', msg, detail }); log(`  ⚠️  ${msg}${detail ? ': ' + detail : ''}`, 'yellow'); }
function fail(msg, detail = '') { failCount++; issues.push({ type: 'fail', msg, detail }); log(`  ❌ ${msg}${detail ? ': ' + detail : ''}`, 'red'); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getAuthToken() {
  const { execSync } = require('child_process');
  const raw = execSync(
    `sudo kubectl exec deploy/system-monitor -n deployer-dev -- node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({userId:'rwd-test',username:'rwd-test'},process.env.JWT_SECRET,{expiresIn:'1h'}))"`,
    { encoding: 'utf8' }
  );
  return raw.split('\n').find(line => line.startsWith('ey')) || raw.trim();
}

async function screenshot(page, name) {
  const fs = require('fs');
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
  log(`  📸 ${name}.png`, 'dim');
}

async function checkRWD(page, bpName, pageName) {
  const vw = await page.evaluate(() => window.innerWidth);

  // 1. Horizontal overflow check
  const hOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  if (hOverflow) {
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    fail(`[${bpName}] ${pageName}: Horizontal overflow`, `scroll=${scrollW}px > client=${clientW}px`);
  } else {
    pass(`[${bpName}] ${pageName}: No horizontal overflow`);
  }

  // 2. Elements extending beyond viewport
  const overflowing = await page.evaluate((viewportWidth) => {
    const results = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.right > viewportWidth + 2 && rect.width > 0 && rect.height > 0) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className?.toString().substring(0, 60) || '';
        results.push({ tag, cls, right: Math.round(rect.right), overflow: Math.round(rect.right - viewportWidth) });
      }
    }
    return results.slice(0, 5); // top 5
  }, vw);

  if (overflowing.length > 0) {
    warn(`[${bpName}] ${pageName}: ${overflowing.length} elements extend beyond viewport`,
      overflowing.map(e => `<${e.tag}> +${e.overflow}px`).join(', '));
  }

  // 3. Text readability (check for text < 11px)
  const tinyText = await page.evaluate(() => {
    const results = [];
    const textEls = document.querySelectorAll('span, p, td, th, label, a, button, div, li');
    for (const el of textEls) {
      if (el.children.length > 0 && el.querySelector('span, p, td, th')) continue; // skip parents
      const text = el.textContent?.trim();
      if (!text || text.length === 0) continue;
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      if (fontSize < 11 && el.offsetWidth > 0 && el.offsetHeight > 0) {
        results.push({
          text: text.substring(0, 30),
          size: Math.round(fontSize * 10) / 10,
          tag: el.tagName.toLowerCase()
        });
      }
    }
    return results.slice(0, 5);
  });

  if (tinyText.length > 0) {
    warn(`[${bpName}] ${pageName}: ${tinyText.length} elements with text < 11px`,
      tinyText.map(t => `"${t.text}" ${t.size}px`).join('; '));
  } else {
    pass(`[${bpName}] ${pageName}: All text readable (≥ 11px)`);
  }

  // 4. Touch targets for mobile
  if (vw <= 768) {
    const smallTargets = await page.evaluate(() => {
      const results = [];
      const interactives = document.querySelectorAll('button, a, input, select, [role="button"]');
      for (const el of interactives) {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (el.offsetWidth < 32 && el.offsetHeight < 32) {
          results.push({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().substring(0, 20),
            w: el.offsetWidth,
            h: el.offsetHeight
          });
        }
      }
      return results.slice(0, 5);
    });

    if (smallTargets.length > 0) {
      warn(`[${bpName}] ${pageName}: ${smallTargets.length} tiny touch targets (< 32px)`,
        smallTargets.map(t => `"${t.text}" ${t.w}x${t.h}`).join('; '));
    } else {
      pass(`[${bpName}] ${pageName}: Touch targets adequate`);
    }
  }

  // 5. Viewport fitting — content visible
  const contentHeight = await page.evaluate(() => document.body.scrollHeight);
  if (contentHeight < 100) {
    fail(`[${bpName}] ${pageName}: Content barely renders`, `height=${contentHeight}px`);
  }

  // 6. Navigation visible
  const navCheck = await page.evaluate(() => {
    const nav = document.querySelector('nav') || document.querySelector('[class*="Navigation"]') || document.querySelector('[class*="flex"][class*="bg-slate-800"]');
    if (!nav) return { found: false };
    const rect = nav.getBoundingClientRect();
    return { found: true, visible: rect.height > 0, height: rect.height };
  });
  if (!navCheck.found || !navCheck.visible) {
    warn(`[${bpName}] ${pageName}: Navigation not visible`);
  }
}

async function main() {
  log('\n🔬 System Monitor — RWD Breakpoint Test Suite', 'cyan');
  log(`📐 Testing ${BREAKPOINTS.length} breakpoints × ${PAGES_TO_TEST.length} pages = ${BREAKPOINTS.length * PAGES_TO_TEST.length} combinations`, 'cyan');
  log(`📅 ${new Date().toISOString()}\n`, 'dim');

  const token = await getAuthToken();
  log(`🔑 Auth token generated (${token.length} chars)`, 'dim');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    for (const bp of BREAKPOINTS) {
      log(`\n${'═'.repeat(60)}`, 'cyan');
      log(`📱 ${bp.name} (${bp.width}×${bp.height}, DPR ${bp.dpr}, mobile=${bp.isMobile})`, 'cyan');
      log(`${'═'.repeat(60)}`, 'cyan');

      const page = await browser.newPage();

      await page.setViewport({
        width: bp.width,
        height: bp.height,
        deviceScaleFactor: bp.dpr,
        isMobile: bp.isMobile,
        hasTouch: bp.isMobile
      });

      // Inject auth token
      await page.evaluateOnNewDocument((t) => {
        localStorage.setItem('auth_token', t);
      }, token);

      for (const pg of PAGES_TO_TEST) {
        log(`\n  --- ${pg.name} (${pg.path}) ---`, 'dim');

        await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'networkidle2', timeout: 15000 });
        await sleep(500);

        // Check if redirected to login
        const url = page.url();
        if (url.includes('/login')) {
          warn(`[${bp.name}] ${pg.name}: Redirected to login — auth issue`);
          continue;
        }

        await screenshot(page, `${bp.name.replace(/\s+/g, '-').toLowerCase()}_${pg.name.toLowerCase()}`);
        await checkRWD(page, bp.name, pg.name);
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }

  // Summary
  log(`\n${'═'.repeat(60)}`, 'cyan');
  log('📊 RWD TEST RESULTS SUMMARY', 'cyan');
  log(`${'═'.repeat(60)}`, 'cyan');
  log(`  ✅ PASS: ${passCount}`, 'green');
  log(`  ⚠️  WARN: ${warnCount}`, 'yellow');
  log(`  ❌ FAIL: ${failCount}`, 'red');

  if (issues.length > 0) {
    log(`\n🔍 Issues Found:`, 'yellow');
    for (const issue of issues) {
      const icon = issue.type === 'fail' ? '❌' : '⚠️ ';
      log(`  ${icon} ${issue.msg}${issue.detail ? ': ' + issue.detail : ''}`, issue.type === 'fail' ? 'red' : 'yellow');
    }
  }

  log(`\n${'═'.repeat(60)}`, 'cyan');

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
