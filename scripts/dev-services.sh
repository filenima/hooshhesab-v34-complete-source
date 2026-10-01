#!/bin/bash
# dev-services.sh — اطمینان از بالابودن سرویس‌های جانبی قبل از next dev
# WHY: سندباکس پروسه‌های spawn شدهٔ مستقیم توسط هر فراخوانی Bash ابزار را
# در پایان همان فراخوانی SIGKILL می‌کند؛ اما درخت فرزندانِ watchdog زنده می‌مانند.
# پس mini-services را از دلِ همین درخت (dev script) بالا می‌آوریم.
# Idempotent: اگر پورت گوش دهد، دوباره start نمی‌کند.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

up() { # up <port> <path> — true اگر HTTP پاسخ بدهد
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$1/" 2>/dev/null && return 0
  # socket.io polling endpoint هم امتحان شود (chat-service روی / جواب نمی‌دهد)
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$1/socket.io/?EIO=4&transport=polling" 2>/dev/null && return 0
  return 1
}

start() { # start <dir> <log>
  (cd "$1" && setsid nohup bun run dev > "$2" 2>&1 < /dev/null &)
}

# seo-worker — موتور مستقل تولید مقالهٔ سئو روی 3035 (v31)
# WHY: تولید مقاله ۵-۸ دقیقه LLM می‌خواهد؛ سرور Next.js در سندباکس هر ~۹۰
# ثانیه memory-recycle می‌شود → تولید باید در پروسهٔ مستقلِ کوچک انجام شود.
# خودش هنگام بوت اجراهای نیمه‌کاره را ازسرگیری می‌کند (dedupe + max-remaining).
if ! up 3035; then
  start "$ROOT/mini-services/seo-worker" "$ROOT/seo-worker.log"
fi

# chat-service — socket.io روی 3032 (چت زندهٔ پشتیبانی)
if ! up 3032; then
  start "$ROOT/mini-services/chat-service" "$ROOT/chat-service.log"
fi

# modian-mock — شبیه‌ساز سامانه مودیان روی 3031
if ! up 3031; then
  start "$ROOT/mini-services/modian-mock" "$ROOT/modian-mock.log"
fi

# cache-warmer — گرم‌کردن ترتیبی کش توربوپک (شکستن چرخهٔ OOM-recompile)
# در پس‌زمینه؛ خودش صبر می‌کند سرور بالا بیاید. هر سیکل watchdog یک پاس جدید.
if ! pgrep -f "cache-warmer.sh" > /dev/null 2>&1; then
  (setsid nohup bash "$ROOT/scripts/cache-warmer.sh" > /dev/null 2>&1 < /dev/null &)
fi

exit 0
