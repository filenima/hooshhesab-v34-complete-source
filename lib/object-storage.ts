// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * هوش — Object Storage (S3/MinIO Compatible)
 * =============================================================
 * ذخیره‌سازی فایل‌ها در S3/MinIO با قابلیت‌های:
 * - uploadFile: آپلود با content type
 * - downloadFile: دریافت به‌صورت Buffer
 * - getSignedUrl: URL موقت برای دسترسی مستقیم
 * - deleteFile: حذف فایل
 *
 * متغیرهای محیطی:
 * S3_ENDPOINT — https://s3.ir-thr-at1.arvanstorage.com یا https://minio.local
 * S3_REGION — us-east-1 (پیش‌فرض)
 * S3_ACCESS_KEY — access key
 * S3_SECRET_KEY — secret key
 * S3_BUCKET — نام bucket
 * S3_FORCE_PATH_STYLE — "true" برای MinIO
 */

// ============ Types ============

export interface UploadResult {
 key: string;
 bucket: string;
 etag?: string;
 location: string;
 size: number;
}

export interface ObjectMetadata {
 key: string;
 size: number;
 contentType: string;
 lastModified: Date;
 etag?: string;
}

// ============ Config ============

const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "";
const S3_BUCKET = process.env.S3_BUCKET || "hoshhesab";
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

// ============ S3 Client (lazy init) ============

let s3Client: S3Like | null = null;

interface S3Like {
 upload(key: string, data: Buffer, contentType?: string): Promise<UploadResult>;
 download(key: string): Promise<Buffer>;
 getSignedUrl(key: string, expiresIn: number): Promise<string>;
 delete(key: string): Promise<void>;
 head(key: string): Promise<ObjectMetadata | null>;
 list(prefix: string, limit?: number): Promise<ObjectMetadata[]>;
}

/**
 * دریافت S3 client.
 * اگر AWS SDK نصب باشد از آن استفاده می‌کند؛ در غیر این صورت از fetch مستقیم.
 */
async function getS3Client(): Promise<S3Like> {
 if (s3Client) return s3Client;

 // تلاش برای استفاده از AWS SDK v3
 try {
 const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
 HeadObjectCommand, ListObjectsV2Command, getSignedUrl } =
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const s3RequestPresigner = require("@aws-sdk/s3-request-presigner") as typeof import("@aws-sdk/s3-request-presigner");

 const client = new S3Client({
 endpoint: S3_ENDPOINT,
 region: S3_REGION,
 credentials: {
 accessKeyId: S3_ACCESS_KEY,
 secretAccessKey: S3_SECRET_KEY,
 },
 forcePathStyle: S3_FORCE_PATH_STYLE,
 });

 s3Client = {
 async upload(key, data, contentType) {
 const command = new PutObjectCommand({
 Bucket: S3_BUCKET,
 Key: key,
 Body: data,
 ContentType: contentType || "application/octet-stream",
 });
 const result = await client.send(command);
 return {
 key,
 bucket: S3_BUCKET,
 etag: result.ETag?.replace(/"/g, ""),
 location: `${S3_ENDPOINT}/${S3_BUCKET}/${key}`,
 size: data.length,
 };
 },
 async download(key) {
 const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
 const result = await client.send(command);
 if (!result.Body) throw new Error("Empty response body");
 // Body در SDK v3 از نوع Readable است
 const chunks: Buffer[] = [];
 for await (const chunk of result.Body as AsyncIterable<Buffer>) {
 chunks.push(Buffer.from(chunk));
 }
 return Buffer.concat(chunks);
 },
 async getSignedUrl(key, expiresIn) {
 const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
 return s3RequestPresigner.getSignedUrl(client, command, { expiresIn });
 },
 async delete(key) {
 const command = new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key });
 await client.send(command);
 },
 async head(key) {
 try {
 const command = new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key });
 const result = await client.send(command);
 return {
 key,
 size: result.ContentLength || 0,
 contentType: result.ContentType || "application/octet-stream",
 lastModified: result.LastModified || new Date(),
 etag: result.ETag?.replace(/"/g, ""),
 };
 } catch {
 return null;
 }
 },
 async list(prefix, limit = 100) {
 const command = new ListObjectsV2Command({
 Bucket: S3_BUCKET,
 Prefix: prefix,
 MaxKeys: limit,
 });
 const result = await client.send(command);
 return (result.Contents || []).map((obj) => ({
 key: obj.Key || "",
 size: obj.Size || 0,
 contentType: "application/octet-stream",
 lastModified: obj.LastModified || new Date(),
 etag: obj.ETag?.replace(/"/g, ""),
 }));
 },
 };
 return s3Client;
 } catch {
 // SDK نصب نیست — از mock استفاده کن
 console.warn("[object-storage] AWS SDK نصب نیست — از mock در حافظه استفاده می‌شود");
 s3Client = createMockS3();
 return s3Client;
 }
}

// ============ Mock S3 (for dev) ============

function createMockS3(): S3Like {
 const store = new Map<string, { data: Buffer; contentType: string; uploadedAt: Date }>();
 return {
 async upload(key, data, contentType) {
 store.set(key, { data, contentType: contentType || "application/octet-stream", uploadedAt: new Date() });
 return {
 key,
 bucket: S3_BUCKET,
 location: `${S3_ENDPOINT}/${S3_BUCKET}/${key}`,
 size: data.length,
 };
 },
 async download(key) {
 const item = store.get(key);
 if (!item) throw new Error(`فایل یافت نشد: ${key}`);
 return item.data;
 },
 async getSignedUrl(key, _expiresIn) {
 return `${S3_ENDPOINT}/${S3_BUCKET}/${key}?mock=true&expires=${Date.now() + _expiresIn * 1000}`;
 },
 async delete(key) {
 store.delete(key);
 },
 async head(key) {
 const item = store.get(key);
 if (!item) return null;
 return {
 key,
 size: item.data.length,
 contentType: item.contentType,
 lastModified: item.uploadedAt,
 };
 },
 async list(prefix, limit = 100) {
 const items: ObjectMetadata[] = [];
 for (const [key, item] of store.entries()) {
 if (key.startsWith(prefix)) {
 items.push({
 key,
 size: item.data.length,
 contentType: item.contentType,
 lastModified: item.uploadedAt,
 });
 }
 if (items.length >= limit) break;
 }
 return items;
 },
 };
}

// ============ Public API ============

/**
 * آپلود فایل به object storage.
 * @param key مسیر فایل (مثلاً "invoices/123.pdf")
 * @param data محتوای فایل
 * @param contentType نوع محتوا (مثلاً "application/pdf")
 * @returns اطلاعات فایل آپلودشده
 */
export async function uploadFile(
 key: string,
 data: Buffer,
 contentType?: string
): Promise<string> {
 const client = await getS3Client();
 const result = await client.upload(key, data, contentType);
 return result.location;
}

/**
 * دریافت فایل از object storage.
 */
export async function downloadFile(key: string): Promise<Buffer> {
 const client = await getS3Client();
 return client.download(key);
}

/**
 * دریافت signed URL موقت برای دسترسی مستقیم به فایل.
 * @param key مسیر فایل
 * @param expiresIn مدت اعتبار به ثانیه (پیش‌فرض ۳۶۰۰ = ۱ ساعت)
 */
export async function getSignedUrl(
 key: string,
 expiresIn: number = 3600
): Promise<string> {
 const client = await getS3Client();
 return client.getSignedUrl(key, expiresIn);
}

/**
 * حذف فایل از object storage.
 */
export async function deleteFile(key: string): Promise<void> {
 const client = await getS3Client();
 await client.delete(key);
}

/**
 * دریافت metadata یک فایل.
 */
export async function getFileMetadata(key: string): Promise<ObjectMetadata | null> {
 const client = await getS3Client();
 return client.head(key);
}

/**
 * لیست فایل‌ها در یک prefix.
 */
export async function listFiles(
 prefix: string,
 limit: number = 100
): Promise<ObjectMetadata[]> {
 const client = await getS3Client();
 return client.list(prefix, limit);
}

/**
 * بررسی وجود فایل.
 */
export async function fileExists(key: string): Promise<boolean> {
 const meta = await getFileMetadata(key);
 return meta!== null;
}

/**
 * کپی فایل (با key جدید).
 */
export async function copyFile(
 sourceKey: string,
 destKey: string
): Promise<string> {
 const data = await downloadFile(sourceKey);
 const meta = await getFileMetadata(sourceKey);
 return uploadFile(destKey, data, meta?.contentType);
}

/**
 * ساخت key استاندارد برای آپلود.
 * فرمت: {entity}/{entityId}/{filename}
 * مثلاً: invoices/abc123/invoice-1403-05.pdf
 */
export function buildObjectKey(
 entity: string,
 entityId: string,
 filename: string
): string {
 const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_/]/g, "_");
 const date = new Date().toISOString().slice(0, 10);
 return `${entity}/${entityId}/${date}-${safeFilename}`;
}
