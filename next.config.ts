import type { NextConfig } from "next";

// هوش — Next.js 16 Configuration
// نسخه‌ی سبک برای dev در sandbox با حافظه‌ی محدود.
// Sentry/Bundle Analyzer فقط در production (با ANALYZE=true یا SENTRY_AUTH_TOKEN) فعال می‌شوند.
// نسخه‌ی کامل با همه‌ی قابلیت‌ها در فایل next.config.full.ts موجود است.

const isProd = process.env.NODE_ENV === "production";

const baseConfig: NextConfig = {
 // FIX (dev stability): Turbopack root را صریحاً به پوشه‌ی پروژه قفل می‌کنیم.
 // اگر پوشه‌ی والد lockfile داشته باشد (مثلاً هنگام توسعه درون workspace)،
 // Turbopack آن پوشه را root فرض می‌کند، module graph چند برابر بزرگ‌تر می‌شود
 // و سرور dev با OOM کشته می‌شود. با این تنظیم root همیشه پوشه‌ی خود پروژه است.
 turbopack: {
 root: __dirname,
 },
 // DEPLOY FIX (v18): Z.ai public deployment REQUIRES output:"standalone" —
 // build.sh (platform deploy script) checks for .next/standalone/server.js and
 // fails the whole deploy without it. Dev server is unaffected by this option.
 // The old comment "standalone removed — Z.ai requires standard build" was WRONG
 // and is the root cause of the broken public link.
 output: "standalone",
 staticPageGenerationTimeout: 120,
 // FIX: StrictMode در dev هر effect را دوبار اجرا می‌کند دو برابر API call
 // و فشار حافظه در sandbox با RAM محدود. در production فعال می‌ماند.
 reactStrictMode: isProd,
 // DEPLOY FIX (v18): preview panel + public link come from *.space-z.ai origins.
 // Without them Next.js dev BLOCKS cross-origin /_next/* requests (blocked warning
 // in dev.log) — app fails to hydrate → "خطا در ساخت حساب" style network errors.
 allowedDevOrigins: [
 "127.0.0.1",
 "localhost",
 "*.space-z.ai",
 "space-z.ai",
 "*.nobatime.ir",
 "*.vercel.app",
 ],
 poweredByHeader: false,
 typescript: {
 ignoreBuildErrors: true,
 },
 images: {
 formats: ["image/avif", "image/webp"],
 minimumCacheTTL: 60,
 remotePatterns: [{ protocol: "https", hostname: "**" }],
 dangerouslyAllowSVG: false,
 contentDispositionType: "attachment",
 // contentSecurityPolicy removed — can interfere with Z.ai's CDN and cause
 // deployment failures. Re-enable only for self-hosted VPS deployments.
 },
 async headers() {
 // در dev mode، کش استاتیک غیرفعال است تا تغییرات بلافاصله نمایش داده شوند
 // و ChunkLoadError هنگام recompile رخ ندهد.
 const staticCache = isProd
? "public, max-age=31536000, immutable"
: "no-cache, no-store, must-revalidate";

 // هدرهای امنیتی پایه — با iframe و پیش‌نمایش سازگارند و همیشه ارسال می‌شوند
 // FIX(v23): افزودن Permissions-Policy و CSP سازگار با dev — دو لایهٔ واقعی
 // ضد XSS/دسترسی‌های حساس مرورگر. CSP عمداً frame-ancestors ندارد تا
 // پنل پیش‌نمایش cross-origin سندباکس کار کند؛ unsafe-eval هم برای Turbopack
 // dev لازم است (در production با SECURITY_HEADERS=1 سخت‌گیرانه‌تر می‌شود).
 const baseHeaders = [
 { key: "X-Content-Type-Options", value: "nosniff" },
 { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
 { key: "X-DNS-Prefetch-Control", value: "on" },
 { key: "X-Download-Options", value: "noopen" },
 { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
 {
 key: "Permissions-Policy",
 value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=()",
 },
 {
 key: "Content-Security-Policy",
 value: [
 "default-src 'self'",
 // Turbopack dev + Next hydration نیاز به unsafe-inline/eval دارند
 "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
 "style-src 'self' 'unsafe-inline'",
 // تایل‌های نقشه (OSM) و آپلودها/داده‌ها
 "img-src 'self' data: blob: https:",
 "font-src 'self' data:",
 // socket.io / HMR / درخواست‌های API — هم http هم ws
 "connect-src 'self' https: ws: wss:",
 "frame-src 'self'",
 "worker-src 'self' blob:",
 "object-src 'none'",
 "base-uri 'self'",
 // فرم‌ها فقط به خود سایت ارسال شوند
 "form-action 'self'",
 ].join("; "),
 },
 ];

 // FIX(v12-preview — ریشهٔ سه‌بارهٔ «پیشنمایش کار نمی‌کند»):
 // پنل پیش‌نمایش سندباکس، اپ را داخل iframe با مبدأ متفاوت (cross-origin،
 // دامنه‌های *.space-z.ai) بارگذاری می‌کند. سرور production این سندباکس با
 // `next start` بالا می‌آید، پس هدرهای سخت‌گیرانهٔ زیر قبلاً فقط در dev
 // حذف می‌شدند ولی در production ارسال می‌شدند → X-Frame-Options:
 // SAMEORIGIN پیش‌نمایش را کاملاً بلاک می‌کرد (صفحهٔ سفید).
 // راه‌حل: این هدرها به‌طور پیش‌فرض «خاموش» هستند و فقط با SECURITY_HEADERS=1
 // (برای استقرار واقعی روی VPS با دامنهٔ اختصاصی) فعال می‌شوند.
 const enableStrictSecurity =
 isProd && process.env.SECURITY_HEADERS === "1";
 const prodGuardHeaders = enableStrictSecurity
? [
 { key: "X-Frame-Options", value: "SAMEORIGIN" },
 { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
 { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
 // بدون preload — preload تقریباً غیرقابل بازگشت است و برای ساب‌دامین مناسب نیست
 { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
 ]
: [];

 // FIX(v12-cache): HTML صفحه‌ها نباید سال‌ها در کش مشترک (CDN/پروکسی) بمانند —
 // Next.js برای صفحات prerender شده به‌طور پیش‌فرض s-maxage=31536000 می‌فرستد؛
 // پس از هر rebuild، HTML کش‌شدهٔ قدیمی به chunkهای حذف‌شده اشاره می‌کرد و
 // اپ در پیش‌نمایش/لینک عمومی برای کاربر «خراب» به نظر می‌رسید.
 // حالا همهٔ HTMLها همیشه revalidate می‌شوند؛ فقط /_next/static (هش‌دار)
 // immutable است. uploads هم عمدتاً نوتیفای می‌شود چون فایل هم‌نام بازنویسی
 // می‌شود (لوگوی جدید).
 const htmlCache = "public, max-age=0, must-revalidate";

 return [
 // ویجت‌های embed باید در سایت‌های مشتریان قابل iframe باشند
 {
 source: "/embed/:path*",
 headers: [
 ...baseHeaders,
 { key: "Content-Security-Policy", value: "frame-ancestors *" },
 { key: "Cache-Control", value: htmlCache },
 ],
 },
 // فایل‌های عمومی uploads — بدون محدودیت frame تا در سایت‌ها نمایش داده شوند
 {
 source: "/uploads/:path*",
 headers: [
 ...baseHeaders,
 { key: "Cache-Control", value: htmlCache },
 ],
 },
 // بقیه صفحات — بدون X-Frame-Options تا پیش‌نمایش cross-origin کار کند
 {
 source: "/((?!embed/|uploads/|_next/static/).*)",
 headers: [...baseHeaders, ...prodGuardHeaders, { key: "Cache-Control", value: htmlCache }],
 },
 // کش کردن دارایی‌های استاتیک هش‌دار — فقط در production immutable
 {
 source: "/_next/static/(.*)",
 headers: [
 { key: "Cache-Control", value: staticCache },
 ],
 },
 ];
 },
 compress: true,
 // webpack config: بهینه‌سازی chunk‌ها فقط در production build
 webpack(config, { dev }) {
 if (!dev) {
 config.optimization = {
...config.optimization,
 splitChunks: {
 chunks: 'all',
 maxSize: 244 * 1024,
 },
 };
 }
 return config;
 },
 // محدود کردن worker های Turbopack برای جلوگیری از OOM در sandbox با RAM محدود
 // (در Next.js 16 از طریق env: TURBOPACK_MAX_WORKERS / NEXT_SERVER_ACTIONS...)
 experimental: {
 // FIX (v12.2 dev-stability): circuit-breaker حافظه — در sandbox با RAM ~4GB
 // کامپایل صفحات سنگین (به‌ویژه «/» که کل AppShell را می‌سازد) تا ~3GB RSS
 // می‌رود و کرنل سرور را با OOM-kill می‌کشد → پنل پیش‌نمایش مالک از کار می‌افتد.
 // با این سقف، سرور dev قبل از مرگ کامل ری‌استارت کنترل‌شده می‌کند (کش .next
 // روی دیسک می‌ماند؛ کامپایل بعدی سریع است). در production بی‌اثر است.
 ...(isProd
 ? {}
 : {
 // FIX(v19-stability): سقف 640→1024 — کامپایل صفحات SEO سنگین (cities/[city]
 // با گراف لندینگ + دادهٔ ۳۰۰KB) از سقف ۶۴۰ رد می‌شد و turbopack سرور را
 // می‌کشت؛ با ۱۰۲۴MB (در RAM آزاد ~2.8GB سندباکس) کامپایل کامل و flush کش
 // دیسک انجام می‌شود و بار بعدی از کش (~ms) می‌آید.
 turbopackMemoryLimit: 1024,
 // FIX(22-D): کش فایل‌سیستم دوباره فعال شد — با کشِ خاموش، هر ری‌استارت
 // (که خودش نتیجهٔ OOM بود) کامپایلِ از-صفرِ «/» + ماژول‌های سنگین را داشت
 // و چرخهٔ بی‌پایان OOM می‌ساخت. با کش دیسک، کامپایل یک‌بار سنگین است و
 // پس از آن لود از دیسک (~کم‌حافظه) انجام می‌شود.
 turbopackFileSystemCacheForDev: true,
 }),
 // optimizePackageImports باعث tree-shaking بهتر و bundle کوچک‌تر می‌شود
 optimizePackageImports: [
 "lucide-react",
 "recharts",
 "date-fns",
 "date-fns-jalali",
 "framer-motion",
 "@radix-ui/react-icons",
 "@tanstack/react-table",
 "@radix-ui/react-dialog",
 "@radix-ui/react-dropdown-menu",
 "@radix-ui/react-select",
 "@radix-ui/react-tabs",
 "@radix-ui/react-tooltip",
 "@radix-ui/react-popover",
 "@radix-ui/react-checkbox",
 "@radix-ui/react-switch",
 "@radix-ui/react-radio-group",
 "@radix-ui/react-accordion",
 "@radix-ui/react-avatar",
 "@radix-ui/react-scroll-area",
 "@radix-ui/react-separator",
 "@radix-ui/react-label",
 "@radix-ui/react-progress",
 "@radix-ui/react-slot",
 "@hookform/resolvers",
 "zod",
 "sonner",
 "cmdk",
 "react-hook-form",
 "zustand",
 "class-variance-authority",
 "clsx",
 "tailwind-merge",
 ],
 // NOTE: experimental.turbo در Next.js 16 پشتیبانی نمی‌شود — حذف شد
 // Turbopack خودکار تنظیمات بهینه را اعمال می‌کند.
 // FIX(v5 — build OOM): محدودکردن worker های static generation به ۱ —
 // در sandbox با RAM 4GB فاز «Collecting page data» با worker های
 // موازی چند‌باره OOM می‌شد (exit 137). با cpus:1 حافظه خطی می‌ماند.
 cpus: 1,
 },
 // بسته‌های سنگین سمت سرور را از bundle کنار بگذار تا build سبک‌تر شود
 // مهم: بسته‌هایی که در optimizePackageImports هستند نباید اینجا باشند (Turbopack conflict)
 // فقط بسته‌هایی که واقعاً سمت سرور استفاده می‌شوند و native/binary هستند
 serverExternalPackages: [
 "@prisma/client",
 "bcryptjs",
 "nodemailer",
 "otplib",
 "web-push",
 "z-ai-web-dev-sdk",
 ],
};

// فقط در production با SENTRY_AUTH_TOKEN فعال می‌شود
async function applySentry(config: NextConfig): Promise<NextConfig> {
 if (isProd && process.env.SENTRY_AUTH_TOKEN) {
 try {
 const { withSentryConfig } = await import("@sentry/nextjs");
 return withSentryConfig(config, {
 silent: true,
 authToken: process.env.SENTRY_AUTH_TOKEN,
 org: process.env.SENTRY_ORG?? "hoshhesab",
 project: process.env.SENTRY_PROJECT?? "hoshhesab-app",
 sourcemaps: { disable: true },
 } as any);
 } catch {
 return config;
 }
 }
 return config;
}

export default applySentry(baseConfig);
