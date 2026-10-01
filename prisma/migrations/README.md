# Prisma Migrations — هوش

این پوشه شامل migrations پایگاه داده‌ی هوش است. Prisma از این پوشه برای
ردیابی و اعمال تغییرات schema استفاده می‌کند.

## ساختار

```
prisma/migrations/
├── README.md
├── 20240101000000_init/
│   └── migration.sql
├── 20240115000000_add_tenants/
│   └── migration.sql
└── migration_lock.toml
```

## جریان کاری

### ایجاد migration جدید

```bash
# 1. schema.prisma را ویرایش کنید
# 2. migration ایجاد کنید (بدون اعمال)
./scripts/run-migrations.sh  # با CREATE_MIGRATION=1

# یا مستقیماً
DATABASE_URL="file:./prisma/dev.db" bunx prisma migrate dev --name add_xxx --create-only

# 3. فایل migration.sql را بررسی کنید
# 4. migration را اعمال کنید
bunx prisma migrate dev
```

### اعمال در production

```bash
NODE_ENV=production \
DATABASE_URL="$PROD_DATABASE_URL" \
bunx prisma migrate deploy
```

### بررسی وضعیت

```bash
bunx prisma migrate status
```

### بازگشت (rollback)

Prisma به‌صورت پیش‌فرض rollback خودکار ندارد. برای بازگشت:

1. یک migration جدید با دستورات معکوس ایجاد کنید
2. یا دیتابیس را به backup قبلی بازگردانید

### بازنشانی دیتابیس (فقط dev)

```bash
bunx prisma migrate reset --force
```

## قواعد

- هر migration باید **idempotent** باشد (در صورت اجرای مجدد، خطا ندهد)
- برای داده‌های حساس، migration و data migration را جدا کنید
- قبل از deploy در production، migration را در staging تست کنید
- در صورت تغییر schema که منجر به از دست رفتن داده می‌شود، ابتدا یک migration
  دو مرحله‌ای ایجاد کنید (اول nullable، سپس پس از انتقال داده، required)

## migration_lock.toml

فایل `migration_lock.toml` provider دیتابیس را قفل می‌کند تا به‌اشتباه تغییر نکند:

```toml
provider = "sqlite"
```

## تاریخچه‌ی schema

تغییرات schema در `schema.prisma` ردیابی می‌شوند. هر commit باید شامل
تغییرات schema و migration متناظر باشد.
