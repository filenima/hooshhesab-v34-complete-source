/* ============================================================================
 * هوش — Service Worker (نسخهٔ ۱) — کار آفلاین PWA
 * ============================================================================
 * استراتژی‌ها (امن حتی در حالت dev):
 *  ▸ ناوبری (صفحات): network-first با مهلت ۵ ثانیه → کش → offline.html
 *  ▸ استاتیک‌ها (/_next/static، آیکون‌ها، فونت‌ها): cache-first (تغییرناپذیرند)
 *  ▸ API: هرگز کش نمی‌شود (دادهٔ مالی زنده است) — فقط خطا → پاسخ JSON آفلاین
 *  ▸ پس از فعال‌شدن: کش‌های قدیمی پاک می‌شوند
 * ============================================================================ */

const VERSION = "hoosh-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;

const PRECACHE = [
  "/offline.html",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** آیا این درخواست یک ناوبری صفحه است؟ */
function isNavigation(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  );
}

/** آیا منبع استاتیکِ تغییرناپذیر است؟ */
function isImmutableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pos-bridge/") ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|css|js|map|webmanifest)$/i.test(
      url.pathname
    )
  );
}

/** fetch با مهلت زمانی */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, ms);
    fetch(request, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // فقط همان مبدا — درخواست‌های خارجی (پل کارتخوان، tgju و...) دست‌نخورده
  if (url.origin !== self.location.origin) return;
  // API هرگز کش نمی‌شود
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              success: false,
              offline: true,
              error: "اتصال اینترنت قطع است — این عملیات پس از وصل‌شدن دوباره تلاش کنید.",
            }),
            { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } }
          )
      )
    );
    return;
  }

  // ناوبری: شبکه اول → کش → offline.html
  if (isNavigation(request)) {
    event.respondWith(
      fetchWithTimeout(request, 5000)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES_CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match("/offline.html");
          return (
            offline ||
            new Response("<h1>آفلاین</h1>", {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          );
        })
    );
    return;
  }

  // استاتیک: کش اول → شبکه (برای دفعات بعد)
  if (isImmutableStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              if (response.ok || response.type === "basic") {
                const copy = response.clone();
                caches
                  .open(STATIC_CACHE)
                  .then((c) => c.put(request, copy))
                  .catch(() => undefined);
              }
              return response;
            })
            .catch(() => cached)
      )
    );
  }
});

/* پیام از کلاینت: دور زدن کش (مثلاً بعد از به‌روزرسانی) */
self.addEventListener("message", (event) => {
  if (event.data === "hoosh-skip-waiting") {
    self.skipWaiting();
  }
});
