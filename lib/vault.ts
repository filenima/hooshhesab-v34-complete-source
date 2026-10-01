/**
 * vault.ts — HashiCorp Vault client برای مدیریت اسرار هوش
 * قابلیت‌ها: secret retrieval, dynamic credentials, lease renewal, caching
 */

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault.hesab-system.svc:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN || process.env.VAULT_APPROLE_TOKEN || '';
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || 'hesab';

// ---------- cache در حافظه ----------
interface CacheEntry {
 value: unknown;
 leaseId?: string;
 leaseDuration: number;
 retrievedAt: number;
}

const secretCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // یک دقیقه — برای کاهش load روی Vault

// ---------- token management ----------
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAppRoleToken(): Promise<string> {
 if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;
 const roleId = process.env.VAULT_ROLE_ID;
 const secretId = process.env.VAULT_SECRET_ID;
 if (!roleId ||!secretId) {
 // fallback به static token
 if (VAULT_TOKEN) return VAULT_TOKEN;
 throw new Error('Vault credentials missing: set VAULT_ROLE_ID/VAULT_SECRET_ID or VAULT_TOKEN');
 }
 const resp = await fetch(`${VAULT_ADDR}/v1/auth/approle/login`, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
 });
 if (!resp.ok) throw new Error(`Vault approle login failed: ${resp.status}`);
 const data = await resp.json() as { auth: { client_token: string; lease_duration: number } };
 cachedToken = data.auth.client_token;
 tokenExpiry = Date.now() + data.auth.lease_duration * 1000;
 return cachedToken;
}

// ---------- read secret ----------
// نکته: اگر Vault در دسترس نباشد، به‌صورت fallback به متغیر محیطی مرتبط رجوع می‌کند.
// نگاشت path env: «secret/data/foo/bar» FOO_BAR (حروف بزرگ، نقطه‌ی آخر).
function pathToEnvKey(path: string, field?: string): string {
 const tail = path.split('/').filter(Boolean).pop() || path;
 const base = tail.toUpperCase().replace(/[^A-Z0-9]/g, '_');
 return field? `${base}_${field.toUpperCase()}`: base;
}

export async function getSecret<T = unknown>(path: string, field?: string): Promise<T | undefined> {
 const cached = secretCache.get(path);
 if (cached && Date.now() - cached.retrievedAt < CACHE_TTL_MS) {
 if (cached.leaseDuration === 0 || Date.now() - cached.retrievedAt < cached.leaseDuration * 1000) {
 const data = cached.value as Record<string, unknown>;
 return field? (data[field] as T): (data as T);
 }
 }

 // اگر Vault پیکربندی نشده، به env fallback بزن
 if (!VAULT_TOKEN &&!process.env.VAULT_ROLE_ID) {
 const envKey = pathToEnvKey(path, field);
 const envVal = process.env[envKey];
 if (envVal!== undefined) {
 // تلاش برای parse به JSON، در غیر این‌صورت رشته
 try { return JSON.parse(envVal) as T; } catch { return envVal as unknown as T; }
 }
 return undefined;
 }

 const token = await getAppRoleToken();
 const resp = await fetch(`${VAULT_ADDR}/v1/${path}`, {
 headers: {
 'X-Vault-Token': token,
 'X-Vault-Namespace': VAULT_NAMESPACE,
 },
 });

 if (resp.status === 404) {
 // fallback به env در صورت نبودن در Vault
 const envKey = pathToEnvKey(path, field);
 const envVal = process.env[envKey];
 if (envVal!== undefined) {
 try { return JSON.parse(envVal) as T; } catch { return envVal as unknown as T; }
 }
 return undefined;
 }
 if (!resp.ok) throw new Error(`Vault read failed: ${resp.status} ${await resp.text()}`);

 const body = await resp.json() as {
 data?: { data?: Record<string, unknown> } | Record<string, unknown>;
 lease_id?: string;
 lease_duration?: number;
 };

 // پشتیبانی از KV v2 (data.data) و KV v1 (data)
 const inner = body.data?.data?? body.data?? {};
 secretCache.set(path, {
 value: inner,
 leaseId: body.lease_id,
 leaseDuration: body.lease_duration || 0,
 retrievedAt: Date.now(),
 });

 return field? (inner[field] as T): (inner as T);
}

// ---------- write secret ----------
export async function putSecret(path: string, data: Record<string, unknown>): Promise<void> {
 const token = await getAppRoleToken();
 // KV v2 به پوشه‌ی data نیاز دارد
 const isV2 =!path.includes('/data/');
 const fullPath = isV2? path.replace(/^secret\//, 'secret/data/'): path;
 const body = isV2? { data }: data;

 const resp = await fetch(`${VAULT_ADDR}/v1/${fullPath}`, {
 method: isV2? 'POST': 'PUT',
 headers: {
 'X-Vault-Token': token,
 'X-Vault-Namespace': VAULT_NAMESPACE,
 'content-type': 'application/json',
 },
 body: JSON.stringify(body),
 });
 if (!resp.ok) throw new Error(`Vault write failed: ${resp.status}`);
 secretCache.delete(path);
}

// ---------- dynamic database credentials ----------
export interface DbCredentials {
 username: string;
 password: string;
 leaseId: string;
 leaseDuration: number;
}

export async function getDbCredentials(role: string = 'hesab-app'): Promise<DbCredentials> {
 const cached = secretCache.get(`db:${role}`);
 if (cached && Date.now() - cached.retrievedAt < cached.leaseDuration * 1000 * 0.8) {
 return cached.value as DbCredentials;
 }

 const token = await getAppRoleToken();
 const resp = await fetch(`${VAULT_ADDR}/v1/database/creds/${role}`, {
 method: 'POST',
 headers: {
 'X-Vault-Token': token,
 'X-Vault-Namespace': VAULT_NAMESPACE,
 },
 });
 if (!resp.ok) throw new Error(`Vault db creds failed: ${resp.status}`);
 const body = await resp.json() as {
 data: { username: string; password: string };
 lease_id: string;
 lease_duration: number;
 };
 const creds: DbCredentials = {
 username: body.data.username,
 password: body.data.password,
 leaseId: body.lease_id,
 leaseDuration: body.lease_duration,
 };
 secretCache.set(`db:${role}`, { value: creds, leaseId: creds.leaseId, leaseDuration: creds.leaseDuration, retrievedAt: Date.now() });
 return creds;
}

// ---------- renew lease ----------
export async function renewLease(leaseId: string): Promise<number> {
 const token = await getAppRoleToken();
 const resp = await fetch(`${VAULT_ADDR}/v1/sys/leases/renew`, {
 method: 'PUT',
 headers: {
 'X-Vault-Token': token,
 'X-Vault-Namespace': VAULT_NAMESPACE,
 'content-type': 'application/json',
 },
 body: JSON.stringify({ lease_id: leaseId }),
 });
 if (!resp.ok) throw new Error(`Vault lease renew failed: ${resp.status}`);
 const body = await resp.json() as { lease_duration: number };
 return body.lease_duration;
}

// ---------- revoke lease ----------
export async function revokeLease(leaseId: string): Promise<void> {
 const token = await getAppRoleToken();
 await fetch(`${VAULT_ADDR}/v1/sys/leases/revoke`, {
 method: 'PUT',
 headers: {
 'X-Vault-Token': token,
 'X-Vault-Namespace': VAULT_NAMESPACE,
 'content-type': 'application/json',
 },
 body: JSON.stringify({ lease_id: leaseId }),
 });
}

// ---------- encrypt/decrypt با Transit Engine ----------
export async function encrypt(plaintext: string, keyName: string = 'hesab-default'): Promise<string> {
 const token = await getAppRoleToken();
 const b64 = Buffer.from(plaintext, 'utf8').toString('base64');
 const resp = await fetch(`${VAULT_ADDR}/v1/transit/encrypt/${keyName}`, {
 method: 'POST',
 headers: {
 'X-Vault-Token': token,
 'X-Vault-Namespace': VAULT_NAMESPACE,
 'content-type': 'application/json',
 },
 body: JSON.stringify({ plaintext: b64 }),
 });
 if (!resp.ok) throw new Error(`Vault encrypt failed: ${resp.status}`);
 const body = await resp.json() as { data: { ciphertext: string } };
 return body.data.ciphertext;
}

export async function decrypt(ciphertext: string, keyName: string = 'hesab-default'): Promise<string> {
 const token = await getAppRoleToken();
 const resp = await fetch(`${VAULT_ADDR}/v1/transit/decrypt/${keyName}`, {
 method: 'POST',
 headers: {
 'X-Vault-Token': token,
 'X-Vault-Namespace': VAULT_NAMESPACE,
 'content-type': 'application/json',
 },
 body: JSON.stringify({ ciphertext }),
 });
 if (!resp.ok) throw new Error(`Vault decrypt failed: ${resp.status}`);
 const body = await resp.json() as { data: { plaintext: string } };
 return Buffer.from(body.data.plaintext, 'base64').toString('utf8');
}

// ---------- helper برای استفاده در Prisma ----------
export async function getDatabaseUrl(): Promise<string> {
 // اگر static database URL موجود است، استفاده کن
 if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
 // در غیر این‌صورت از dynamic creds استفاده کن
 const creds = await getDbCredentials();
 return `postgresql://${creds.username}:${creds.password}@${process.env.DB_HOST || 'postgres.hesab-system.svc'}:5432/hesab?schema=public`;
}

// ---------- عیب‌یابی ----------
export async function vaultHealthCheck(): Promise<{ initialized: boolean; sealed: boolean; version: string }> {
 const resp = await fetch(`${VAULT_ADDR}/v1/sys/health`);
 if (!resp.ok) throw new Error(`Vault unreachable: ${resp.status}`);
 return resp.json();
}

export function clearCache() {
 secretCache.clear();
}

// ---------- alias: setSecret (موجودیت عمومی برای هماهنگی با رابطه‌ی task) ----------
// معادل putSecret با پشتیبانی از fallback به env (در صورت نبود Vault).
export async function setSecret(path: string, data: Record<string, unknown>): Promise<void> {
 if (!VAULT_TOKEN &&!process.env.VAULT_ROLE_ID) {
 // بدون Vault: فقط در cache حافظه نگه می‌داریم تا getSecret بتواند بخواند
 secretCache.set(path, {
 value: data,
 leaseDuration: 0,
 retrievedAt: Date.now(),
 });
 return;
 }
 return putSecret(path, data);
}

// ---------- rotateSecret ----------
// چرخش یک secret: مقدار جدید تولید می‌کند، در Vault ذخیره می‌کند، cache را باطل می‌کند،
// و lease قدیمی را revoke می‌کند. در محیط بدون Vault، فقط cache را refresh می‌کند.
export async function rotateSecret(
 path: string,
 generator?: () => string,
): Promise<{ rotatedAt: number; version: number }> {
 const newValue = generator
? generator()
: `${path.split('/').pop()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

 const previous = secretCache.get(path);
 await setSecret(path, { value: newValue, rotatedAt: Date.now() });

 // revoke lease قبلی اگر وجود داشت و Vault فعال بود
 if (previous?.leaseId && (VAULT_TOKEN || process.env.VAULT_ROLE_ID)) {
 try { await revokeLease(previous.leaseId); } catch { /* خاموش: lease ممکن است منقضی شده باشد */ }
 }

 secretCache.delete(path); // اطمینان از خواندن مقدار جدید در فراخوانی بعدی
 return {
 rotatedAt: Date.now(),
 version: (previous? 2: 1), // نسخه‌بندی ساده بر اساس وجود مقدار قبلی
 };
}
