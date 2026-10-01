#!/bin/bash
# dev-watchdog.sh — نگه‌دارندهٔ سرور dev در سندباکس ۴GB
# سرور هنگام کامپایل صفحات جدید گاهی OOM می‌شود؛ این واچ‌داگ هر ۱۵ ثانیه
# سلامت را چک می‌کند و در صورت مرگ، بلافاصله ری‌استارت می‌کند (کش دیسک
# می‌ماند → هر سیکل پیشرفت دارد و پس از کش‌شدن همهٔ مسیرها پایدار می‌شود).
LOG="/home/z/my-project/watchdog.log"
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ "$code" != "200" ]; then
    # بررسی اینکه فرآیند واقعاً مرده (نه فقط در حال کامپایل سنگین)
    if ! pgrep -f "next-server|bunx next" > /dev/null 2>&1; then
      log "server dead (code=$code) — restarting"
      cd /home/z/my-project
      setsid bash -c 'nohup bun run dev < /dev/null > /dev/null 2>&1 &'
      # فرصت ۹۰ ثانیه برای بالا آمدن
      for i in $(seq 1 18); do
        sleep 5
        c=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:3000/api/health 2>/dev/null)
        if [ "$c" = "200" ]; then log "server back up"; break; fi
      done
    fi
  fi
  sleep 15
done
