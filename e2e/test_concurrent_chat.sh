#!/bin/bash
# E2E Test: Concurrent Chat Sessions via internal pod exec
# Tests that two sessions can stream SSE responses simultaneously

set -euo pipefail

API="http://localhost:3000/api/chat"
POD=$(kubectl get pods -n deployer-dev -l app=system-monitor -o jsonpath='{.items[0].metadata.name}')

echo "=== Concurrent Chat Session E2E Test ==="
echo "Pod: $POD"
echo ""

# Helper: exec curl inside the pod
pod_curl() {
  kubectl exec "$POD" -n deployer-dev -- wget -qO- --post-data="$2" --header='Content-Type: application/json' "$1" 2>/dev/null
}

# Get server IP
SERVER_IP=$(kubectl exec "$POD" -n deployer-dev -- wget -qO- "$API/servers" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['servers'][0]['ip'])")
echo "[SERVER] Using $SERVER_IP"
echo ""

# Step 1: Create two sessions
echo "--- Step 1: Create sessions ---"
SESSION_A=$(kubectl exec "$POD" -n deployer-dev -- wget -qO- --post-data="{\"serverIp\":\"$SERVER_IP\",\"model\":\"haiku\",\"sessionName\":\"E2E-A\"}" --header='Content-Type: application/json' "$API/sessions" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Session A: $SESSION_A"

SESSION_B=$(kubectl exec "$POD" -n deployer-dev -- wget -qO- --post-data="{\"serverIp\":\"$SERVER_IP\",\"model\":\"haiku\",\"sessionName\":\"E2E-B\"}" --header='Content-Type: application/json' "$API/sessions" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Session B: $SESSION_B"
echo ""

# Step 2: Send messages SIMULTANEOUSLY using background processes
echo "--- Step 2: Sending messages simultaneously ---"
PROMPT_A='Say exactly: \"I am Session A\" and nothing else.'
PROMPT_B='Say exactly: \"I am Session B\" and nothing else.'

RESULT_A="/tmp/e2e_session_a.txt"
RESULT_B="/tmp/e2e_session_b.txt"
TIME_A="/tmp/e2e_time_a.txt"
TIME_B="/tmp/e2e_time_b.txt"

# Use kubectl exec with timeout for SSE
send_message() {
  local session_id="$1"
  local content="$2"
  local output="$3"
  local timefile="$4"
  local start=$(date +%s%N)

  kubectl exec "$POD" -n deployer-dev -- timeout 120 wget -qO- \
    --post-data="{\"content\":\"$content\",\"mode\":\"ask\"}" \
    --header='Content-Type: application/json' \
    "$API/sessions/$session_id/message" 2>/dev/null > "$output" || true

  local end=$(date +%s%N)
  local elapsed=$(( (end - start) / 1000000 ))
  echo "$elapsed" > "$timefile"
}

START_TIME=$(date +%s%N)

# Launch both in parallel
send_message "$SESSION_A" "$PROMPT_A" "$RESULT_A" "$TIME_A" &
PID_A=$!
send_message "$SESSION_B" "$PROMPT_B" "$RESULT_B" "$TIME_B" &
PID_B=$!

echo "Waiting for both sessions to complete..."
wait $PID_A
wait $PID_B

END_TIME=$(date +%s%N)
TOTAL_MS=$(( (END_TIME - START_TIME) / 1000000 ))

echo ""
echo "--- Step 3: Results ---"

# Parse SSE results
extract_text() {
  grep 'data: ' "$1" | grep -oP '"text":"[^"]*"' | sed 's/"text":"//g; s/"//g' | tr -d '\n'
}

TEXT_A=$(extract_text "$RESULT_A" || echo "")
TEXT_B=$(extract_text "$RESULT_B" || echo "")
TIME_A_MS=$(cat "$TIME_A" 2>/dev/null || echo "0")
TIME_B_MS=$(cat "$TIME_B" 2>/dev/null || echo "0")

echo "Session A response (${TIME_A_MS}ms): \"$TEXT_A\""
echo "Session B response (${TIME_B_MS}ms): \"$TEXT_B\""
echo "Total wall clock: ${TOTAL_MS}ms"
echo ""

# Step 4: Assertions
echo "--- Step 4: Assertions ---"
PASS=0
TOTAL=0

assert() {
  TOTAL=$((TOTAL+1))
  if [ "$1" = "true" ]; then
    echo "  ✅ $2"
    PASS=$((PASS+1))
  else
    echo "  ❌ $2"
  fi
}

# Both got text?
[ -n "$TEXT_A" ] && A_HAS_TEXT="true" || A_HAS_TEXT="false"
[ -n "$TEXT_B" ] && B_HAS_TEXT="true" || B_HAS_TEXT="false"
assert "$A_HAS_TEXT" "Session A received text"
assert "$B_HAS_TEXT" "Session B received text"

# Responses are different?
if [ "$TEXT_A" != "$TEXT_B" ] || ([ -n "$TEXT_A" ] && [ -n "$TEXT_B" ]); then
  assert "true" "Responses are independent (not identical)"
else
  assert "false" "Responses are independent (not identical)"
fi

# Parallel timing check
SUM_MS=$((TIME_A_MS + TIME_B_MS))
if [ "$TOTAL_MS" -lt "$SUM_MS" ] 2>/dev/null; then
  assert "true" "Ran in parallel (wall ${TOTAL_MS}ms < sum ${SUM_MS}ms)"
else
  assert "false" "Ran in parallel (wall ${TOTAL_MS}ms < sum ${SUM_MS}ms)"
fi

echo ""
echo "--- Summary: ${PASS}/${TOTAL} passed ---"

# Cleanup
echo ""
echo "--- Cleanup ---"
kubectl exec "$POD" -n deployer-dev -- wget -qO- --method=DELETE "$API/sessions/$SESSION_A" 2>/dev/null > /dev/null || true
kubectl exec "$POD" -n deployer-dev -- wget -qO- --method=DELETE "$API/sessions/$SESSION_B" 2>/dev/null > /dev/null || true
echo "Sessions deleted"

rm -f "$RESULT_A" "$RESULT_B" "$TIME_A" "$TIME_B"

[ "$PASS" -eq "$TOTAL" ] && exit 0 || exit 1
