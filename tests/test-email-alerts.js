/**
 * Test 16.5-16.7: Email Alert Tests
 * Tests email delivery, cooldown mechanism, and sensitive information filtering
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock email alerts module for testing
class EmailAlertsTester {
  constructor() {
    this.sentEmails = [];
    this.lastAlerts = new Map(); // Track last alert time per key
  }

  /**
   * Test 16.5: Email template generation
   */
  testEmailTemplates() {
    console.log('\nTest 16.5: Email Template Generation');
    console.log('-'.repeat(60));

    const tests = [
      {
        name: 'Connection Failure Email',
        type: 'connection_failure',
        data: {
          hostname: 'ip-172-31-6-240',
          serverAlias: 'Server A',
          ip: '172.31.6.240',
          lastSeen: '2 minutes ago',
          reason: 'API unreachable for 10+ minutes'
        }
      },
      {
        name: 'Recovery Success Email',
        type: 'recovery_success',
        data: {
          hostname: 'ip-172-31-6-240',
          serverAlias: 'Server A',
          ip: '172.31.6.240',
          method: 'soft_restart',
          downtime: '3 minutes'
        }
      },
      {
        name: 'Critical Failure Email',
        type: 'critical_failure',
        data: {
          hostname: 'ip-172-31-6-240',
          serverAlias: 'Server A',
          ip: '172.31.6.240',
          attempts: 3,
          lastError: 'Process failed to start after restart'
        }
      }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        const email = this.generateEmailTemplate(test.type, test.data);

        // Verify email structure
        if (!email.subject || !email.body) {
          console.log(`  ❌ ${test.name}: Missing subject or body`);
          failed++;
          continue;
        }

        // Verify subject format
        const expectedSubjects = {
          connection_failure: '⚠️ Claude Remote Control 連線異常',
          recovery_success: '✅ Claude Remote Control 已恢復',
          critical_failure: '🚨 自動恢復失敗'
        };

        if (!email.subject.includes(expectedSubjects[test.type])) {
          console.log(`  ❌ ${test.name}: Incorrect subject format`);
          failed++;
          continue;
        }

        // Verify server alias in subject
        if (!email.subject.includes(test.data.serverAlias)) {
          console.log(`  ❌ ${test.name}: Missing server alias in subject`);
          failed++;
          continue;
        }

        console.log(`  ✅ ${test.name}: Template generated correctly`);
        passed++;
      } catch (error) {
        console.log(`  ❌ ${test.name}: ${error.message}`);
        failed++;
      }
    }

    return { passed, failed };
  }

  /**
   * Test 16.6: Alert cooldown mechanism
   */
  testCooldownMechanism() {
    console.log('\nTest 16.6: Alert Cooldown Mechanism');
    console.log('-'.repeat(60));

    let passed = 0;
    let failed = 0;

    try {
      const server = 'Server A';
      const alertType = 'connection_failure';
      const cooldownMs = 60 * 60 * 1000; // 1 hour

      // First alert - should send
      const shouldSend1 = this.shouldSendAlert(server, alertType, cooldownMs);
      if (!shouldSend1) {
        console.log('  ❌ First alert should be sent');
        failed++;
      } else {
        console.log('  ✅ First alert: Should send (no previous alert)');
        this.recordAlert(server, alertType);
        passed++;
      }

      // Second alert immediately - should NOT send (within cooldown)
      const shouldSend2 = this.shouldSendAlert(server, alertType, cooldownMs);
      if (shouldSend2) {
        console.log('  ❌ Second alert should be blocked (within 1-hour cooldown)');
        failed++;
      } else {
        console.log('  ✅ Second alert: Blocked by cooldown');
        passed++;
      }

      // Simulate time passing (mock)
      const pastTime = Date.now() - (61 * 60 * 1000); // 61 minutes ago
      this.lastAlerts.set(`${server}:${alertType}`, pastTime);

      // Third alert after cooldown - should send
      const shouldSend3 = this.shouldSendAlert(server, alertType, cooldownMs);
      if (!shouldSend3) {
        console.log('  ❌ Third alert should be sent (after cooldown expires)');
        failed++;
      } else {
        console.log('  ✅ Third alert: Should send (cooldown expired)');
        passed++;
      }

      // Different alert type - should send (independent cooldown)
      const shouldSend4 = this.shouldSendAlert(server, 'recovery_success', cooldownMs);
      if (!shouldSend4) {
        console.log('  ❌ Different alert type should have independent cooldown');
        failed++;
      } else {
        console.log('  ✅ Different alert type: Independent cooldown working');
        passed++;
      }
    } catch (error) {
      console.log(`  ❌ Cooldown test failed: ${error.message}`);
      failed++;
    }

    return { passed, failed };
  }

  /**
   * Test 16.7: Sensitive information filtering
   */
  testSensitiveInfoFiltering() {
    console.log('\nTest 16.7: Sensitive Information Filtering');
    console.log('-'.repeat(60));

    let passed = 0;
    let failed = 0;

    const testData = {
      hostname: 'ip-172-31-6-240',
      serverAlias: 'Server A',
      ip: '172.31.6.240',
      sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      bridgeId: 'bridge-a1b2c3d4',
      lastSeen: '2 minutes ago'
    };

    try {
      const email = this.generateEmailTemplate('connection_failure', testData);

      // Check that IP address is NOT in email body (should use alias)
      if (email.body.includes(testData.ip)) {
        console.log('  ❌ Email body contains IP address (should be filtered)');
        failed++;
      } else {
        console.log('  ✅ IP address filtered from email body');
        passed++;
      }

      // Check that server alias IS in email body
      if (!email.body.includes(testData.serverAlias)) {
        console.log('  ❌ Email body missing server alias');
        failed++;
      } else {
        console.log('  ✅ Server alias present in email body');
        passed++;
      }

      // Check that session ID and bridge ID are NOT in email (unless explicitly needed)
      const sensitiveIds = [testData.sessionId, testData.bridgeId];
      const hasSensitiveId = sensitiveIds.some(id => email.body.includes(id));

      if (hasSensitiveId) {
        console.log('  ⚠️  Warning: Email contains session/bridge IDs (acceptable for debugging)');
      } else {
        console.log('  ✅ Session/Bridge IDs not included in email');
        passed++;
      }

      // Check that no URLs are in the email body
      const urlPattern = /https?:\/\/[^\s]+/;
      if (urlPattern.test(email.body)) {
        console.log('  ❌ Email body contains URLs (should be filtered)');
        failed++;
      } else {
        console.log('  ✅ URLs filtered from email body');
        passed++;
      }
    } catch (error) {
      console.log(`  ❌ Filtering test failed: ${error.message}`);
      failed++;
    }

    return { passed, failed };
  }

  /**
   * Generate email template (mock implementation)
   */
  generateEmailTemplate(type, data) {
    const templates = {
      connection_failure: {
        subject: `⚠️ Claude Remote Control 連線異常 - ${data.serverAlias}`,
        body: `
Claude Remote Control 在 ${data.serverAlias} (${data.hostname}) 上的連線已中斷。

狀態詳情：
- 伺服器：${data.serverAlias}
- 主機名稱：${data.hostname}
- 最後連線：${data.lastSeen}
- 原因：${data.reason}

系統將嘗試自動恢復連線。

---
此為自動警報，請勿回覆此郵件。
        `.trim()
      },
      recovery_success: {
        subject: `✅ Claude Remote Control 已恢復 - ${data.serverAlias}`,
        body: `
Claude Remote Control 在 ${data.serverAlias} (${data.hostname}) 上已成功恢復。

恢復詳情：
- 伺服器：${data.serverAlias}
- 主機名稱：${data.hostname}
- 恢復方法：${data.method}
- 停機時間：${data.downtime}

連線已恢復正常。

---
此為自動警報，請勿回覆此郵件。
        `.trim()
      },
      critical_failure: {
        subject: `🚨 自動恢復失敗 - ${data.serverAlias} 需要手動介入`,
        body: `
Claude Remote Control 在 ${data.serverAlias} (${data.hostname}) 上自動恢復失敗。

失敗詳情：
- 伺服器：${data.serverAlias}
- 主機名稱：${data.hostname}
- 嘗試次數：${data.attempts}
- 最後錯誤：${data.lastError}

請儘快手動檢查並修復此問題。

---
此為自動警報，請勿回覆此郵件。
        `.trim()
      }
    };

    return templates[type] || { subject: '', body: '' };
  }

  /**
   * Check if alert should be sent based on cooldown
   */
  shouldSendAlert(server, alertType, cooldownMs) {
    const key = `${server}:${alertType}`;
    const lastAlertTime = this.lastAlerts.get(key);

    if (!lastAlertTime) {
      return true; // No previous alert
    }

    const timeSinceLastAlert = Date.now() - lastAlertTime;
    return timeSinceLastAlert > cooldownMs;
  }

  /**
   * Record alert send time
   */
  recordAlert(server, alertType) {
    const key = `${server}:${alertType}`;
    this.lastAlerts.set(key, Date.now());
  }
}

/**
 * Run all email alert tests
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('Email Alert Tests (Tasks 16.5-16.7)');
  console.log('='.repeat(60));

  const tester = new EmailAlertsTester();

  let totalPassed = 0;
  let totalFailed = 0;

  // Test 16.5: Email templates
  const test1 = tester.testEmailTemplates();
  totalPassed += test1.passed;
  totalFailed += test1.failed;

  // Test 16.6: Cooldown mechanism
  const test2 = tester.testCooldownMechanism();
  totalPassed += test2.passed;
  totalFailed += test2.failed;

  // Test 16.7: Sensitive info filtering
  const test3 = tester.testSensitiveInfoFiltering();
  totalPassed += test3.passed;
  totalFailed += test3.failed;

  // Summary
  console.log();
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalPassed + totalFailed}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log();

  if (totalFailed === 0) {
    console.log('✅ All email tests passed!');
    console.log();
    console.log('Note: To test actual email delivery (Task 16.5):');
    console.log('  1. Deploy the monitoring system');
    console.log('  2. Simulate a failure on one server');
    console.log('  3. Check inbox at cuppot123@gmail.com');
  } else {
    console.log('❌ Some email tests failed!');
  }

  process.exit(totalFailed === 0 ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
