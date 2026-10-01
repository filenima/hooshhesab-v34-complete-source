// ============ Social Media Auto-Poster ============
// ارسال خودکار محتوا به شبکه‌های اجتماعی — Telegram Bot API و Instagram Graph API.
//
// متغیرهای محیطی:
// TELEGRAM_BOT_TOKEN — توکن ربات تلگرام از @BotFather
// TELEGRAM_CHANNEL_ID — شناسه کانال مقصد (مثلاً @hoshhesab یا -1001234567890)
// INSTAGRAM_ACCESS_TOKEN — توکن دسترسی Instagram Graph API
// INSTAGRAM_ACCOUNT_ID — شناسه حساب اینستاگرام تجاری
//
// اگر متغیرها تنظیم نشده باشند، عملیات به‌صورت mock شبیه‌سازی می‌شود.

// ============ types ============
export interface SocialPostResult {
 platform: "telegram" | "instagram";
 success: boolean;
 postId?: string;
 messageUrl?: string;
 mock: boolean;
 error?: string;
 scheduledAt?: string;
}

export interface SocialPost {
 message: string;
 imageUrl?: string;
 link?: string;
 caption?: string;
}

// ============ Telegram ============
/**
 * ارسال پیام متنی به یک کانال تلگرام با Bot API.
 *
 * @param channelId شناسه کانال (مثلاً @hoshhesab یا -1001234567890)
 * @param message متن پیام (می‌تواند شامل Markdown ساده باشد)
 */
export async function postToTelegram(
 channelId: string,
 message: string
): Promise<SocialPostResult> {
 const botToken = process.env.TELEGRAM_BOT_TOKEN;
 const targetChannel = channelId || process.env.TELEGRAM_CHANNEL_ID;

 if (!targetChannel) {
 return {
 platform: "telegram",
 success: false,
 mock: true,
 error: "شناسه کانال تلگرام تنظیم نشده است",
 };
 }

 // اگر توکن ربات موجود نیست mock
 if (!botToken) {
 console.warn("[social-poster] TELEGRAM_BOT_TOKEN not set — mocking Telegram post");
 return {
 platform: "telegram",
 success: true,
 postId: `mock-tg-${Date.now()}`,
 messageUrl: `https://t.me/${targetChannel.replace("@", "")}/${Math.floor(Math.random() * 1000)}`,
 mock: true,
 };
 }

 try {
 const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
 const res = await fetch(url, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 chat_id: targetChannel,
 text: message,
 parse_mode: "HTML",
 disable_web_page_preview: false,
 }),
 signal: AbortSignal.timeout(10000),
 });

 const json = (await res.json()) as {
 ok?: boolean;
 result?: { message_id?: number; chat?: { username?: string } };
 description?: string;
 };

 if (!res.ok ||!json.ok) {
 return {
 platform: "telegram",
 success: false,
 mock: false,
 error: json.description || `HTTP ${res.status}`,
 };
 }

 const msgId = json.result?.message_id;
 const chatUsername = json.result?.chat?.username;
 const messageUrl = chatUsername
? `https://t.me/${chatUsername}/${msgId}`
: undefined;

 return {
 platform: "telegram",
 success: true,
 postId: String(msgId || `tg-${Date.now()}`),
 messageUrl,
 mock: false,
 };
 } catch (err) {
 return {
 platform: "telegram",
 success: false,
 mock: false,
 error: err instanceof Error? err.message: "network error",
 };
 }
}

// ============ Instagram ============
/**
 * ارسال تصویر + کپشن به Instagram با Graph API.
 *
 * توجه: Instagram Graph API نیاز به تصویر URL عمومی دارد (نه base64).
 * این تابع mock است چون نیاز به authorization پیچیده Instagram دارد.
 *
 * @param accountId شناسه حساب اینستاگرام تجاری
 * @param imageUrl URL عمومی تصویر
 * @param caption کپشن پست
 */
export async function postToInstagram(
 accountId: string,
 imageUrl: string,
 caption: string
): Promise<SocialPostResult> {
 const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
 const targetAccount = accountId || process.env.INSTAGRAM_ACCOUNT_ID;

 if (!targetAccount) {
 return {
 platform: "instagram",
 success: false,
 mock: true,
 error: "شناسه حساب اینستاگرام تنظیم نشده است",
 };
 }

 if (!accessToken ||!imageUrl) {
 console.warn("[social-poster] INSTAGRAM_ACCESS_TOKEN or imageUrl missing — mocking Instagram post");
 return {
 platform: "instagram",
 success: true,
 postId: `mock-ig-${Date.now()}`,
 messageUrl: `https://www.instagram.com/p/mock_${Math.random().toString(36).slice(2, 8)}/`,
 mock: true,
 };
 }

 try {
 // مرحله ۱: ایجاد media container
 const createUrl = `https://graph.facebook.com/v18.0/${targetAccount}/media`;
 const createRes = await fetch(createUrl, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 image_url: imageUrl,
 caption,
 access_token: accessToken,
 }),
 signal: AbortSignal.timeout(15000),
 });
 const createJson = (await createRes.json()) as { id?: string; error?: { message?: string } };
 if (!createRes.ok ||!createJson.id) {
 return {
 platform: "instagram",
 success: false,
 mock: false,
 error: createJson.error?.message || `HTTP ${createRes.status}`,
 };
 }

 // مرحله ۲: انتشار media
 const publishUrl = `https://graph.facebook.com/v18.0/${targetAccount}/media_publish`;
 const publishRes = await fetch(publishUrl, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 creation_id: createJson.id,
 access_token: accessToken,
 }),
 signal: AbortSignal.timeout(15000),
 });
 const publishJson = (await publishRes.json()) as { id?: string; error?: { message?: string } };
 if (!publishRes.ok ||!publishJson.id) {
 return {
 platform: "instagram",
 success: false,
 mock: false,
 error: publishJson.error?.message || `HTTP ${publishRes.status}`,
 };
 }

 return {
 platform: "instagram",
 success: true,
 postId: publishJson.id,
 messageUrl: `https://www.instagram.com/p/${publishJson.id}/`,
 mock: false,
 };
 } catch (err) {
 return {
 platform: "instagram",
 success: false,
 mock: false,
 error: err instanceof Error? err.message: "network error",
 };
 }
}

// ============ Multi-platform post ============
/**
 * ارسال همزمان به چند پلتفرم (Telegram + Instagram).
 */
export async function postToAll(
 post: SocialPost,
 targets: { telegramChannel?: string; instagramAccount?: string }
): Promise<{ results: SocialPostResult[]; successCount: number; failureCount: number }> {
 const results: SocialPostResult[] = [];

 if (targets.telegramChannel) {
 const tgMessage = post.link
? `${post.message}\n\n${post.link}`
: post.message;
 results.push(await postToTelegram(targets.telegramChannel, tgMessage));
 }

 if (targets.instagramAccount && post.imageUrl) {
 const caption = post.caption || post.message;
 results.push(
 await postToInstagram(targets.instagramAccount, post.imageUrl, caption)
 );
 }

 const successCount = results.filter((r) => r.success).length;
 const failureCount = results.length - successCount;

 return { results, successCount, failureCount };
}
