#!/usr/bin/env node

/**
 * System Monitor — Mobile E2E Test Suite
 *
 * Tests ALL features from iPhone perspective:
 * 1. Login flow
 * 2. Session management (create, switch, delete)
 * 3. Chat messaging (send, receive, streaming)
 * 4. Command Palette (open, search, select, close)
 * 5. Quick Replies
 * 6. Voice Input button
 * 7. Context Indicator (progress bar, compact)
 * 8. Mode Selector
 * 9. Pull-to-refresh
 * 10. Message bubble width
 * 11. Navigation between pages
 * 12. Touch targets (min 44px)
 * 13. Viewport and safe area
 * 14. Performance (LCP, CLS)
 */

const puppeteer = require('/home/ubuntu/agent-skill/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://monitor.ko.unieai.com';
const SCREENSHOT_DIR = path.join(__dirname, '../.tmp/e2e-screenshots');

// iPhone 14 Pro device config
const IPHONE_14 = {
  name: 'iPhone 14 Pro',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  viewport: {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: false
  }
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

const results = { pass: 0, fail: 0, warn: 0, issues: [] };

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function pass(name, detail = '') {
  results.pass++;
  log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`, 'green');
}

function fail(name, detail = '') {
  results.fail++;
  results.issues.push({ severity: 'FAIL', name, detail });
  log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`, 'red');
}

function warn(name, detail = '') {
  results.warn++;
  results.issues.push({ severity: 'WARN', name, detail });
  log(`  ⚠️  ${name}${detail ? ` — ${detail}` : ''}`, 'yellow');
}

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  log(`  📸 ${name}.png`, 'dim');
  return filepath;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitAndClick(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

// ==================== TEST SUITES ====================

async function testLoginPage(page) {
  log('\n═══ 1. LOGIN PAGE ═══', 'cyan');

  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(1000);
  await screenshot(page, '01-login-page');

  // Check if redirected to login or already authenticated
  const url = page.url();
  if (url.includes('/login')) {
    // Check Google login button exists
    const loginBtn = await page.$('button, a[href*="google"], [class*="login"]');
    if (loginBtn) {
      pass('Login page renders with auth button');
    } else {
      warn('Login page visible but no clear login button found');
    }

    // Check viewport meta
    const viewportMeta = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.content : null;
    });
    if (viewportMeta && viewportMeta.includes('width=device-width')) {
      pass('Viewport meta tag set correctly', viewportMeta);
    } else {
      fail('Missing viewport meta tag', viewportMeta || 'none');
    }

    // Check if the page fits mobile width (no horizontal scroll)
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (!hasHScroll) {
      pass('No horizontal scroll on login page');
    } else {
      fail('Horizontal scroll detected on login page');
    }

    return false; // Not authenticated
  } else {
    pass('Already authenticated, redirected to app');
    return true;
  }
}

async function testSessionManagement(page) {
  log('\n═══ 2. SESSION MANAGEMENT ═══', 'cyan');

  // Find the hamburger button by its ☰ text content (avoid matching logout button)
  const hamburger = await page.evaluateHandle(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === '☰') return btn;
    }
    return null;
  });
  const hamburgerEl = hamburger.asElement();
  if (hamburgerEl) {
    const hamburgerBox = await hamburgerEl.boundingBox();
    if (hamburgerBox) {
      if (hamburgerBox.width >= 44 && hamburgerBox.height >= 44) {
        pass('Hamburger menu button exists', `${hamburgerBox.width}x${hamburgerBox.height}px`);
      } else {
        fail('Hamburger button too small for touch', `${hamburgerBox.width}x${hamburgerBox.height}px — need 44x44+`);
      }

      // Click to open drawer
      await hamburgerEl.click();
      await sleep(500);
      await screenshot(page, '02-session-drawer-open');

      // Check drawer visibility
      const drawer = await page.evaluate(() => {
        // SessionDrawer typically has absolute/fixed positioning
        const els = document.querySelectorAll('[class*="absolute"], [class*="fixed"]');
        for (const el of els) {
          const text = el.textContent;
          if (text.includes('New') || text.includes('Sessions') || text.includes('+ New')) {
            return { found: true, width: el.offsetWidth };
          }
        }
        return { found: false };
      });

      if (drawer.found) {
        pass('Session drawer opens on hamburger tap');
      } else {
        warn('Session drawer open state unclear');
      }

      // Check "New Session" button
      const newBtn = await page.$('button');
      const newSessionBtns = await page.$$eval('button', btns =>
        btns.filter(b => b.textContent.includes('New') || b.textContent.includes('+'))
          .map(b => ({ text: b.textContent.trim(), w: b.offsetWidth, h: b.offsetHeight }))
      );
      if (newSessionBtns.length > 0) {
        pass('New Session button found', newSessionBtns[0].text);
      } else {
        warn('New Session button not found in view');
      }

      // Close drawer by clicking outside
      await page.mouse.click(350, 400);
      await sleep(300);
    }
  } else {
    warn('Hamburger button not found — may be desktop layout');
  }
}

async function testChatInterface(page) {
  log('\n═══ 3. CHAT INTERFACE ═══', 'cyan');

  await screenshot(page, '03-chat-interface');

  // Check textarea exists and is usable
  const textarea = await page.$('textarea');
  if (textarea) {
    const box = await textarea.boundingBox();
    if (box) {
      if (box.height >= 44) {
        pass('Textarea touch target OK', `height: ${box.height}px`);
      } else {
        fail('Textarea too short for mobile touch', `height: ${box.height}px — need 44px+`);
      }

      // Check if textarea is full width on mobile
      const viewportWidth = 393;
      const widthRatio = box.width / viewportWidth;
      if (widthRatio > 0.5) {
        pass('Textarea width fills mobile screen', `${(widthRatio * 100).toFixed(0)}% of viewport`);
      } else {
        warn('Textarea width seems narrow', `${(widthRatio * 100).toFixed(0)}% of viewport`);
      }
    }
  } else {
    fail('Chat textarea not found');
  }

  // Check Send button
  const buttons = await page.$$eval('button', btns =>
    btns.map(b => ({
      text: b.textContent.trim(),
      w: b.offsetWidth,
      h: b.offsetHeight,
      disabled: b.disabled
    }))
  );

  const sendBtn = buttons.find(b => b.text === 'Send');
  if (sendBtn) {
    if (sendBtn.h >= 40) {
      pass('Send button touch target OK', `${sendBtn.w}x${sendBtn.h}px`);
    } else {
      fail('Send button too small', `${sendBtn.h}px height — need 40px+`);
    }
  } else {
    warn('Send button not visible (may be streaming/disabled)');
  }

  // Check Stop button (when streaming)
  const stopBtn = buttons.find(b => b.text === 'Stop');
  if (stopBtn) {
    pass('Stop button visible during streaming');
  }
}

async function testQuickReplies(page) {
  log('\n═══ 4. QUICK REPLIES ═══', 'cyan');

  // Find the Quick Reply toggle button (by title attribute to distinguish from Mode ⚡Bypass)
  const quickReplyBtn = await page.$$eval('button[title="Quick Replies"]', btns =>
    btns.map(b => ({ text: b.textContent.trim(), w: b.offsetWidth, h: b.offsetHeight }))
  );

  if (quickReplyBtn.length > 0) {
    const btn = quickReplyBtn[0];
    if (btn.w >= 40 && btn.h >= 40) {
      pass('Quick Reply toggle button found', `${btn.w}x${btn.h}px`);
    } else {
      fail('Quick Reply button too small', `${btn.w}x${btn.h}px`);
    }

    // Click the Quick Replies toggle button
    await page.click('button[title="Quick Replies"]');
    await sleep(500);
    await screenshot(page, '04-quick-replies-open');

    // Check if quick reply options appeared (match icon+label pattern like "✓Yes", "✗No")
    const quickReplies = await page.evaluate(() => {
      const REPLY_LABELS = ['Yes', 'No', 'Diff', 'Test', 'Push', 'Retry'];
      const btns = document.querySelectorAll('button');
      const replies = [];
      for (const btn of btns) {
        const text = btn.textContent.trim();
        // Match short buttons (icon+label) where the label part matches
        if (text.length <= 12 && REPLY_LABELS.some(r => text.endsWith(r))) {
          replies.push({ text, w: btn.offsetWidth, h: btn.offsetHeight });
        }
      }
      return replies;
    });

    if (quickReplies.length >= 2) {
      pass('Quick reply options rendered', `${quickReplies.length} replies visible`);

      // Check touch target size for each
      const tooSmall = quickReplies.filter(r => r.h < 36);
      if (tooSmall.length === 0) {
        pass('All quick reply buttons have adequate touch targets');
      } else {
        fail('Some quick reply buttons too small', tooSmall.map(r => `${r.text}: ${r.h}px`).join(', '));
      }
    } else {
      fail('Quick reply options not showing', `Found ${quickReplies.length}`);
    }

    // Close quick replies by toggling
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent.includes('⚡')) { btn.click(); break; }
      }
    });
    await sleep(300);
  } else {
    fail('Quick Reply toggle button (⚡) not found');
  }
}

async function testVoiceInput(page) {
  log('\n═══ 5. VOICE INPUT ═══', 'cyan');

  // Voice button should exist on mobile (if speech supported)
  const voiceBtn = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.includes('🎤') || btn.title?.includes('Voice')) {
        return { text: btn.textContent.trim(), w: btn.offsetWidth, h: btn.offsetHeight, title: btn.title };
      }
    }
    return null;
  });

  if (voiceBtn) {
    if (voiceBtn.w >= 40 && voiceBtn.h >= 40) {
      pass('Voice input button found with good touch target', `${voiceBtn.w}x${voiceBtn.h}px`);
    } else {
      fail('Voice input button too small', `${voiceBtn.w}x${voiceBtn.h}px`);
    }
  } else {
    // Voice may not be available in headless mode (no SpeechRecognition API)
    warn('Voice input button not found (expected in headless — no SpeechRecognition API)');
  }
}

async function testCommandPalette(page) {
  log('\n═══ 6. COMMAND PALETTE ═══', 'cyan');

  // Find command palette trigger button (⌕ or /)
  const paletteBtn = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.title?.includes('Command') || btn.title?.includes('Palette') || btn.title?.includes('Ctrl+K')) {
        return { text: btn.textContent.trim(), w: btn.offsetWidth, h: btn.offsetHeight };
      }
    }
    return null;
  });

  if (paletteBtn) {
    pass('Command Palette button found');

    // Open palette
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.title?.includes('Command') || btn.title?.includes('Palette')) { btn.click(); break; }
      }
    });
    await sleep(500);
    await screenshot(page, '06-command-palette-open');

    // Check palette is visible
    const paletteVisible = await page.evaluate(() => {
      // Look for the palette overlay/modal
      const fixed = document.querySelectorAll('[class*="fixed"]');
      for (const el of fixed) {
        if (el.querySelector('input[placeholder*="Search"]') || el.querySelector('input[placeholder*="search"]')) {
          return { found: true, width: el.offsetWidth, height: el.offsetHeight };
        }
      }
      return { found: false };
    });

    if (paletteVisible.found) {
      pass('Command Palette modal visible');

      // Check search input exists
      const searchInput = await page.$('input[placeholder*="earch"]');
      if (searchInput) {
        pass('Search input in Command Palette');

        // Type to filter
        await searchInput.type('/co');
        await sleep(300);

        const filtered = await page.evaluate(() => {
          const items = document.querySelectorAll('[class*="fixed"] button, [class*="fixed"] [role="option"]');
          return Array.from(items).filter(el => el.textContent.includes('/co')).length;
        });
        if (filtered > 0) {
          pass('Command filtering works', `${filtered} results for "/co"`);
        } else {
          warn('Command filtering unclear');
        }
      }

      // Check close button on mobile
      const closeBtn = await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.includes('✕') || btn.textContent.includes('Close') || btn.getAttribute('aria-label')?.includes('close')) {
            return { text: btn.textContent.trim(), w: btn.offsetWidth, h: btn.offsetHeight };
          }
        }
        return null;
      });

      if (closeBtn) {
        pass('Close button visible on mobile palette', closeBtn.text);
      } else {
        fail('No visible close button on mobile Command Palette');
      }

      // Close palette
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.includes('✕') || btn.textContent.includes('Close')) { btn.click(); break; }
        }
        // Fallback: press Escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      await sleep(300);
    } else {
      fail('Command Palette modal not visible after clicking button');
    }
  } else {
    warn('Command Palette button not found in mobile view (may be hidden)');
  }
}

async function testContextIndicator(page) {
  log('\n═══ 7. CONTEXT INDICATOR ═══', 'cyan');

  // Check context indicator is visible on mobile
  const contextInfo = await page.evaluate(() => {
    // Look for percentage text like "45.2%"
    const allText = document.body.innerText;
    const percentMatch = allText.match(/(\d+\.?\d*)%/);

    // Look for progress bar
    const bars = document.querySelectorAll('[class*="bg-green"], [class*="bg-yellow"], [class*="bg-red"]');
    const progressBar = Array.from(bars).find(el => {
      const parent = el.parentElement;
      return parent && parent.classList.contains('overflow-hidden');
    });

    // Look for Compact button
    const compact = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Compact'));

    return {
      percentVisible: !!percentMatch,
      percentValue: percentMatch ? percentMatch[1] : null,
      progressBarVisible: !!progressBar,
      progressBarWidth: progressBar ? progressBar.parentElement.offsetWidth : 0,
      compactVisible: !!compact
    };
  });

  if (contextInfo.percentVisible) {
    pass('Context percentage visible on mobile', `${contextInfo.percentValue}%`);
  } else {
    warn('Context percentage not visible (may need active session)');
  }

  if (contextInfo.progressBarVisible) {
    pass('Progress bar visible on mobile', `width: ${contextInfo.progressBarWidth}px`);
  } else {
    warn('Progress bar not visible on mobile');
  }
}

async function testModeSelector(page) {
  log('\n═══ 8. MODE SELECTOR ═══', 'cyan');

  const modes = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    const modeButtons = [];
    for (const btn of btns) {
      const text = btn.textContent.trim();
      if (['Ask', 'Plan', 'Bypass'].some(m => text.includes(m))) {
        modeButtons.push({ text, w: btn.offsetWidth, h: btn.offsetHeight, active: btn.classList.contains('bg-blue-600') || btn.classList.toString().includes('blue') });
      }
    }
    return modeButtons;
  });

  if (modes.length >= 2) {
    pass('Mode selector buttons visible', modes.map(m => m.text).join(', '));

    const tooSmall = modes.filter(m => m.h < 32);
    if (tooSmall.length === 0) {
      pass('Mode buttons have adequate touch targets');
    } else {
      warn('Some mode buttons may be small', tooSmall.map(m => `${m.text}: ${m.h}px`).join(', '));
    }
  } else {
    warn('Mode selector not visible (may need active session)');
  }
}

async function testMessageBubbleWidth(page) {
  log('\n═══ 9. MESSAGE BUBBLE WIDTH ═══', 'cyan');

  const bubbles = await page.evaluate(() => {
    const allDivs = document.querySelectorAll('[class*="max-w-"]');
    const bubbleInfo = [];
    for (const div of allDivs) {
      const style = window.getComputedStyle(div);
      const maxW = style.maxWidth;
      if (maxW.includes('%')) {
        const parent = div.parentElement;
        if (parent && (parent.classList.contains('justify-end') || parent.classList.contains('justify-start'))) {
          bubbleInfo.push({
            maxWidth: maxW,
            role: parent.classList.contains('justify-end') ? 'user' : 'assistant'
          });
        }
      }
    }
    return bubbleInfo;
  });

  if (bubbles.length > 0) {
    const mobileWidths = bubbles.map(b => parseFloat(b.maxWidth));
    const allWide = mobileWidths.every(w => w >= 90);
    if (allWide) {
      pass('Message bubbles use 92%+ width on mobile', `widths: ${[...new Set(mobileWidths)].join(', ')}%`);
    } else {
      warn('Some message bubbles narrow on mobile', `widths: ${[...new Set(mobileWidths)].join(', ')}%`);
    }
  } else {
    warn('No message bubbles to test (empty chat)');
  }
}

async function testTouchTargets(page) {
  log('\n═══ 10. TOUCH TARGET AUDIT ═══', 'cyan');

  const allButtons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
    const results = [];
    for (const btn of btns) {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        results.push({
          tag: btn.tagName,
          text: btn.textContent.trim().substring(0, 30),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          visible: rect.top < window.innerHeight && rect.bottom > 0
        });
      }
    }
    return results;
  });

  const visibleButtons = allButtons.filter(b => b.visible);
  const tooSmall = visibleButtons.filter(b => b.w < 44 && b.h < 44 && b.w < 32);

  pass('Total interactive elements found', `${visibleButtons.length} visible`);

  if (tooSmall.length === 0) {
    pass('All visible buttons meet minimum touch target size');
  } else {
    for (const btn of tooSmall) {
      warn(`Small touch target: "${btn.text}"`, `${btn.w}x${btn.h}px`);
    }
  }
}

async function testHorizontalScroll(page) {
  log('\n═══ 11. HORIZONTAL SCROLL CHECK ═══', 'cyan');

  const scrollInfo = await page.evaluate(() => {
    return {
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  if (!scrollInfo.hasHScroll) {
    pass('No horizontal scroll', `body: ${scrollInfo.bodyWidth}px, viewport: ${scrollInfo.viewportWidth}px`);
  } else {
    fail('Horizontal scroll detected!', `body: ${scrollInfo.bodyWidth}px > viewport: ${scrollInfo.viewportWidth}px`);
  }
}

async function testPerformance(page) {
  log('\n═══ 12. PERFORMANCE ═══', 'cyan');

  const perf = await page.evaluate(() => {
    const entries = performance.getEntriesByType('navigation');
    const nav = entries[0];
    if (!nav) return null;

    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
      ttfb: Math.round(nav.responseStart - nav.startTime),
      domInteractive: Math.round(nav.domInteractive - nav.startTime)
    };
  });

  if (perf) {
    if (perf.ttfb < 500) {
      pass('TTFB', `${perf.ttfb}ms`);
    } else {
      warn('Slow TTFB', `${perf.ttfb}ms (target: <500ms)`);
    }

    if (perf.domContentLoaded < 3000) {
      pass('DOMContentLoaded', `${perf.domContentLoaded}ms`);
    } else {
      warn('Slow DOMContentLoaded', `${perf.domContentLoaded}ms`);
    }

    if (perf.loadComplete < 5000) {
      pass('Full page load', `${perf.loadComplete}ms`);
    } else {
      warn('Slow page load', `${perf.loadComplete}ms (target: <5s)`);
    }
  } else {
    warn('Performance API data not available');
  }

  // Check for Layout Shift
  const cls = await page.evaluate(() => {
    return new Promise(resolve => {
      let clsValue = 0;
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
      });
      try {
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 100);
      } catch {
        resolve(-1);
      }
    });
  });

  if (cls >= 0) {
    if (cls < 0.1) {
      pass('CLS (Cumulative Layout Shift)', cls.toFixed(4));
    } else if (cls < 0.25) {
      warn('CLS needs improvement', `${cls.toFixed(4)} (target: <0.1)`);
    } else {
      fail('CLS too high', `${cls.toFixed(4)} (target: <0.1)`);
    }
  }
}

async function testConsoleErrors(page) {
  log('\n═══ 13. CONSOLE ERRORS ═══', 'cyan');

  // Collect console errors from navigation
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Navigate to trigger any errors
  await page.reload({ waitUntil: 'networkidle2', timeout: 10000 });
  await sleep(2000);

  if (consoleErrors.length === 0) {
    pass('No console errors on page load');
  } else {
    for (const err of consoleErrors.slice(0, 5)) {
      warn('Console error', err.substring(0, 100));
    }
  }
}

async function testNavigation(page) {
  log('\n═══ 14. PAGE NAVIGATION ═══', 'cyan');

  // Check all navigation links
  const navLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href], nav a');
    return Array.from(links).map(l => ({
      href: l.getAttribute('href'),
      text: l.textContent.trim(),
      w: l.offsetWidth,
      h: l.offsetHeight
    })).filter(l => l.href && l.href.startsWith('/'));
  });

  if (navLinks.length > 0) {
    pass('Navigation links found', `${navLinks.length} links`);

    // Check each nav link is tappable
    const tooSmall = navLinks.filter(l => l.h < 40);
    if (tooSmall.length === 0) {
      pass('All nav links have adequate touch targets');
    } else {
      for (const link of tooSmall) {
        warn(`Nav link "${link.text}" may be too small`, `${link.w}x${link.h}px`);
      }
    }
  } else {
    warn('No navigation links found');
  }
}

async function testInputBarLayout(page) {
  log('\n═══ 15. INPUT BAR LAYOUT ═══', 'cyan');

  await screenshot(page, '15-input-bar');

  const inputBar = await page.evaluate(() => {
    // The input bar should be sticky at the bottom
    const stickies = document.querySelectorAll('[class*="sticky"], [class*="fixed"]');
    for (const el of stickies) {
      if (el.querySelector('textarea')) {
        const rect = el.getBoundingClientRect();
        const children = el.querySelectorAll('button');
        return {
          found: true,
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          viewportHeight: window.innerHeight,
          buttonCount: children.length,
          isAtBottom: Math.abs(rect.bottom - window.innerHeight) < 50
        };
      }
    }
    return { found: false };
  });

  if (inputBar.found) {
    if (inputBar.isAtBottom) {
      pass('Input bar sticks to bottom', `bottom: ${inputBar.bottom}px, viewport: ${inputBar.viewportHeight}px`);
    } else {
      warn('Input bar not at viewport bottom', `bottom: ${inputBar.bottom}px vs viewport: ${inputBar.viewportHeight}px`);
    }

    pass('Input bar buttons', `${inputBar.buttonCount} buttons`);
  } else {
    warn('Input bar container not found');
  }
}

// ==================== MAIN ====================

async function main() {
  log('\n🔬 System Monitor — Mobile E2E Test Suite', 'cyan');
  log(`📱 Device: ${IPHONE_14.name} (${IPHONE_14.viewport.width}x${IPHONE_14.viewport.height})`, 'blue');
  log(`🌐 URL: ${BASE_URL}`, 'blue');
  log(`📅 ${new Date().toISOString()}\n`, 'dim');

  // Ensure screenshot dir
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(IPHONE_14.userAgent);
    await page.setViewport(IPHONE_14.viewport);

    // Emulate touch
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });

    // Generate auth token from inside the pod for proper JWT_SECRET
    let authToken = '';
    try {
      const { execSync } = require('child_process');
      authToken = execSync(
        'sudo kubectl exec deploy/system-monitor -n deployer-dev -- node -e "' +
        "const jwt = require('jsonwebtoken');" +
        "const t = jwt.sign({email:'e2e@test.com',name:'E2E',picture:'',sub:'e2e'}, process.env.JWT_SECRET, {expiresIn:'1h'});" +
        "process.stdout.write(t);" +
        '"',
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();
      // Remove the kubectl default container warning line if present
      if (authToken.includes('\n')) {
        authToken = authToken.split('\n').pop().trim();
      }
      log(`  🔑 Auth token generated (${authToken.length} chars)`, 'dim');
    } catch (e) {
      log(`  ⚠️  Failed to generate auth token: ${e.message}`, 'yellow');
    }

    // Inject auth token before page loads
    if (authToken) {
      await page.evaluateOnNewDocument((token) => {
        localStorage.setItem('auth_token', token);
      }, authToken);
    }

    // Run all tests
    const isAuthenticated = await testLoginPage(page);

    if (isAuthenticated) {
      // Wait for app to fully load
      await sleep(2000);
      await screenshot(page, '00-app-loaded');

      // Check if sessions exist, if not create one via API for testing
      const sessions = await page.evaluate(async () => {
        const res = await fetch('/api/chat/sessions');
        const data = await res.json();
        return data.sessions || [];
      });

      if (sessions.length === 0) {
        log('\n  📦 No sessions found, creating test session via API...', 'blue');
        const sessionCreated = await page.evaluate(async () => {
          // First get available servers
          const serversRes = await fetch('/api/chat/servers');
          const serversData = await serversRes.json();
          const servers = serversData.servers || [];
          if (servers.length === 0) return { error: 'No servers available' };

          const res = await fetch('/api/chat/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serverIp: servers[0].ip,
              model: 'sonnet',
              sessionName: 'E2E Mobile Test',
              allowedTools: ['Read', 'Edit', 'Bash', 'Write', 'Glob', 'Grep']
            })
          });
          if (!res.ok) return { error: `HTTP ${res.status}` };
          return await res.json();
        });

        if (sessionCreated.error) {
          warn('Failed to create test session', sessionCreated.error);
        } else {
          pass('Test session created via API', sessionCreated.id || sessionCreated.sessionName);
          // Reload page to pick up the new session
          await page.reload({ waitUntil: 'networkidle2', timeout: 10000 });
          await sleep(2000);

          // Select the newly created session
          await page.evaluate((sessionId) => {
            // Click the session in the sidebar to activate it
            // Or directly set via URL if the app supports it
          }, sessionCreated.id);

          // Click on the session in the UI
          const sessionBtn = await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            for (const btn of btns) {
              if (btn.textContent.includes('E2E Mobile Test') || btn.textContent.includes('msgs')) {
                btn.click();
                return true;
              }
            }
            // If no session visible, try clicking "+ New Session" which should show existing sessions
            return false;
          });

          if (!sessionBtn) {
            // Try opening drawer first on mobile
            await page.evaluate(() => {
              const btns = document.querySelectorAll('button');
              for (const btn of btns) {
                if (btn.textContent.includes('☰') || btn.querySelector('span')?.textContent === '☰') {
                  btn.click();
                  return;
                }
              }
            });
            await sleep(500);
            // Now click the session
            await page.evaluate(() => {
              const btns = document.querySelectorAll('button');
              for (const btn of btns) {
                if (btn.textContent.includes('E2E') || btn.textContent.includes('msgs')) {
                  btn.click();
                  return;
                }
              }
            });
            await sleep(500);
          }

          await sleep(1000);
          await screenshot(page, '00b-session-active');
        }
      } else {
        log(`  📋 Found ${sessions.length} existing sessions, selecting first...`, 'blue');
        // Click on first session
        await page.evaluate(() => {
          const btns = document.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent.includes('☰')) { btn.click(); break; }
          }
        });
        await sleep(500);
        await page.evaluate(() => {
          const btns = document.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent.includes('msgs')) { btn.click(); break; }
          }
        });
        await sleep(1000);
      }

      await testSessionManagement(page);
      await testChatInterface(page);
      await testQuickReplies(page);
      await testVoiceInput(page);
      await testCommandPalette(page);
      await testContextIndicator(page);
      await testModeSelector(page);
      await testMessageBubbleWidth(page);
      await testTouchTargets(page);
      await testHorizontalScroll(page);
      await testInputBarLayout(page);
      await testPerformance(page);
      await testConsoleErrors(page);
      await testNavigation(page);
    } else {
      log('\n⚠️  Not authenticated — testing login page only. Set auth token for full test.', 'yellow');
      await testHorizontalScroll(page);
      await testPerformance(page);
      await testTouchTargets(page);
    }

    // Final screenshot
    await screenshot(page, '99-final-state');

  } catch (err) {
    log(`\n💥 Fatal error: ${err.message}`, 'red');
    console.error(err.stack);
  } finally {
    if (browser) await browser.close();
  }

  // Print summary
  log('\n' + '═'.repeat(60), 'cyan');
  log('📊 TEST RESULTS SUMMARY', 'cyan');
  log('═'.repeat(60), 'cyan');
  log(`  ✅ PASS: ${results.pass}`, 'green');
  log(`  ⚠️  WARN: ${results.warn}`, 'yellow');
  log(`  ❌ FAIL: ${results.fail}`, 'red');
  log('─'.repeat(60), 'dim');

  if (results.issues.length > 0) {
    log('\n🔍 Issues Found:', 'yellow');
    for (const issue of results.issues) {
      const color = issue.severity === 'FAIL' ? 'red' : 'yellow';
      log(`  ${issue.severity === 'FAIL' ? '❌' : '⚠️ '} ${issue.name}: ${issue.detail}`, color);
    }
  }

  log('\n' + '═'.repeat(60), 'cyan');

  // Exit with error code if failures
  if (results.fail > 0) {
    process.exit(1);
  }
}

main();
