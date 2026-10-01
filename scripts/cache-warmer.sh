#!/bin/bash
# cache-warmer.sh — گرم‌کردن ترتیبی کش Turbopack بعد از هر ری‌استارت dev
# WHY: سندباکس 4GB — وقتی چند route همزمان کامپایل می‌شوند، حافظه native
# توربوپک تا 3.3GB باد می‌کند و کرنل next-server را OOM-kill می‌کند؛
# routeهایی که دقیقاً قبل از کشته‌شدن کامپایل می‌شوند هیچ‌وقت flush کش
# نمی‌شوند → در هر سیکل دوباره 6-12s کامپایل می‌خورند → چرخهٔ بی‌پایان.
# راه‌حل: بعد از هر بالاآمدن، routeهای پُربازدید را «پشت‌سرهم و با فاصله»
# درخواست می‌کنیم تا تک‌تک وارد کش دیسک شوند (کامپایل بعدی: ~ms).
# اجرا از درخت watchdog (dev-services.sh) → بین فراخوانی‌های ابزار زنده می‌ماند.

LOG="/home/z/my-project/dev-warmer.log"
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

# FIX(v20-stability): سوییچ توقف اضطراری — در محیط کم‌حافظه (سندباکس ۴GB با
# baseline بالا) خودِ چرخهٔ گرم‌کردن/فلوش‌کردن، ناپایداری می‌سازد. با ایجاد
# فایل /tmp/hoosh-warmer-paused، warmer بدون هیچ فعالیتی خارج می‌شود تا
# سیستم با واچ‌داگِ تنها-مالک پایدار شود. (در سرور واقعی حذفش کنید)
if [ -f /tmp/hoosh-warmer-paused ]; then
  log "paused via /tmp/hoosh-warmer-paused — exiting without warming"
  exit 0
fi

# FIX(v20-mem-guard): اگر حافظهٔ آزاد از پیش کم است، گرم‌کردن فقط فشار اضافه
# می‌کند — پاس را رد کن تا سیکل بعدی با حافظهٔ بهتر ادامه دهد.
AVAIL_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 9999)
if [ "${AVAIL_MB:-9999}" -lt 1500 ]; then
  log "low memory at start (${AVAIL_MB}MB) — skipping this warming pass"
  exit 0
fi

# ۱) صبر برای بالا آمدن سرور (حداکثر 150s)
up=0
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 4 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then up=1; break; fi
  sleep 5
done
if [ "$up" != "1" ]; then log "server did not come up — exit"; exit 0; fi

# FIX(warmer-race): watchdog هم warmup خودش را انجام می‌دهد (home + ۴ مسیر حیاتی).
# اگر هر دو همزمان مسیرهای متفاوت را گرم کنند → دو کامپایل موازی → OOM قطعی
# (لاگ 01:19: plans + products-api همزمان → kill). حالا: این اسکریپت تا پایان
# فاز warmup واچ‌داگ (علامت /tmp/hoosh-warmed.flag) صبر می‌کند — حداکثر ۲۰ دقیقه.
WARMED_FLAG=/tmp/hoosh-warmed.flag
if [ ! -f "$WARMED_FLAG" ]; then
  log "waiting for watchdog warmup to finish first (serial warming avoids OOM)..."
  for i in $(seq 1 120); do
    [ -f "$WARMED_FLAG" ] && break
    # اگر سرور در این بین مرد، این سیکل باطل است — خروج (سیکل بعدی dev-services)
    h=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:3000/api/health" 2>/dev/null)
    [ "$h" != "200" ] && { log "server died while waiting for watchdog warmup — exit"; exit 0; }
    sleep 10
  done
  [ -f "$WARMED_FLAG" ] && log "watchdog warmup done — starting own warming pass" || log "timeout waiting for watchdog — proceeding cautiously"
fi

# ۲) routeهای پربازدید (بر اساس لاگ ترافیک واقعی)
ROUTES=(
  # FIX(50s-OOM-loop): «/» باید «اول» گرم شود نه آخر — کامپایل سنگین ~۳GB وقتی سرور لاغر است
  # شانس بقا دارد؛ اگر آخر باشد (سرورِ چاق از ~۲۰ مسیر) همیشه OOM و چرخهٔ بی‌پایان.
  "/"
  "/api/license/status"
  "/api/branding"
  "/api/plans"
  "/api/testimonials?limit=1"
  "/api/blog/list?limit=3"
  "/api/trust-badges"
  "/api/site-content"
  "/api/platform/settings/session"
  "/api/ads/active"
  "/api/notifications"
  "/api/budget/alerts"
  "/api/marketing/in-app-messages?forCurrentUser=1&active=1"
  "/api/marketing/loyalty?history=1&limit=10"
  "/api/user/profile"
  "/api/integrations/modian/status"
  "/api/dashboard"
  "/api/health/detailed"
  "/manifest.webmanifest"
)
log "server up — warming ${#ROUTES[@]} routes sequentially"

# ۳) گرم‌کردن ترتیبی — بین هر route 3s فاصله تا compile+flush کامل شود
CHUNK_DONE=0 # FIX(chunk-flush): شمارندهٔ مسیرهای گرم‌شده از آخرین flush
for r in "${ROUTES[@]}"; do
  # اگر سرور وسط کار مرد، بقیه را رها کن (سیکل بعدی watchdog دوباره می‌سازد)
  alive=$(curl -s -o /dev/null -w "%{http_code}" -m 4 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ "$alive" != "200" ]; then log "server died while warming at $r — stop"; exit 0; fi
  t0=$(date +%s)
  # FIX(50s-OOM-loop): «/» کامپایل سردِ ~۵۵-۷۵ ثانیه‌ای دارد؛ مهلت ۴۵ ثانیه‌ای
  # قبلی وسط کامپیل لغو می‌شد و گرم‌کردن ۲۰ مسیر API «همزمان با همان کامپیل
  # ناتمام» شروع می‌شد → سرور چاق + پیک حافظه → OOM قطعی در هر بوت.
  # حالا: «/» تا ۳۰۰ ثانیه صبر می‌کند و تا موفق نشود هیچ مسیر دیگری گرم نمی‌شود.
  if [ "$r" = "/" ]; then
    for attempt in 1 2 3; do
      code=$(curl -s -o /dev/null -w "%{http_code}" -m 300 "http://127.0.0.1:3000/" 2>/dev/null)
      if [ "$code" = "200" ]; then break; fi
      log "root warm attempt $attempt failed (code=$code) — waiting for recovery"
      # اگر سرور مرد، صبر کن watchdog برگرداند
      for i in $(seq 1 60); do
        h=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:3000/api/health" 2>/dev/null)
        if [ "$h" = "200" ]; then break; fi
        sleep 5
      done
    done
    dt=$(( $(date +%s) - t0 ))
    log "warmed / (${dt}s, code=$code)"
    if [ "$code" = "200" ]; then
      # FIX(cache-flush): بعد از کامپایل سردِ ~۳.۴GB، سرور در پیک حافظه می‌ماند و
      # اولین درخواست بعدی OOM می‌کند؛ OOM-kill = dirty shutdown = کش دیسک از دست
      # می‌رود = چرخهٔ بی‌نهایت. راه‌حل: خاموشی «تمیز» (SIGTERM) بلافاصله بعد از
      # کامپایل موفق → Turbopack کش را روی دیسک flush می‌کند → بوت بعدی «/» را
      # از کش دیسک با حافظهٔ کم سرو می‌کند → سیستم پایدار.
      log "clean restart to flush turbopack cache to disk..."
      NEXT_PID=$(pgrep -f "next dev" | head -1)
      if [ -n "$NEXT_PID" ]; then
        kill -TERM "$NEXT_PID" 2>/dev/null
        sleep 3
        kill -TERM $(pgrep -f "next-server" | head -1) 2>/dev/null
      fi
      # FIX(v20-race): قبلاً اینجا بعد از ۲۰ ثانیه «self-start» بود — با واچ‌داگِ (الان سریع‌تر)
      # مسابقه می‌گذاشت: هر دو سرور جدا استارت می‌کردند → EADDRINUSE → حلقهٔ کرش فوری.
      # قانون جدید: واچ‌داگ تنها مالک چرخهٔ حیات سرور است. اینجا فقط منتظر می‌مانیم
      # (تا ۱۲۰ ثانیه — بیشتر از چرخهٔ تأیید ۶۰ثانیه‌ای واچ‌داگ) و اگر برنگشت،
      # همین پاس با خروج جمع می‌شود؛ چرخهٔ بعدی واچ‌داگ warmer تازه‌ای می‌سازد.
      for i in $(seq 1 24); do
        h=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:3000/api/health" 2>/dev/null)
        if [ "$h" = "200" ]; then break; fi
        sleep 5
      done
      # صبر تکمیلی اگر watchdog همزمان در حال آوردن سرور است
      for i in $(seq 1 30); do
        h=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:3000/api/health" 2>/dev/null)
        if [ "$h" = "200" ]; then break; fi
        sleep 5
      done
      # راستی‌آزمایی: «/» باید حالا از کش سریع باشد (<15s)
      t1=$(date +%s)
      code2=$(curl -s -o /dev/null -w "%{http_code}" -m 120 "http://127.0.0.1:3000/" 2>/dev/null)
      dt2=$(( $(date +%s) - t1 ))
      log "root after clean restart: code=$code2 (${dt2}s)"
      if [ "$code2" = "200" ] && [ "$dt2" -lt 20 ]; then
        log "✓ root is disk-cached and fast — system stable, continuing with API routes"
      fi
    fi
    sleep 5
    continue
  fi
  curl -s -o /dev/null -m 45 "http://127.0.0.1:3000$r" 2>/dev/null
  dt=$(( $(date +%s) - t0 ))
  log "warmed $r (${dt}s)"
  sleep 3
  # FIX(chunk-flush): بعد از هر ۴ مسیر API، حافظهٔ native توربوپک (که با
  # هر کامپایل ~۳۰۰-۸۰۰MB باد می‌کند) به سقف سندباکس می‌رسد و OOM می‌زند
  # (لاگ 01:27: بعد از ۴ مسیر، kill در پنجمی). چانک‌بندی: هر ۴ مسیر یک
  # خاموشی تمیز (flush کش به دیسک) + بازگشت فوری — حافظه هرگز اوج نمی‌گیرد.
  CHUNK_DONE=$((CHUNK_DONE + 1))
  if [ $CHUNK_DONE -ge 4 ]; then
    CHUNK_DONE=0
    log "chunk of 4 routes done — clean restart to flush memory (avoids OOM at ~2.7GB)"
    NEXT_PID=$(pgrep -f "next dev" | head -1)
    if [ -n "$NEXT_PID" ]; then
      kill -TERM "$NEXT_PID" 2>/dev/null
      sleep 3
      kill -TERM $(pgrep -f "next-server" | head -1) 2>/dev/null
    fi
    # FIX(v20-race): بدون self-start — فقط انتظار برای بازگشت واچ‌داگ (تا ۱۲۰s)
    for i in $(seq 1 24); do
      h=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:3000/api/health" 2>/dev/null)
      if [ "$h" = "200" ]; then break; fi
      sleep 5
    done
    # صبر تکمیلی برای بازگشت
    for i in $(seq 1 24); do
      h=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:3000/api/health" 2>/dev/null)
      if [ "$h" = "200" ]; then break; fi
      sleep 5
    done
  fi
done
log "warm pass complete"
