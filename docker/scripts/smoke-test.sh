#!/usr/bin/env bash
# Exercises the core loop (register -> login -> create -> publish -> view
# by slug -> edit -> see it in "my stories") against a running dev stack,
# entirely through the nginx gateway (the only path that should be
# considered a real deployment target).
#
# Usage: from docker/compose, after `docker compose up -d --build`:
#   ./scripts/smoke-test.sh
#
# Requires: curl, a POSIX shell, and (for JSON field extraction) either
# `jq` or python3 - falls back to a minimal grep/sed extraction if neither
# is available.
#
# NOTE: written and reviewed, but not executed against a live stack in the
# environment this was authored in (no network access to pull Docker
# images there) - run it yourself before relying on it, and open an issue
# if a step doesn't match actual service behavior.

set -euo pipefail

BASE_URL="${SMOKE_TEST_BASE_URL:-http://localhost:8080}"
RUN_ID="$(date +%s)-$RANDOM"
EMAIL="smoketest-${RUN_ID}@example.com"
USERNAME="smoketest${RUN_ID}"
PASSWORD="SmokeTest123"

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1" >&2; exit 1; }

extract() {
  # extract <json> <field> - minimal dependency-free JSON string field extraction
  local json="$1" field="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -r --arg f "$field" '.[$f] // empty'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import sys,json; d=json.loads(sys.argv[1]); print(d.get(sys.argv[2],''))" "$json" "$field"
  else
    echo "$json" | sed -n "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -1
  fi
}

echo "== 1. Health checks =="
for svc in auth blogs analytics admin; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/$svc/health")
  [ "$code" = "200" ] && pass "$svc health" || fail "$svc health returned $code"
done

echo "== 2. Register =="
register_response=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(extract "$register_response" token)
[ -n "$TOKEN" ] || fail "register did not return a token: $register_response"
pass "registered $USERNAME"

echo "== 3. Login =="
login_response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(extract "$login_response" token)
[ -n "$TOKEN" ] || fail "login did not return a token: $login_response"
pass "logged in"

echo "== 4. Create (draft) =="
create_response=$(curl -s -X POST "$BASE_URL/api/blogs" \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Smoke Test Post $RUN_ID" \
  -F "content=# Smoke Test Post $RUN_ID

This is a smoke-test blog post with well over one hundred characters in its body so it clears the backend's minimum content length validation rule." \
  -F "published=false")
SLUG=$(extract "$create_response" slug)
BLOG_ID=$(extract "$create_response" id)
[ -n "$SLUG" ] || fail "create did not return a slug: $create_response"
pass "created draft $SLUG"

echo "== 5. Publish (update) =="
publish_response=$(curl -s -X PUT "$BASE_URL/api/blogs/$BLOG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -F "published=true")
PUBLISHED=$(extract "$publish_response" published)
[ "$PUBLISHED" = "true" ] || fail "publish did not set published=true: $publish_response"
pass "published $SLUG"

echo "== 6. View publicly by slug (no auth) =="
view_response=$(curl -s "$BASE_URL/api/blogs/$SLUG")
VIEW_TITLE=$(extract "$view_response" title)
[ -n "$VIEW_TITLE" ] || fail "public view by slug failed: $view_response"
pass "viewed publicly: $VIEW_TITLE"

echo "== 7. Edit =="
edit_response=$(curl -s -X PUT "$BASE_URL/api/blogs/$BLOG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Smoke Test Post $RUN_ID (edited)")
EDITED_TITLE=$(extract "$edit_response" title)
echo "$EDITED_TITLE" | grep -q "edited" || fail "edit did not change the title: $edit_response"
pass "edited title"

echo "== 8. Appears in my stories =="
mine_response=$(curl -s "$BASE_URL/api/blogs/user" -H "Authorization: Bearer $TOKEN")
echo "$mine_response" | grep -q "$BLOG_ID" || fail "created blog not found in /api/blogs/user: $mine_response"
pass "found in my stories"

echo "== 9. Delete =="
delete_code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/api/blogs/$BLOG_ID" \
  -H "Authorization: Bearer $TOKEN")
[ "$delete_code" = "200" ] || fail "delete returned $delete_code"
pass "deleted"

echo
echo "All smoke tests passed."
