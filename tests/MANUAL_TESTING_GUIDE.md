# Manual Testing Guide

This guide covers manual testing procedures for Tasks 16.8-16.10.

## Test 16.8: Manual Recovery Button in UI

### Prerequisites
- Monitoring system deployed and running
- Access to https://monitor.ko.unieai.com/claude-remote

### Test Steps

1. **Navigate to Claude Remote Monitor page**
   ```
   Open browser: https://monitor.ko.unieai.com/claude-remote
   ```

2. **Simulate a failure on one server**
   ```bash
   # SSH into Server A
   ssh ubuntu@172.31.6.240

   # Stop Claude Remote Control process
   tmux send-keys -t claude-remote C-c
   ```

3. **Wait for status to update (max 30 seconds)**
   - Refresh the page or wait for auto-refresh
   - Server status should change to "Offline" or "Failed" (red badge)

4. **Test manual recovery button**
   - Locate the "Recover" button on the server card
   - Button should be **enabled** (clickable) when status is failed
   - Click the "Recover" button

5. **Verify recovery process**
   - Button should show loading state during recovery
   - After 10-15 seconds, status should change to "Connected" (green badge)
   - Process should be running again

6. **Verify button disable state**
   - When status is "Connected", the button should be **disabled** (grayed out)
   - Button should only be clickable when status is failed/degraded

### Expected Results

✅ Button enabled when server is offline/failed
✅ Button triggers recovery successfully
✅ Status updates to "Connected" after recovery
✅ Button disabled when server is healthy

### Common Issues

- **Button always disabled**: Check API permissions or button logic
- **Recovery fails**: Check SSH connectivity and tmux session
- **Status doesn't update**: Check auto-refresh mechanism (30-second interval)

---

## Test 16.9: Mobile Responsive Layout

### Prerequisites
- Monitoring system deployed
- Mobile device (phone/tablet) or browser dev tools

### Test Steps (Method 1: Real Mobile Device)

1. **Open on mobile browser**
   ```
   URL: https://monitor.ko.unieai.com/claude-remote
   ```

2. **Verify layout on phone (portrait mode)**
   - Server cards should stack **vertically** (1 column)
   - Each card should be full width
   - Text should be readable without zooming
   - Buttons should be touch-friendly (44x44 pixels minimum)

3. **Verify layout on phone (landscape mode)**
   - Cards may display in 2 columns if screen is wide enough
   - Content should not overflow horizontally

4. **Verify layout on tablet**
   - Cards should display in 2 columns
   - Spacing should be appropriate

5. **Test touch interactions**
   - Tap the "Recover" button (should be easy to tap)
   - Tap navigation menu items
   - No double-tap needed to activate buttons

### Test Steps (Method 2: Browser Dev Tools)

1. **Open Chrome/Firefox Dev Tools**
   - Press F12
   - Click "Toggle Device Toolbar" (Ctrl+Shift+M)

2. **Test different screen sizes**
   ```
   iPhone SE (375px):  1-column layout
   iPhone 12 (390px):  1-column layout
   iPad (768px):       2-column layout
   Desktop (1024px+):  2-column layout
   ```

3. **Verify responsive breakpoints**
   - At mobile sizes (<768px): 1-column vertical stack
   - At tablet/desktop (≥768px): 2-column grid

4. **Check navigation menu**
   - Should be mobile-friendly (hamburger menu or vertical stack)

### Expected Results

✅ 1-column layout on mobile (<768px)
✅ 2-column layout on tablet/desktop (≥768px)
✅ No horizontal scrolling required
✅ Touch targets ≥44x44 pixels
✅ Text readable without zoom
✅ Navigation menu accessible on all screen sizes

### Common Issues

- **Cards too narrow on desktop**: Check CSS grid/flexbox settings
- **Text too small on mobile**: Increase font sizes in media queries
- **Buttons hard to tap**: Increase padding or min-height/min-width
- **Horizontal scroll on mobile**: Check for fixed-width elements

---

## Test 16.10: Load Test - 30-Second Polling Performance

### Prerequisites
- Monitoring system deployed
- Browser dev tools or Lighthouse
- Multiple tabs or concurrent users (optional)

### Test Steps (Browser Performance)

1. **Open Chrome DevTools Performance tab**
   - Press F12 → Performance tab
   - Navigate to https://monitor.ko.unieai.com/claude-remote

2. **Record performance for 2 minutes**
   - Click "Record" button
   - Let the page run for 2 minutes (4 refresh cycles)
   - Click "Stop" button

3. **Analyze CPU and memory usage**
   - **CPU**: Should stay below 10% during idle
   - **Memory**: Should not increase significantly over time (no memory leaks)
   - **Network**: API calls should complete in <500ms

4. **Check for performance issues**
   - Long tasks (>50ms) that block the main thread
   - Excessive DOM manipulations
   - Memory leaks (increasing heap size)

### Test Steps (Network Performance)

1. **Open Network tab in DevTools**
   - Press F12 → Network tab
   - Clear all requests

2. **Monitor API calls over 5 minutes**
   - API should be called every 30 seconds
   - Expected: 10 API calls in 5 minutes

3. **Verify API response times**
   - `/api/claude-remote/status`: Should complete in <500ms
   - Response size: Should be <10KB

4. **Check for redundant requests**
   - No duplicate calls within the same 30-second window
   - No unnecessary polling when tab is in background (optional optimization)

### Test Steps (Concurrent Users)

1. **Open multiple browser tabs** (5-10 tabs)
   - All pointing to https://monitor.ko.unieai.com/claude-remote

2. **Monitor server CPU and memory**
   ```bash
   # SSH into monitor server
   ssh ubuntu@<monitor-server-ip>

   # Watch resource usage
   htop
   ```

3. **Let run for 5 minutes**
   - Server CPU should stay below 50%
   - Memory usage should be stable
   - All tabs should refresh correctly

### Expected Results

✅ CPU usage <10% during idle
✅ Memory usage stable (no leaks)
✅ API calls complete in <500ms
✅ Exactly 1 API call every 30 seconds (no duplicates)
✅ No UI freezing or lag
✅ Server handles 10+ concurrent clients smoothly

### Performance Metrics (Pass Criteria)

| Metric | Target | Max Acceptable |
|--------|--------|----------------|
| API Response Time | <300ms | <500ms |
| Page Load Time | <2s | <3s |
| CPU (idle) | <5% | <10% |
| Memory Increase | <10MB/hour | <50MB/hour |
| Network Requests/min | 2 (every 30s) | 2 |

### Common Issues

- **Memory leak**: Check for unreleased timers, event listeners, or React state
- **High CPU usage**: Check for inefficient re-renders or expensive computations
- **Slow API**: Optimize backend queries, add caching, or reduce data size
- **Excessive polling**: Verify setInterval cleanup in useEffect

---

## Running Automated Tests

Before manual testing, run the automated test suites:

```bash
cd /home/ubuntu/system-monitor

# Test 16.1: SSH connectivity
node tests/test-ssh-connectivity.js

# Test 16.2-16.4: Auto-recovery
node tests/test-auto-recovery.js

# Test 16.5-16.7: Email alerts
node tests/test-email-alerts.js
```

---

## Test Completion Checklist

After completing all tests, verify:

- [ ] 16.1: SSH connections working on both servers
- [ ] 16.2: Process detection working
- [ ] 16.3: Soft restart working
- [ ] 16.4: Hard restart working
- [ ] 16.5: Email delivery confirmed (check inbox)
- [ ] 16.6: Cooldown mechanism working
- [ ] 16.7: Sensitive info filtered from emails
- [ ] 16.8: Manual recovery button working in UI
- [ ] 16.9: Mobile responsive layout verified
- [ ] 16.10: Performance acceptable under load

---

## Reporting Issues

If any test fails, document:

1. **Test ID**: Which test failed (e.g., 16.8)
2. **Steps to reproduce**: Exact steps taken
3. **Expected result**: What should happen
4. **Actual result**: What actually happened
5. **Logs**: Relevant error messages or screenshots
6. **Environment**: Browser version, device type, etc.

Create an issue in the project repository with this information.
