#!/usr/bin/env bash
# Backend API smoke test for LexFlow AI. Assumes the backend is already
# running on :8000 (see SKILL.md "Run" section). Exercises the auth +
# per-user case/document/draft ownership wiring, the Escalation Engine's
# deadline computation, the public Citation Checker's rate limiting, and the
# free-tier billing quota gate, directly against the API, independent of the
# frontend - the layer most PRs to backend/app/routes/*.py actually touch.
#
# Usage: bash smoke-api.sh

set -e
BASE="${LEXFLOW_API_URL:-http://localhost:8000}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

# 1. Health check (open route)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health")
[ "$code" = "200" ] && pass "GET /api/health -> 200" || fail "GET /api/health -> $code"

# 2. Protected route with no auth -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cases")
[ "$code" = "401" ] && pass "GET /api/cases with no auth -> 401" || fail "GET /api/cases with no auth -> $code"

# 3. Signup a throwaway smoke-test user, capture the httpOnly cookie
EMAIL="smoketest-$$@example.com"
code=$(curl -s -c "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"pass123\",\"full_name\":\"Smoke Test\"}")
[ "$code" = "200" ] && pass "POST /api/signup -> 200 (cookie set)" || fail "POST /api/signup -> $code"

# 4. /api/me authenticates via cookie alone (no Authorization header)
me=$(curl -s -b "$JAR" "$BASE/api/me")
echo "$me" | grep -q "$EMAIL" && pass "GET /api/me returns the signed-up user" || fail "GET /api/me did not return $EMAIL: $me"

# 5. Create a case, confirm it's owned by this user
case_resp=$(curl -s -b "$JAR" -X POST "$BASE/api/cases" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Test Case","forum":"lokayuktha"}')
case_id=$(echo "$case_resp" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
[ -n "$case_id" ] && pass "POST /api/cases -> created case id=$case_id" || fail "POST /api/cases did not return an id: $case_resp"

# 6. A second user cannot see, fetch, or act on the first user's case
JAR2=$(mktemp)
EMAIL2="smoketest2-$$@example.com"
curl -s -c "$JAR2" -o /dev/null -X POST "$BASE/api/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL2\",\"password\":\"pass123\"}"
listing=$(curl -s -b "$JAR2" "$BASE/api/cases")
echo "$listing" | grep -q "Smoke Test Case" && fail "User B's case list leaked User A's case" || pass "User B's case list does not include User A's case"
code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" "$BASE/api/cases/$case_id")
[ "$code" = "404" ] && pass "User B fetching User A's case by ID -> 404 (not 403, no existence leak)" || fail "User B fetching User A's case -> $code"

code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" "$BASE/api/cases/$case_id/documents")
[ "$code" = "404" ] && pass "User B listing User A's case documents -> 404" || fail "User B listing User A's case documents -> $code"

UPLOAD_FILE=$(mktemp)
echo "dummy" > "$UPLOAD_FILE"
code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/cases/$case_id/upload" -F "file=@$UPLOAD_FILE")
rm -f "$UPLOAD_FILE"
[ "$code" = "404" ] && pass "User B uploading a document to User A's case -> 404" || fail "User B uploading to User A's case -> $code"

# Ownership is checked before any LLM call, so this is safe/free to run.
code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/ai/draft" \
  -H "Content-Type: application/json" \
  -d "{\"case_id\":$case_id,\"prompt_context\":\"x\",\"instruction\":\"x\"}")
[ "$code" = "404" ] && pass "User B generating a draft on User A's case -> 404 (rejected before any LLM call)" || fail "User B generating a draft on User A's case -> $code"

# Seed a draft directly in the DB to test download ownership without
# spending an LLM call on drafting itself.
DB_PATH="${LEXFLOW_DB_PATH:-$(dirname "$0")/../../../backend/lexflowai.db}"
if [ -f "$DB_PATH" ] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" "INSERT INTO drafts (case_id, instruction, content, language) VALUES ($case_id, 'smoke seed', 'seed content', 'en');"
  draft_id=$(sqlite3 "$DB_PATH" "SELECT id FROM drafts WHERE case_id=$case_id ORDER BY id DESC LIMIT 1;")
  code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" "$BASE/api/drafts/$draft_id/download")
  [ "$code" = "404" ] && pass "User B downloading User A's draft -> 404" || fail "User B downloading User A's draft -> $code"
else
  echo "SKIP: draft-download isolation check (sqlite3 CLI or DB file not found at $DB_PATH; set LEXFLOW_DB_PATH)"
fi

# 7. Escalation Engine: RTI forum gets an auto-computed statutory deadline,
# other forums do not (no fixed response SLA exists for them), and the new
# /filed, /escalation-deadline, /api/ai/escalate endpoints respect ownership.
rti_resp=$(curl -s -b "$JAR" -X POST "$BASE/api/cases" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Test RTI Case","forum":"rti"}')
rti_id=$(echo "$rti_resp" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
filed_35_ago=$(date -d "-35 days" +%F)
filed_resp=$(curl -s -b "$JAR" -X POST "$BASE/api/cases/$rti_id/filed" \
  -H "Content-Type: application/json" \
  -d "{\"filed_date\":\"$filed_35_ago\"}")
echo "$filed_resp" | grep -q '"is_overdue":true' && pass "RTI case filed 35 days ago -> auto-computed deadline is overdue" || fail "RTI escalation deadline not computed/overdue: $filed_resp"

lok_filed_resp=$(curl -s -b "$JAR" -X POST "$BASE/api/cases/$case_id/filed" \
  -H "Content-Type: application/json" \
  -d "{\"filed_date\":\"$filed_35_ago\"}")
echo "$lok_filed_resp" | grep -q '"escalation_deadline":null' && pass "Lokayuktha case has no fixed statutory SLA -> escalation_deadline stays null" || fail "Lokayuktha case unexpectedly got an auto deadline: $lok_filed_resp"

code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/cases/$rti_id/filed" \
  -H "Content-Type: application/json" -d "{\"filed_date\":\"$filed_35_ago\"}")
[ "$code" = "404" ] && pass "User B setting filed_date on User A's case -> 404" || fail "User B setting filed_date on User A's case -> $code"

# Ownership is checked before any LLM call, so this is safe/free to run.
code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/ai/escalate" \
  -H "Content-Type: application/json" -d "{\"case_id\":$rti_id}")
[ "$code" = "404" ] && pass "User B generating an escalation draft on User A's case -> 404 (rejected before any LLM call)" || fail "User B generating an escalation draft on User A's case -> $code"

# 8. Citation Checker: genuinely public (no auth needed), correctly flags an
# outdated IPC citation, and is rate-limited per IP.
CIT_IP="203.0.113.$$"
cit_resp=$(curl -s -X POST "$BASE/api/citation-check" \
  -H "Content-Type: application/json" -H "X-Forwarded-For: $CIT_IP" \
  -d '{"text":"Charged under Section 302 of the Indian Penal Code, 1860."}')
echo "$cit_resp" | grep -q '\[OUTDATED:' && pass "POST /api/citation-check (no auth) flags an outdated IPC citation" || fail "Citation checker did not flag outdated citation: $cit_resp"

# Seed 4 more log rows directly (the request above already logged 1) to reach
# the 5/hour cap without spending 4 more real LLM calls, then confirm the 6th
# request is rejected before any LLM call is made.
if [ -f "$DB_PATH" ] && command -v sqlite3 >/dev/null 2>&1; then
  for i in 1 2 3 4; do
    sqlite3 "$DB_PATH" "INSERT INTO citation_check_logs (ip_address, created_at) VALUES ('$CIT_IP', datetime('now'));"
  done
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/citation-check" \
    -H "Content-Type: application/json" -H "X-Forwarded-For: $CIT_IP" -d '{"text":"test"}')
  [ "$code" = "429" ] && pass "6th citation-check request from same IP in an hour -> 429" || fail "Citation checker rate limit not enforced: $code"
else
  echo "SKIP: citation-check rate-limit test (sqlite3 CLI or DB file not found at $DB_PATH)"
fi

# 9. Billing: a fresh user is on the free plan (limit 1/month), and the
# quota gate blocks a document before spending any LLM call once the monthly
# limit is reached. Uses its own case, separate from $case_id above (section
# 6 already seeded a draft into that one, on the same user, which the
# drafts_used_this_month count below correctly reflects too - it's scoped
# per-user across all their cases, not per-case).
billing_case_resp=$(curl -s -b "$JAR" -X POST "$BASE/api/cases" \
  -H "Content-Type: application/json" -d '{"title":"Smoke Test Billing Case","forum":"lokayuktha"}')
billing_case_id=$(echo "$billing_case_resp" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

billing_status=$(curl -s -b "$JAR" "$BASE/api/billing/status")
echo "$billing_status" | grep -q '"plan":"free"' && echo "$billing_status" | grep -q '"drafts_limit":1' \
  && pass "GET /api/billing/status -> free plan, limit 1/month" || fail "Unexpected billing status for fresh user: $billing_status"

# Seed 1 draft directly (avoids spending a real LLM call) to simulate
# reaching the free tier's 1-document/month limit, then confirm the next
# generation attempt is rejected before any LLM call is made.
if [ -f "$DB_PATH" ] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" "INSERT INTO drafts (case_id, instruction, content, language) VALUES ($billing_case_id, 'smoke seed', 'seed content', 'en');"
  code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/ai/draft" \
    -H "Content-Type: application/json" -d "{\"case_id\":$billing_case_id,\"prompt_context\":\"x\",\"instruction\":\"x\"}")
  [ "$code" = "402" ] && pass "Free-tier quota exhausted -> 402 (rejected before any LLM call)" || fail "Free-tier quota gate did not trigger: $code"
else
  echo "SKIP: billing quota gate check (sqlite3 CLI or DB file not found at $DB_PATH)"
fi

code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/billing/checkout")
[ "$code" = "503" ] && pass "POST /api/billing/checkout -> 503 while Razorpay is unconfigured" || fail "Billing checkout status unexpected -> $code"

# 10. Logout invalidates the session
curl -s -b "$JAR" -c "$JAR" -o /dev/null -X POST "$BASE/api/logout"
code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE/api/cases")
[ "$code" = "401" ] && pass "POST /api/logout then GET /api/cases -> 401" || fail "Post-logout request -> $code"

rm -f "$JAR2"
echo
echo "All API smoke checks passed."
