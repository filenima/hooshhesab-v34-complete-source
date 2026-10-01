#!/bin/bash
# ============================================================
# package-source.sh — ساخت zip کامل سورس هوش‌حساب برای تحویل
# ============================================================
# استفاده: bash scripts/package-source.sh [نسخه]   (پیش‌فرض: v31)
# خروجی: download/hooshhesab-<نسخه>-complete-source.zip
#
# شامل: کل سورس (app/components/lib/hooks/prisma/db/mini-services/
#   scripts/public) + دیتابیس با همهٔ مقالات + پیکربندی‌ها + .env + worklog
# بدون: node_modules ریشه (بعد از unzip: `bun install`)، کش‌های build
#   (.next/.turbo)، .git، لاگ‌ها، tool-results، zipهای قبلی download
# node_modules سرویس‌های کوچک (chat/modian/audit/seo-worker) حفظ می‌شود
# تا mini-services بدون نصب هم بالا بیایند (الگوی zipهای قبلی).
#
# قابل اجرای مکرر — برای تازه‌سازی zip بعد از تولید مقالات جدید کافی
# است دوباره اجرا شود (کرون webDevReview هم همین کار را می‌کند).
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="${1:-v34}"
OUT="download/hooshhesab-${VERSION}-complete-source.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "[package] staging source (${VERSION})..."
rsync -a \
  --exclude '/node_modules' \
  --exclude '/.next' \
  --exclude '/.turbo' \
  --exclude '/.git' \
  --exclude '/dist' \
  --exclude '/tool-results' \
  --exclude '/download' \
  --exclude '/upload' \
  --exclude '/skills' \
  --exclude '/.env.local' \
  --exclude '*.log' \
  --exclude 'check-*-tmp.cjs' \
  --exclude '.DS_Store' \
  --exclude '*.zip' \
  --exclude '/public/downloads' \
  --exclude '*.apk' \
  --exclude '.gradle' \
  --exclude 'app/build' \
  --exclude '/.tmp-*' \
  --exclude '/.tmpq' \
  ./ "$STAGE/hooshhesab/"

# .env قابل حمل: مسیر مطلق سندباکس → مسیر نسبی (تست‌شده — از ریشهٔ پروژه
# با Prisma درست resolve می‌شود). JWT_SECRET دست‌نخورده می‌ماند (با دادههای
# دیتابیس هماهنگ است).
if [ -f "$STAGE/hooshhesab/.env" ]; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:../db/custom.db"|' "$STAGE/hooshhesab/.env"
fi

echo "[package] writing zip..."
mkdir -p download
rm -f "$OUT"
(cd "$STAGE" && zip -qr - hooshhesab) > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "[package] ✓ $OUT  ($SIZE, $FILES files)"
echo "[package] برای اجرا بعد از unzip: bun install && bun run db:push (در صورت نیاز) && bun run dev"
