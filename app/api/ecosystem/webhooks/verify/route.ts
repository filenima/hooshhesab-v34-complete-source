// /api/ecosystem/webhooks/verify — تأیید امضای HMAC یک درخواست webhook
// هوش — Webhook HMAC Verification
// ----------------------------------------------------------------------------
// این اندپوینت به توسعه‌دهندگان کمک می‌کند تا امضای HMAC-SHA256 ارسالی هوش
// را در سمت کلاینت (گیرنده‌ی webhook) تأیید کنند.
//
// امضا به فرمت زیر در هدر ارسال می‌شود:
// X-Hoosh-Signature: sha256=<hex-digest>
// X-Hoosh-Event: <event-name>
// X-Hoosh-Source: hoshhesab
// X-Hoosh-Service: <service-name>
// X-Hoosh-Delivery: <delivery-id>
//
// برای تأیید در سمت گیرنده:
// 1) بدنه‌ی خام درخواست را بخوانید (raw body)
// 2) هدر X-Hoosh-Signature را استخراج کنید (sha256=<hex>)
// 3) با secret مشترک که هنگام ثبت webhook تنظیم کرده‌اید، HMAC-SHA256 بسازید:
// hmac = createHmac("sha256", secret).update(rawBody).digest("hex")
// 4) مقایسه با hex استخراج‌شده از هدر (با timing-safe comparison)
//
// این اندپوینت برای تست: بدنه + secret می‌گیرد و معتبر بودن را تأیید می‌کند.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";

// ============ POST: تأیید امضا با داده‌ی نمونه ============
// body: { webhookId, rawBody, signature }
// یا
// body: { secret, rawBody, signature }
// برمی‌گرداند: { valid, expectedSignature, receivedSignature }
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 const body = (await req.json().catch(() => ({}))) as {
 webhookId?: string;
 secret?: string;
 rawBody: string;
 signature: string; // به فرمت sha256=<hex> یا فقط <hex>
 };

 if (!body.rawBody ||!body.signature) {
 return NextResponse.json(
 {
 success: false,
 error: "rawBody و signature الزامی است",
 },
 { status: 400 }
 );
 }

 // استخراج secret
 let secret: string | null = body.secret || null;
 if (!secret && body.webhookId) {
 const sub = await db.ecosystemWebhook.findFirst({
 where: { id: body.webhookId, tenantId },
 select: { secret: true, service: true, event: true, url: true },
 });
 if (!sub) {
 return NextResponse.json(
 { success: false, error: "اشتراک webhook یافت نشد" },
 { status: 404 }
 );
 }
 if (!sub.secret) {
 return NextResponse.json(
 {
 success: false,
 error: "این اشتراک webhook secret ندارد — امضا قابل تأیید نیست",
 },
 { status: 400 }
 );
 }
 secret = sub.secret;
 }

 if (!secret) {
 return NextResponse.json(
 { success: false, error: "secret یا webhookId الزامی است" },
 { status: 400 }
 );
 }

 // محاسبه‌ی امضای مورد انتظار
 const expectedSig = createHmac("sha256", secret)
.update(body.rawBody)
.digest("hex");

 // نرمال‌سازی signature دریافتی (حذف پیشوند sha256=)
 const receivedSig = body.signature
.trim()
.replace(/^sha256=/i, "")
.toLowerCase();

 // مقایسه‌ی timing-safe
 let valid = false;
 try {
 const expectedBuf = Buffer.from(expectedSig, "hex");
 const receivedBuf = Buffer.from(receivedSig, "hex");
 if (expectedBuf.length === receivedBuf.length && expectedBuf.length > 0) {
 valid = timingSafeEqual(expectedBuf, receivedBuf);
 }
 } catch {
 valid = false;
 }

 return NextResponse.json({
 success: true,
 valid,
 expectedSignature: expectedSig,
 receivedSignature: receivedSig,
 algorithm: "HMAC-SHA256",
 message: valid
? " امضا معتبر است."
: "امضا نامعتبر است. مطمئن شوید که raw body (نه parsed JSON) را استفاده می‌کنید و secret درست است.",
 hint:
 "نکته: در Express از `req.rawBody` یا middleware `express.json({ verify: (req) => { req.rawBody = req.rawBodyHeader } })` استفاده کنید. در Next.js از `await req.text()` به‌جای `await req.json()` برای گرفتن raw body استفاده کنید.",
 });
 } catch (error) {
 console.error("Webhook verify error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تأیید امضا" },
 { status: 500 }
 );
 }
}

// ============ GET: دریافت مستندات و نمونه‌ی کد ============
export async function GET() {
 const examples = {
 nodejs: `// نمونه Node.js / Express
const crypto = require('crypto');

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
 const signature = req.headers['x-hoshhesab-signature']; // "sha256=<hex>"
 const secret = process.env.HOSH_WEBHOOK_SECRET;

 if (!signature ||!secret) {
 return res.status(401).send('Missing signature or secret');
 }

 const expected = crypto
.createHmac('sha256', secret)
.update(req.body) // raw body
.digest('hex');

 const received = signature.replace(/^sha256=/, '');

 if (expected!== received) {
 return res.status(401).send('Invalid signature');
 }

 // امضا معتبر است — پردازش رویداد
 const event = JSON.parse(req.body);
 console.log('Received event:', event.event);
 res.json({ received: true });
});`,
 nextjs: `// نمونه Next.js Route Handler
import crypto from 'node:crypto';

export async function POST(req: Request) {
 const rawBody = await req.text(); // نه req.json()!
 const signature = req.headers.get('x-hoshhesab-signature') || '';
 const secret = process.env.HOSH_WEBHOOK_SECRET!;

 const expected = crypto
.createHmac('sha256', secret)
.update(rawBody)
.digest('hex');

 const received = signature.replace(/^sha256=/, '');

 if (expected!== received) {
 return Response.json({ error: 'Invalid signature' }, { status: 401 });
 }

 const event = JSON.parse(rawBody);
 // پردازش رویداد
 return Response.json({ received: true });
}`,
 python: `# نمونه Python / Flask
import hmac, hashlib
from flask import Flask, request

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
 raw_body = request.get_data() # نه request.json!
 signature = request.headers.get('X-Hoosh-Signature', '')
 secret = os.environ['HOSH_WEBHOOK_SECRET']

 expected = hmac.new(
 secret.encode(),
 raw_body,
 hashlib.sha256
 ).hexdigest()

 received = signature.replace('sha256=', '')

 if not hmac.compare_digest(expected, received):
 return 'Invalid signature', 401

 event = json.loads(raw_body)
 # پردازش رویداد
 return {'received': True}, 200`,
 php: `<?php
// نمونه PHP
$raw_body = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HOSH_SIGNATURE']?? '';
$secret = getenv('HOSH_WEBHOOK_SECRET');

$expected = hash_hmac('sha256', $raw_body, $secret);
$received = preg_replace('/^sha256=/i', '', $signature);

if (!hash_equals($expected, $received)) {
 http_response_code(401);
 echo 'Invalid signature';
 exit;
}

$event = json_decode($raw_body, true);
// پردازش رویداد
echo json_encode(['received' => true]);`,
 };

 return NextResponse.json({
 success: true,
 endpoint: "/api/ecosystem/webhooks/verify",
 algorithm: "HMAC-SHA256",
 headers: {
 "X-Hoosh-Signature": "sha256=<hex-digest>",
 "X-Hoosh-Event": "<event-name>",
 "X-Hoosh-Source": "hoshhesab",
 "X-Hoosh-Service": "<NOBATIME|CATALOG|HESABYAR>",
 "X-Hoosh-Delivery": "<unique-delivery-id>",
 },
 bodyFormat: {
 event: "نام رویداد (مثلاً invoice_created)",
 tenantId: "شناسه‌ی tenant",
 timestamp: "ISO 8601",
 data: "داده‌ی رویداد (متفاوت برای هر event)",
 },
 verificationSteps: [
 "۱) بدنه‌ی خام (raw body) درخواست را بخوانید",
 "۲) هدر X-Hoosh-Signature را استخراج کنید",
 "۳) پیشوند sha256= را حذف کنید",
 "۴) با secret مشترک، HMAC-SHA256 بسازید",
 "۵) مقایسه‌ی timing-safe با مقدار دریافتی انجام دهید",
 ],
 examples,
 notes: [
 "همیشه از raw body استفاده کنید، نه از parsed JSON. ترتیب کلیدها در JSON ممکن است متفاوت باشد.",
 "از مقایسه‌ی timing-safe (مثل crypto.timingSafeEqual یا hmac.compare_digest) استفاده کنید تا از حملات timing جلوگیری شود.",
 "secret را در متغیرهای محیطی ذخیره کنید، نه در کد.",
 "اگر امضا نامعتبر بود، بلافاصله با 401 پاسخ دهید و رویداد را پردازش نکنید.",
 ],
 });
}
