#!/usr/bin/env bash
# Vegz multi-service smoke test. Run after starting all four APIs locally.
# Defaults match the documented development ports; override with environment variables.
set -Eeuo pipefail

USER_API="${VEGZ_USER_API:-http://127.0.0.1:8003}"
SHOP_API="${VEGZ_SHOP_API:-http://127.0.0.1:8002}"
AGENT_API="${VEGZ_AGENT_API:-http://127.0.0.1:8001}"
ADMIN_API="${VEGZ_ADMIN_API:-http://127.0.0.1:8000}"

failures=0
check() {
  local label="$1" url="$2" body code
  printf 'Checking %-26s %s ... ' "$label" "$url"
  body="$(mktemp)"
  code="$(curl --silent --show-error --connect-timeout 3 --max-time 10 -o "$body" -w '%{http_code}' "$url" 2>/dev/null || true)"
  if [[ "$code" == "200" ]]; then
    printf 'OK (HTTP %s)\n' "$code"
  else
    printf 'FAIL (HTTP %s)\n' "${code:-no response}"
    [[ ! -s "$body" ]] || cat "$body"
    printf '\n'
    failures=$((failures + 1))
  fi
  rm -f "$body"
}

check "customer API health" "$USER_API/api/health"
check "shop API health" "$SHOP_API/api/health"
check "agent API health" "$AGENT_API/api/health"
check "admin API health" "$ADMIN_API/api/health"
check "customer product catalog" "$USER_API/api/products"

if (( failures > 0 )); then
  printf '\nSmoke test failed: %s check(s) failed. Do not treat this build as release-ready.\n' "$failures"
  exit 1
fi

printf '\nAll basic HTTP smoke checks passed. This does NOT replace authenticated workflow, database, approval, order, payment, or mobile-device tests.\n'
