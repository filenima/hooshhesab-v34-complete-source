#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtdWJwamlwajAwMDBvOXcza2JxZGY1NjUiLCJ0eXBlIjoic3VwZXJhZG1pbiIsInVzZXJuYW1lIjoic3VwZXJhZG1pbiIsImlhdCI6MTc5MDYzMjE2NDk1Mn0.yiQ8lrA1tnpBL8OV1fdcVVSjTHpPpwaKKwLzEQ7ES0g"
B="http://127.0.0.1:3000"

wait_up() {
  for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$B/api/health" 2>/dev/null)
    if [ "$CODE" = "200" ]; then return 0; fi
    sleep 10
  done
  return 1
}

req() {
  local method="$1" path="$2" body="$3"
  for i in 1 2 3; do
    if [ -n "$body" ]; then
      R=$(curl -s -m 120 -X "$method" "$B$path" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body" 2>/dev/null)
    else
      R=$(curl -s -m 120 -X "$method" "$B$path" -H "Authorization: Bearer $TOKEN" 2>/dev/null)
    fi
    if [ -n "$R" ]; then echo "$R"; return 0; fi
    echo "  (empty response, waiting for server...)" >&2
    wait_up || return 1
  done
  return 1
}

echo "=== push-schedules flow ==="
wait_up || { echo "SERVER NEVER CAME UP"; exit 1; }

echo "-- create DAILY:"
R=$(req POST /api/platform/push-schedules '{"title":"یادآوری روزانه ثبت اسناد","body":"اسناد امروز را ثبت کنید","url":"/dashboard","recurrence":"DAILY","hourOfDay":9}')
echo "$R" | head -c 250; echo
SID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
echo "SID=$SID"

echo "-- create WEEKLY (day=1):"
req POST /api/platform/push-schedules '{"title":"خلاصه هفتگی","body":"گزارش هفته آماده است","recurrence":"WEEKLY","dayOfWeek":1,"hourOfDay":10}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['success'], d['data']['dayLabel'])" 2>/dev/null || echo SKIP

echo "-- invalid WEEKLY (no day):"
req POST /api/platform/push-schedules '{"title":"bi-rooz","body":"err","recurrence":"WEEKLY"}' | head -c 130; echo

echo "-- list:"
req GET /api/platform/push-schedules | python3 -c "import json,sys; [print(' ', s['title'],'|',s['recurrence'],'|',s['dayLabel'],'| hour',s['hourOfDay'],'| active',s['active']) for s in json.load(sys.stdin)['data']]" 2>/dev/null

echo "-- toggle off/on:"
req PATCH /api/platform/push-schedules "{\"id\":\"$SID\",\"action\":\"toggle\"}" | python3 -c "import json,sys; print(' ', json.load(sys.stdin)['message'])" 2>/dev/null
req PATCH /api/platform/push-schedules "{\"id\":\"$SID\",\"action\":\"toggle\"}" | python3 -c "import json,sys; print(' ', json.load(sys.stdin)['message'])" 2>/dev/null

echo "-- send-now (0 subs):"
req PATCH /api/platform/push-schedules "{\"id\":\"$SID\",\"action\":\"send-now\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(' ', d['message'], '| summary:', d.get('summary'))" 2>/dev/null

echo "-- cron:"
req GET /api/cron/push-schedules | head -c 250; echo

echo "-- delete daily:"
req DELETE "/api/platform/push-schedules?id=$SID" | head -c 100; echo

echo "-- final count:"
req GET /api/platform/push-schedules | python3 -c "import json,sys; print(' ', len(json.load(sys.stdin)['data']))" 2>/dev/null

echo ""
echo "=== SMTP settings flow ==="
echo "-- GET (log-only):"
req GET /api/platform/settings/smtp | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(' ', d['status']['modeLabel'], '| pass:', repr(d['settings']['pass']), '| hasPassword:', d['settings']['hasPassword'])" 2>/dev/null

echo "-- PUT fake config:"
req PUT /api/platform/settings/smtp '{"host":"smtp.fake-test.example.com","port":"587","user":"noreply@fake-test.example.com","pass":"secret123","fromName":"hoosh-test","fromEmail":"noreply@fake-test.example.com","secure":false}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(' ', d['message'])" 2>/dev/null

echo "-- GET (should be active from db):"
req GET /api/platform/settings/smtp | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(' ', d['status']['modeLabel'], '| hasPassword:', d['settings']['hasPassword'], '| pass masked:', repr(d['settings']['pass']))" 2>/dev/null

echo "-- test email (should FAIL - fake host):"
req POST "/api/platform/settings/smtp?action=test" '{"to":"admin@example.com"}' | head -c 220; echo

echo "-- PUT empty (reset to log-only):"
req PUT /api/platform/settings/smtp '{"host":"","port":"587","user":"","pass":"","fromName":"","fromEmail":"","secure":false}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(' ', d['message'])" 2>/dev/null

echo "-- test email (mock mode):"
req POST "/api/platform/settings/smtp?action=test" '{"to":"admin@example.com"}' | head -c 220; echo

echo ""
echo "=== 2FA reminder flow ==="
DEADLINE=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow()+timedelta(days=2)).strftime('%Y-%m-%d'))")
echo "-- PUT deadline ($DEADLINE = 2 days):"
req PUT /api/platform/settings/2fa-reminder "{\"deadline\":\"$DEADLINE\"}" | python3 -c "import json,sys; print(' ', json.load(sys.stdin)['message'])" 2>/dev/null

echo "-- GET deadline:"
req GET /api/platform/settings/2fa-reminder | head -c 200; echo

echo "-- run reminders:"
req POST "/api/platform/settings/2fa-reminder?action=run" | python3 -c "import json,sys; d=json.load(sys.stdin); print(' ', d['data']['status'], '|', d['data']['statusMessage'], '| sent:', d['data']['sent'], '| deduped:', d['data']['deduped'])" 2>/dev/null

echo "-- run again (dedup expected):"
req POST "/api/platform/settings/2fa-reminder?action=run" | python3 -c "import json,sys; d=json.load(sys.stdin); print(' ', d['data']['status'], '| sent:', d['data']['sent'], '| deduped:', d['data']['deduped'])" 2>/dev/null

echo "-- cron 2fa-reminders:"
req GET /api/cron/2fa-reminders | head -c 320; echo

echo "-- clear deadline:"
req PUT /api/platform/settings/2fa-reminder '{"deadline":""}' | python3 -c "import json,sys; print(' ', json.load(sys.stdin)['message'])" 2>/dev/null
