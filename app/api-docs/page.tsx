/**
 * صفحه‌ی مستندات API (Swagger UI) برای هوش
 * مسیر: /api-docs
 * یک Swagger UI سبک بدون وابستگی به پکیج خارجی — مستقیم از CDN swagger-ui
 * و spec را از /api/open-api بارگذاری می‌کند.
 */
import type { Metadata } from 'next';
import { getBrandName, interpolateBrand } from '@/lib/brand-interpolate';

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 return {
  // نکته سئو: بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
  title: 'مستندات API',
  description: interpolateBrand('Swagger UI برای API عمومی هوش — OpenAPI 3.1', brand),
 };
}

export default async function ApiDocsPage() {
 const brand = await getBrandName();
 const swaggerHtml = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
 <meta charset="utf-8" />
 <meta name="viewport" content="width=device-width,initial-scale=1" />
 <title>مستندات API | هوش</title>
 <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
 <style>
 body { margin: 0; font-family: Vazirmatn, system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; background: #f8fafc; }
.topbar { background: #4f46e5; color: #fff; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
.topbar h1 { font-size: 18px; font-weight: 700; margin: 0; }
.topbar a { color: #e0e7ff; margin-inline-start: auto; text-decoration: none; font-size: 13px; }
.swagger-ui { max-width: 1200px; margin: 0 auto; background: #fff; min-height: calc(100vh - 56px); }
.swagger-ui.info { direction: rtl; }
 </style>
</head>
<body>
 <div class="topbar">
 <h1>مستندات API هوش</h1>
 <a href="/">بازگشت به اپلیکیشن </a>
 </div>
 <div id="swagger-ui"></div>
 <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
 <script>
 window.onload = () => {
 window.ui = SwaggerUIBundle({
 url: '/api/open-api',
 dom_id: '#swagger-ui',
 deepLinking: true,
 presets: [SwaggerUIBundle.presets.apis],
 layout: 'BaseLayout',
 docExpansion: 'list',
 defaultModelsExpandDepth: 1,
 persistAuthorization: true,
 requestSnippetsEnabled: true,
 });
 };
 </script>
</body>
</html>`;

 return (
 <div
 className="min-h-screen bg-slate-50"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(swaggerHtml, brand) }}
 />
 );
}
