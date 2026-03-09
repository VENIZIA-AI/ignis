#!/usr/bin/env bash
# =============================================================================
# Comprehensive Authorization Test Suite — 25 test cases
#
# Tests all authorization paths: alwaysAllowRoles bypass, allowedRoles check,
# policy-based allow/deny, multi-tenant isolation, deny-override, and no-org.
#
# Run from examples/vert:
#   bash scripts/test-authorization.sh
#
# Prerequisites:
#   - Server running (bun run server:dev)
#   - PostgreSQL reachable
#   - Redis reachable (optional — flush will be skipped if not)
#   - jq installed
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL="${BASE_URL:-http://0.0.0.0:1190/v1/api}"
REDIS_HOST="${APP_ENV_AUTHORZ_REDIS_HOST:-0.0.0.0}"
REDIS_PORT="${APP_ENV_AUTHORZ_REDIS_PORT:-6379}"
REDIS_DB="${APP_ENV_AUTHORZ_REDIS_DB:-8}"
PASSWORD="TestPassword123!"

TOTAL=0
PASSED=0
FAILED=0
FAILURES=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pass() {
  TOTAL=$((TOTAL + 1))
  PASSED=$((PASSED + 1))
  printf "  \xE2\x9C\x85 %-6s %s\n" "$1" "$2"
}

fail() {
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  FAILURES+=("$1: $2 (expected $3, got $4)")
  printf "  \xE2\x9D\x8C %-6s %s (expected %s, got %s)\n" "$1" "$2" "$3" "$4"
}

# HTTP request returning only the status code
# Usage: http_status <method> <path> [token]
http_status() {
  local method="$1"
  local url="${BASE_URL}$2"
  local token="${3:-}"
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method")

  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi

  # POST endpoints expect a JSON body
  if [[ "$method" == "POST" ]]; then
    args+=(-H "Content-Type: application/json" -d '{}')
  fi

  curl "${args[@]}" "$url"
}

# Run a single test case
# Usage: test_case <id> <method> <path> <token> <expected_status> <description>
test_case() {
  local id="$1"
  local method="$2"
  local path="$3"
  local token="$4"
  local expected="$5"
  local desc="$6"

  local actual
  actual=$(http_status "$method" "$path" "$token")

  if [[ "$actual" == "$expected" ]]; then
    pass "$id" "$desc"
  else
    fail "$id" "$desc" "$expected" "$actual"
  fi
}

sign_up() {
  local username="$1"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${username}\",\"credential\":\"${PASSWORD}\"}" \
    "${BASE_URL}/auth/sign-up")

  if [[ "$status" == "200" || "$status" == "201" ]]; then
    echo "  [sign-up] ${username} -> created"
  elif [[ "$status" == "409" ]]; then
    echo "  [sign-up] ${username} -> already exists (OK)"
  else
    echo "  [sign-up] ${username} -> unexpected status ${status}" >&2
    return 1
  fi
}

sign_in() {
  local username="$1"
  local response
  response=$(curl -s -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"identifier\":{\"scheme\":\"username\",\"value\":\"${username}\"},\"credential\":{\"scheme\":\"basic\",\"value\":\"${PASSWORD}\"}}" \
    "${BASE_URL}/auth/sign-in")

  # Try extracting token from different response structures
  local token
  token=$(echo "$response" | jq -r '.token.value // .data.token.value // empty')

  if [[ -z "$token" ]]; then
    echo "[sign-in] FAILED for ${username}: ${response}" >&2
    return 1
  fi

  echo "$token"
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
echo "==================================================="
echo "  Authorization Test Suite"
echo "==================================================="
echo ""

# Check jq
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed."
  exit 1
fi

# Check server
echo "-> Checking server at ${BASE_URL}..."
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/health-check" 2>/dev/null || true)
if [[ "$HEALTH" != "200" ]]; then
  echo "  Server not reachable (status: ${HEALTH:-none})."
  echo "  Start it first: cd examples/vert && bun run server:dev"
  exit 1
fi
echo "  Server is running."
echo ""

# ---------------------------------------------------------------------------
# Step 1: Seed base data (organizations, roles, permissions)
# ---------------------------------------------------------------------------
echo "-> Step 1: Seeding base data (orgs, roles, permissions)..."
cd "$(dirname "$0")/.."
NODE_ENV=development bun run scripts/seed-authz-test-data.ts
echo ""

# ---------------------------------------------------------------------------
# Step 2: Sign up test users
# ---------------------------------------------------------------------------
echo "-> Step 2: Signing up test users..."
USERS=(test_superadmin test_admin test_user test_guest test_beta_admin test_no_org test_denied)

for user in "${USERS[@]}"; do
  sign_up "$user"
done
echo ""

# ---------------------------------------------------------------------------
# Step 3: Seed per-user policies
# ---------------------------------------------------------------------------
echo "-> Step 3: Seeding user policies..."
for user in "${USERS[@]}"; do
  NODE_ENV=development bun run scripts/seed-user-policies.ts "$user"
done
echo ""

# ---------------------------------------------------------------------------
# Step 4: Flush Redis authorization cache
# ---------------------------------------------------------------------------
echo "-> Step 4: Flushing Redis authorization cache (db ${REDIS_DB})..."
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" FLUSHDB >/dev/null 2>&1; then
  echo "  Redis cache flushed."
else
  echo "  (Redis flush skipped — not reachable)"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Sign in all users and collect JWT tokens
# ---------------------------------------------------------------------------
echo "-> Step 5: Signing in test users..."
declare -A TOKENS

for user in "${USERS[@]}"; do
  TOKENS[$user]=$(sign_in "$user")
  echo "  [sign-in] ${user} -> OK"
done
echo ""

# ---------------------------------------------------------------------------
# Step 6: Run 25 test cases
# ---------------------------------------------------------------------------
echo "==================================================="
echo "  Running 25 Test Cases"
echo "==================================================="
echo ""

# --- A. Public Endpoint: GET /authz-example/public ---
echo "--- A. Public Endpoint (GET /authz-example/public) ---"
test_case "A1" GET "/authz-example/public" "" "200" \
  "No token -> 200 (public)"
test_case "A2" GET "/authz-example/public" "${TOKENS[test_user]}" "200" \
  "Valid token -> 200 (public ignores auth)"
echo ""

# --- B. Profile — Auth-Only: GET /authz-example/profile ---
echo "--- B. Profile (GET /authz-example/profile) ---"
test_case "B1" GET "/authz-example/profile" "" "401" \
  "No token -> 401"
test_case "B2" GET "/authz-example/profile" "invalid.jwt.token" "401" \
  "Invalid token -> 401"
test_case "B3" GET "/authz-example/profile" "${TOKENS[test_user]}" "200" \
  "test_user -> 200 (auth-only)"
test_case "B4" GET "/authz-example/profile" "${TOKENS[test_guest]}" "200" \
  "test_guest -> 200 (auth-only)"
echo ""

# --- C. Configurations — read:configuration: GET /authz-example/configurations ---
echo "--- C. Configurations (GET /authz-example/configurations) ---"
test_case "C1" GET "/authz-example/configurations" "" "401" \
  "No token -> 401"
test_case "C2" GET "/authz-example/configurations" "${TOKENS[test_guest]}" "403" \
  "test_guest -> 403 (no read:configuration permission)"
test_case "C3" GET "/authz-example/configurations" "${TOKENS[test_user]}" "200" \
  "test_user -> 200 (has read:configuration via role policy)"
test_case "C4" GET "/authz-example/configurations" "${TOKENS[test_admin]}" "403" \
  "test_admin -> 403 (admin role has no read:configuration policy)"
test_case "C5" GET "/authz-example/configurations" "${TOKENS[test_superadmin]}" "200" \
  "test_superadmin -> 200 (alwaysAllowRoles bypass)"
test_case "C6" GET "/authz-example/configurations" "${TOKENS[test_beta_admin]}" "200" \
  "test_beta_admin -> 200 (has read:configuration in own org)"
test_case "C7" GET "/authz-example/configurations" "${TOKENS[test_no_org]}" "403" \
  "test_no_org -> 403 (null org -> no domain match)"
test_case "C8" GET "/authz-example/configurations" "${TOKENS[test_denied]}" "403" \
  "test_denied -> 403 (explicit deny overrides allow)"
echo ""

# --- D. Create User — create:user: POST /authz-example/users ---
echo "--- D. Create User (POST /authz-example/users) ---"
test_case "D1" POST "/authz-example/users" "" "401" \
  "No token -> 401"
test_case "D2" POST "/authz-example/users" "${TOKENS[test_user]}" "403" \
  "test_user -> 403 (no create:user permission)"
test_case "D3" POST "/authz-example/users" "${TOKENS[test_admin]}" "200" \
  "test_admin -> 200 (has create:user via admin role policy)"
test_case "D4" POST "/authz-example/users" "${TOKENS[test_superadmin]}" "200" \
  "test_superadmin -> 200 (alwaysAllowRoles bypass)"
test_case "D5" POST "/authz-example/users" "${TOKENS[test_guest]}" "403" \
  "test_guest -> 403 (no permissions)"
echo ""

# --- E. Admin Dashboard — allowedRoles: GET /authz-example/admin/dashboard ---
echo "--- E. Admin Dashboard (GET /authz-example/admin/dashboard) ---"
test_case "E1" GET "/authz-example/admin/dashboard" "" "401" \
  "No token -> 401"
test_case "E2" GET "/authz-example/admin/dashboard" "${TOKENS[test_superadmin]}" "200" \
  "test_superadmin -> 200 (alwaysAllowRoles bypass)"
test_case "E3" GET "/authz-example/admin/dashboard" "${TOKENS[test_admin]}" "200" \
  "test_admin -> 200 (900_admin in allowedRoles)"
test_case "E4" GET "/authz-example/admin/dashboard" "${TOKENS[test_user]}" "403" \
  "test_user -> 403 (10_user not in allowedRoles)"
test_case "E5" GET "/authz-example/admin/dashboard" "${TOKENS[test_guest]}" "403" \
  "test_guest -> 403 (1_guest not in allowedRoles)"
test_case "E6" GET "/authz-example/admin/dashboard" "${TOKENS[test_beta_admin]}" "200" \
  "test_beta_admin -> 200 (900_admin in allowedRoles, role-identity check)"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "==================================================="
echo "  Results: ${PASSED}/${TOTAL} passed, ${FAILED} failed"
echo "==================================================="

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  echo ""
  exit 1
fi

echo ""
echo "All tests passed!"
exit 0
