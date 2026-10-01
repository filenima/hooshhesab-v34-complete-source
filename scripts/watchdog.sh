#!/bin/bash
# hoosh-watchdog.sh — نگهبان سرور توسعهٔ هوش (خودترمیم بعد از OOM)
# WHY: سرور next-server در سندباکس (۴GB RAM) هنگام کامپایل/هیدریشن کامل
# به ~۳GB می‌رسد و OOM-kill می‌شود. کش Turbopack پایدار می‌ماند، پس هر
# restart سریع‌تر بالا می‌آید تا بالاخره همهٔ مسیرها کش شوند و پایدار شود.
# این نگهبان فقط زیرساخت است (مشابه start.sh سندباکس) — نه کرون‌جاب اپ.
# Mini-services (۳۰۳۱/۳۰۳۲) توسط dev-services.sh به‌صورت idempotent مدیریت می‌شوند.
#
# FIX(v13): گرم‌کردن تدریجی مسیرهای حیاتی — کامپایل تنبل (lazy) در میانهٔ
# کارِ کاربر، سقوط OOM و «در ۹۰٪ گیرکردن ایمپورت» را می‌ساخت. الگوریتم:
# لیست ماندگار مسیرهای گرم‌شده (/tmp) + در هر بوت فقط وقتی ادامه می‌دهیم
# که حافظه ≥۷۰۰MB باشد؛ اگر کم شد صبر/توقف — restart طبیعی بعدی از همان
# جا ادامه می‌دهد (کش Turbopack می‌ماند) تا همهٔ مسیرها گرم و سرور پایدار شود.

LOCK=/tmp/hoosh-watchdog.lock
LOG=/home/z/my-project/watchdog.log
WARMED=/tmp/hoosh-warmed.flag
WARM_LIST=/tmp/hoosh-warmed.list

# جلوگیری از نمونهٔ دوم
if [ -f "$LOCK" ] && kill -0 "$(cat $LOCK 2>/dev/null)" 2>/dev/null; then
  echo "watchdog already running (pid $(cat $LOCK))" >> /dev/stderr
  exit 0
fi
echo $$ > "$LOCK"

cd /home/z/my-project || exit 1

echo "[$(date '+%F %H:%M:%S')] watchdog started (pid $$)" >> "$LOG"

health() {
  curl -s -o /dev/null -w "%{http_code}" -m 300 "http://127.0.0.1:3000/api/health" 2>/dev/null
}

avail_mb() {
  awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 9999
}

# FIX(v30 — memory recycle): next-server در سندباکس ۴GB با کامپایل تدریجی
# روت‌ها تا ~۲.۸GB رشد می‌کند و کرنل OOM-kill می‌زند (بازیابی کُند + ریسک
# stale-cache). اگر RSS از آستانه گذشت، «قبل» از سقوط، ری‌استارت برنامه‌ریزی‌شده
# می‌کنیم — بوت تمیز و سریع.
next_rss_mb() {
  local pid
  pid=$(pgrep -f "next-server" | head -1)
  [ -n "$pid" ] || echo 0
  [ -n "$pid" ] && awk '/VmRSS/ {print int($2/1024)}' "/proc/$pid/status" 2>/dev/null || echo 0
}
RSS_RECYCLE_LIMIT_MB=2200

start_dev() {
  echo "[$(date '+%F %H:%M:%S')] starting dev server..." >> "$LOG"
  (
    cd /home/z/my-project
    # FIX(v13.5 — orphan pattern): پروسه‌های «مستقیم» زیر درخت هر فراخوانی Bash
    # ابزار، در پایان همان فراخوانی SIGKILL می‌شوند (کامنت dev-services.sh).
    # راه‌حل: واسطه‌ای که فوراً exit می‌کند → درخت سرور یتیم (re-parent)
    # و از درخت فراخوانی جدا می‌ماند → زنده می‌ماند. الگوی double-setsid.
    setsid bash -c '(setsid nohup bash -c '\''cd /home/z/my-project; NODE_OPTIONS="--max-old-space-size=1024" TURBOPACK_MAX_WORKERS=1 NEXT_TELEMETRY_DISABLED=1 bash scripts/dev-services.sh; exec bunx next dev -p 3000 -H 0.0.0.0 2>&1 | tee dev.log'\'' > /dev/null 2>&1 < /dev/null &); exit 0' \
      > /dev/null 2>&1 < /dev/null &
  )
}

# صبر برای حافظهٔ کافی — حداکثر max_wait×15 ثانیه؛ خروجی 0 اگر رسید
wait_for_mem() {
  local min_mb="$1"
  local max_wait="${2:-8}"
  local health_fails=0
  for i in $(seq 1 "$max_wait"); do
    local code
    code=$(health) || code="000"
    if [ "$code" != "200" ]; then
      health_fails=$((health_fails + 1))
      # تا ۶ شکست پیاپی (≈ چند دقیقه کامپایل) تحمل کن — نه فوراً return 1
      if [ "$health_fails" -ge 6 ]; then return 1; fi
      sleep 15
      continue
    fi
    health_fails=0
    local avail=$(avail_mb)
    [ "$avail" -ge "$min_mb" ] && return 0
    sleep 15
  done
  avail=$(avail_mb)
  [ "$avail" -ge "$min_mb" ]
}

# گرم‌کردن یک مسیر — سرور باید زنده باشد؛ نتیجهٔ نهایی مهم نیست (۲۰۰/۴۰۱/۴۰۴ همه یعنی کامپایل شد)
warm_route() {
  local label="$1"; local timeout_s="$2"; local url="$3"
  for i in 1 2 3; do
    [ "$(health)" = "200" ] || return 1
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -m "$timeout_s" "$url" 2>/dev/null)
    echo "[$(date '+%F %H:%M:%S')] warm \"$label\" -> $code (avail=$(avail_mb)MB)" >> "$LOG"
    if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "404" ] || [ "$code" = "400" ]; then
      return 0
    fi
    sleep 10
  done
  return 0
}

# لیست مسیرهای حیاتی به‌ترتیب اولویت (مسیرهای پرمصرفِ تجربهٔ کاربر)
WARM_ROUTES=(
  "home|150|http://127.0.0.1:3000/"
  "products-api|120|http://127.0.0.1:3000/api/products?limit=1"
  "import-api|120|http://127.0.0.1:3000/api/import"
  "parties-api|120|http://127.0.0.1:3000/api/parties?limit=1"
  "invoices-api|120|http://127.0.0.1:3000/api/invoices?limit=1"
  "blog-list|240|http://127.0.0.1:3000/blog"
  "blog-post|240|http://127.0.0.1:3000/blog/cloud-accounting-software-what-is-1404"
  "pricing-page|240|http://127.0.0.1:3000/pricing"
)

# FIX(v29 — stale-route healer): بعد از OOM-ری‌استارت، کش Turbopack گاهی روت‌های
# API را stale نگه می‌دارد → همهٔ درخواست‌ها 404 با بدنهٔ HTML (صفحهٔ 404 Next)
# برمی‌گردند در حالی که فایل route.ts موجود است. علامت تشخیص: 404 روی روتی که
# حتماً وجود دارد (پاسخ سالم این روت‌ها 200/401/405 است، هرگز 404 نیست).
# درمان: touch فایل route.ts → کامپایل مجدد آن روت. حافظهٔ ≥۵۰۰MB لازم است
# (کامپایل روت API سبک است — ریسک OOM ناچیز نسبت به سود بازیابی خودکار).
HEAL_ROUTES=(
  "http://127.0.0.1:3000/api/blog/list|app/api/blog/list/route.ts"
  "http://127.0.0.1:3000/api/platform/anti-fraud|app/api/platform/anti-fraud/route.ts"
  "http://127.0.0.1:3000/api/platform/blog/scheduler|app/api/platform/blog/scheduler/route.ts"
  "http://127.0.0.1:3000/api/platform/widgets-stats|app/api/platform/widgets-stats/route.ts"
  "http://127.0.0.1:3000/api/platform/cms/posts|app/api/platform/cms/posts/route.ts"
  "http://127.0.0.1:3000/api/platform/newsletter|app/api/platform/newsletter/route.ts"
  "http://127.0.0.1:3000/api/cron/publish-scheduled|app/api/cron/publish-scheduled/route.ts"
  "http://127.0.0.1:3000/api/cron/newsletter-weekly|app/api/cron/newsletter-weekly/route.ts"
  "http://127.0.0.1:3000/api/newsletter/subscribe|app/api/newsletter/subscribe/route.ts"
)
HEAL_STAMP=/tmp/hoosh-route-heal.stamp

heal_routes() {
  # فقط وقتی سرور سالم است و حافظه کافی دارد
  [ "$(health)" = "200" ] || return 0
  [ "$(avail_mb)" -ge 500 ] || return 0
  local healed=0
  for entry in "${HEAL_ROUTES[@]}"; do
    local url="${entry%%|*}"; local file="${entry#*|}"
    [ -f "$file" ] || continue
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$url" 2>/dev/null)
    if [ "$code" = "404" ]; then
      echo "[$(date '+%F %H:%M:%S')] route-heal: stale 404 on $url — touching $file" >> "$LOG"
      touch "$file"
      healed=$((healed + 1))
      # بین هر touch چند ثانیه فاصله تا کامپایل‌ها سریالی بمانند
      sleep 4
    fi
  done
  if [ "$healed" -gt 0 ]; then
    # پس از touchها به کامپایل فرصت بده و نتیجه را راستی‌آزمایی کن
    sleep 12
    local still_bad=0
    for entry in "${HEAL_ROUTES[@]}"; do
      local url="${entry%%|*}"; local file="${entry#*|}"
      local code
      code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$url" 2>/dev/null)
      [ "$code" = "404" ] && [ -f "$file" ] && still_bad=$((still_bad + 1))
    done
    echo "[$(date '+%F %H:%M:%S')] route-heal: touched=$healed, still-stale=$still_bad" >> "$LOG"
  fi
  date +%s > "$HEAL_STAMP"
}

warmup() {
  echo "[$(date '+%F %H:%M:%S')] warmup phase start (done: $(tr '\n' ',' < "$WARM_LIST" 2>/dev/null || echo none))" >> "$LOG"
  sleep 15
  # مرحلهٔ ۱ — صفحهٔ اصلی «/» همیشه اول و تنهایی: پنل پیش‌نمایش پلتفرم هم
  # همین مسیر را متراقب می‌کند؛ کامپایل همزمان «/» + مسیر دیگر = OOM قطعی.
  # curl طولانی ما آن را سریالی می‌کند (درخواست دوم به همان کامپال سوار می‌شود).
  if ! grep -qxF "home" "$WARM_LIST" 2>/dev/null; then
    if ! wait_for_mem 900 6; then
      if [ "$(health)" != "200" ]; then return 1; fi
      echo "[$(date '+%F %H:%M:%S')] warmup paused (low mem $(avail_mb)MB) before home" >> "$LOG"
      touch "$WARMED"; return 0
    fi
    warm_route "home" 300 "http://127.0.0.1:3000/" || return 1
    echo "home" >> "$WARM_LIST"
    # بعد از سنگین‌ترین کامپایل، به GC فرصت جدی بده
    sleep 45
  fi
  # مرحلهٔ ۲ — بقیهٔ مسیرها یکی‌یکی و فقط وقتی حافظه ≥ ۹۰۰MB
  for entry in "${WARM_ROUTES[@]}"; do
    label="${entry%%|*}"; rest="${entry#*|}"; timeout_s="${rest%%|*}"; url="${rest#*|}"
    [ "$label" = "home" ] && continue
    # قبلاً گرم شده — رد شو
    grep -qxF "$label" "$WARM_LIST" 2>/dev/null && continue
    # FIX(v13.1-stability): invoices-api سنگین‌ترین مسیر کامپایل است — در محیط‌های
    # کم‌حافظه (سندباکس ۴GB) گرم‌کردنش حلقهٔ OOM می‌ساخت (لاگ 2026-09-21).
    # فقط با حافظهٔ فراوان (≥2200MB) گرم می‌شود؛ در غیر این صورت به‌صورت on-demand کامپایل می‌شود.
    if [ "$label" = "invoices-api" ] && [ "$(avail_mb)" -lt 2200 ]; then
      echo "[$(date '+%F %H:%M:%S')] skip warm invoices-api (low mem $(avail_mb)MB) — on-demand compile" >> "$LOG"
      echo "$label" >> "$WARM_LIST"
      continue
    fi
    if ! wait_for_mem 900 8; then
      if [ "$(health)" != "200" ]; then return 1; fi
      echo "[$(date '+%F %H:%M:%S')] warmup paused (low mem $(avail_mb)MB) — resume after next natural restart" >> "$LOG"
      touch "$WARMED"
      return 0
    fi
    warm_route "$label" "$timeout_s" "$url" || return 1
    echo "$label" >> "$WARM_LIST"
    # بعد از هر کامپایل موفق، به GC فرصت بده
    sleep 30
  done
  echo "[$(date '+%F %H:%M:%S')] warmup phase done (avail=$(avail_mb)MB)" >> "$LOG"
  touch "$WARMED"
  # FIX(v29): بلافاصله بعد از گرم‌شدن، روت‌های stale احتمالی (دنبالهٔ OOM) را درمان کن
  heal_routes
}

# FIX(watchdog-boot): اگر سرور از قبل در حال بالاآمدن است، زمان شروع واچ‌داگ
# به‌عنوان مرجع مهلت در نظر گرفته می‌شود (LAST_START=0 یعنی «حالا» → مهلت صفر → قتل فوری!)
LAST_START=$(date +%s)
# FIX(v13.5 — crash vs boot): مهلت ۳۰۰ ثانیه فقط برای «کامپایل اولیهٔ بوت» است.
# اگر سرور همین اخیراً سالم بوده و ناگهان مرد (crash)، نباید ۵ دقیقه صبر کرد —
# LAST_OK زمان آخرین health موفق را نگه می‌دارد و crash تازه را سریع می‌گیرد.
LAST_OK=0

while true; do
  code=$(health)
  if [ "$code" = "200" ]; then
    LAST_OK=$(date +%s)
  fi
  if [ "$code" != "200" ]; then
    now=$(date +%s)
    # مسیر «کرش میانهٔ کار»: سرور در ۱۲۰ ثانیهٔ اخیر سالم بوده و حالا مرده →
    # این بوتِ تازه نیست؛ مهلت کامپایل ۳۰۰ ثانیه‌ای اعمال نمی‌شود.
    recently_healthy=$(( now - LAST_OK < 120 ))
    # فرصت اولیه: سرور تازه‌استارت‌شده تا ۳۰۰ ثانیه فرصت کامپایل اولیه دارد
    # FIX(v20): مهلت ۳۰۰ثانیه فقط وقتی معنا دارد که پروسهٔ سرور «زنده» و در حال
    # کامپایل باشد. اگر پروسهٔ next اصلاً وجود ندارد (مثلاً بوت لحظه‌ای کرش
    # کرده)، ۵ دقیقه انتظار بی‌فایده است → مستقیم به مسیر restart برو.
    if [ $((now - LAST_START)) -lt 300 ] && [ "$recently_healthy" != "1" ]; then
      if pgrep -f "next dev -p 3000|next-server" >/dev/null 2>&1; then
        sleep 20
        continue
      fi
      echo "[$(date '+%F %H:%M:%S')] boot-grace skipped: no next process (instant crash)" >> "$LOG"
    fi
    # تأیید دوم: ۶۰ ثانیه بعد هنوز مرده؟ (کامپایل طولانی اشتباه گرفته نشود)
    # FIX(v30): کامپایل‌های سنگین (مثل روت‌های داینامیک بلاگ/داشبورد) در
    # Turbopack تا ~۴ دقیقه طول می‌کشند و health در همین مدت 000 است.
    # اگر حافظه سالم (≥۷۰۰MB) و پروسهٔ next زنده است → این OOM نیست،
    # کامپایل است؛ تا ۲ مرحلهٔ اضافی (۶۰s + ۱۲۰s) فرصت بده.
    if [ "${CONFIRM_DEAD:-0}" = "0" ]; then
      CONFIRM_DEAD=1
      sleep 60
      continue
    fi
    if [ "$CONFIRM_DEAD" = "1" ] && [ "$(avail_mb)" -ge 700 ] && pgrep -f "next dev -p 3000|next-server" >/dev/null 2>&1; then
      echo "[$(date '+%F %H:%M:%S')] long-compile tolerance (avail=$(avail_mb)MB, next alive) — waiting 120s more" >> "$LOG"
      CONFIRM_DEAD=2
      sleep 120
      continue
    fi
    CONFIRM_DEAD=0
    # حداقل ۲۰ ثانیه فاصله بین restartها (جلوگیری از حلقهٔ مرگ)
    if [ $((now - LAST_START)) -lt 20 ]; then sleep $((20 - (now - LAST_START))); fi
    # اگر حافظه خیلی کم است، ۸ ثانیه صبر تا page cache آزاد شود
    avail=$(avail_mb)
    if [ "$avail" -lt 400 ]; then sleep 8; fi
    echo "[$(date '+%F %H:%M:%S')] health=$code avail=${avail}MB — restart" >> "$LOG"
    # هر پروسهٔ next باقی‌مانده را بکش (نیمه‌مرده بعد از OOM)
    pkill -f "next dev -p 3000" 2>/dev/null
    pkill -f "next-server" 2>/dev/null
    sleep 2
    rm -f "$WARMED"
    start_dev
    LAST_START=$(date +%s)
    # ۲۵ ثانیه به سرور فرصت بوت بده
    sleep 25
  elif [ ! -f "$WARMED" ]; then
    # سرور تازه بالا آمده — مسیرهای حیاتی را (تدریجی، با نگهبان حافظه) گرم کن
    warmup
  else
    # FIX(v30 — memory recycle): پیش از رسیدن کرنل، خودمان ری‌استارت تمیز کنیم
    rss=$(next_rss_mb)
    if [ "$rss" -ge "$RSS_RECYCLE_LIMIT_MB" ] 2>/dev/null; then
      echo "[$(date '+%F %H:%M:%S')] memory-recycle: next-server RSS=${rss}MB >= ${RSS_RECYCLE_LIMIT_MB}MB — planned restart" >> "$LOG"
      pkill -f "next dev -p 3000" 2>/dev/null
      pkill -f "next-server" 2>/dev/null
      sleep 2
      rm -f "$WARMED"
      start_dev
      LAST_START=$(date +%s)
      sleep 25
    else
      # FIX(v29): هر ۵ دقیقه یکبار روت‌های stale را بررسی/درمان کن (سبک — فقط curl)
      now_ts=$(date +%s)
      last_heal=$(cat "$HEAL_STAMP" 2>/dev/null || echo 0)
      if [ $((now_ts - last_heal)) -ge 300 ]; then
        heal_routes
      fi
    fi
  fi
  sleep 10
done
