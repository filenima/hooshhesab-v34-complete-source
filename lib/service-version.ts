/**
 * service-version.ts — مذاکره‌ی نسخه‌ی سرویس برای هوش
 * قابلیت‌ها: نسخه‌بندی API، deprecation، schema evolution، version routing
 */

export interface ServiceVersion {
 service: string;
 version: string; // semantic version: major.minor.patch
 status: 'alpha' | 'beta' | 'stable' | 'deprecated' | 'sunset';
 releasedAt: number;
 sunsetAt?: number;
 changelogUrl?: string;
 breakingChanges?: string[];
}

export interface VersionNegotiationResult {
 matchedVersion: string;
 availableVersions: string[];
 isDeprecated: boolean;
 isSunset: boolean;
 upgradeRecommended?: string;
}

const registry = new Map<string, ServiceVersion[]>();

export function registerVersion(info: ServiceVersion) {
 const versions = registry.get(info.service) || [];
 // حذف نسخه‌ی تکراری
 const idx = versions.findIndex(v => v.version === info.version);
 if (idx >= 0) versions[idx] = info;
 else versions.push(info);
 versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
 registry.set(info.service, versions);
}

export function getVersions(service: string): ServiceVersion[] {
 return registry.get(service) || [];
}

export function getLatestVersion(service: string, onlyStable = true): ServiceVersion | undefined {
 const versions = getVersions(service);
 if (onlyStable) {
 return versions.find(v => v.status === 'stable' || v.status === 'beta');
 }
 return versions[0];
}

export function getVersion(service: string, version: string): ServiceVersion | undefined {
 return getVersions(service).find(v => v.version === version);
}

/**
 * مذاکره‌ی نسخه بر اساس header یا query param
 * اولویت: explicit version > latest stable > latest any
 */
export function negotiateVersion(
 service: string,
 options: {
 headerVersion?: string; // X-API-Version
 acceptHeader?: string; // Accept: application/vnd.hesab.v2+json
 queryVersion?: string; //?v=2
 }
): VersionNegotiationResult {
 const versions = getVersions(service);
 if (versions.length === 0) {
 return {
 matchedVersion: '0.0.0',
 availableVersions: [],
 isDeprecated: false,
 isSunset: false,
 };
 }

 // استخراج نسخه‌ی درخواستی از منابع مختلف
 let requestedVersion: string | undefined =
 options.headerVersion ||
 options.queryVersion ||
 extractVersionFromAccept(options.acceptHeader);

 // اگر نسخه‌ی درخواستی موجود نبود، آخرین stable را انتخاب کن
 let matched: ServiceVersion | undefined;
 if (requestedVersion) {
 // تطبیق با major version
 matched = versions.find(v => v.version.startsWith(requestedVersion!.split('.')[0]));
 if (!matched) {
 matched = versions.find(v => v.version === requestedVersion);
 }
 }
 if (!matched) {
 matched = getLatestVersion(service, true) || versions[0];
 }

 const availableVersions = versions.map(v => v.version);
 const isDeprecated = matched.status === 'deprecated' || matched.status === 'sunset';
 const isSunset = matched.status === 'sunset';

 let upgradeRecommended: string | undefined;
 if (isDeprecated) {
 const stable = versions.find(v => v.status === 'stable' && v.version!== matched!.version);
 if (stable) upgradeRecommended = stable.version;
 }

 return {
 matchedVersion: matched.version,
 availableVersions,
 isDeprecated,
 isSunset,
 upgradeRecommended,
 };
}

function extractVersionFromAccept(accept?: string): string | undefined {
 if (!accept) return undefined;
 const match = accept.match(/vnd\.hesab\.v(\d+)\+json/i);
 return match? match[1]: undefined;
}

/**
 * بررسی compatibility بین دو نسخه
 */
export function isCompatible(
 service: string,
 fromVersion: string,
 toVersion: string
): { compatible: boolean; reason?: string } {
 const from = getVersion(service, fromVersion);
 const to = getVersion(service, toVersion);
 if (!from ||!to) {
 return { compatible: false, reason: 'نسخه پیدا نشد' };
 }
 const [fromMajor] = fromVersion.split('.').map(Number);
 const [toMajor] = toVersion.split('.').map(Number);
 if (fromMajor!== toMajor) {
 return { compatible: false, reason: `تغییر major: ${fromMajor} ${toMajor}` };
 }
 // اگر به نسخه‌ی پایین‌تر می‌رویم
 if (to.version < from.version) {
 return { compatible: true, reason: 'downgrade ممکن است برخی فیلدها را نداشته باشد' };
 }
 return { compatible: true };
}

/**
 * API برای انتقال تدریجی به نسخه‌ی جدید
 */
export interface MigrationPath {
 from: string;
 to: string;
 steps: Array<{ description: string; required: boolean; estimatedEffort: string }>;
}

export function getMigrationPath(service: string, fromVersion: string, toVersion: string): MigrationPath {
 const from = getVersion(service, fromVersion);
 const to = getVersion(service, toVersion);
 const steps: MigrationPath['steps'] = [];

 if (from?.breakingChanges?.length) {
 steps.push({
 description: `بررسی breaking changes نسخه‌ی ${fromVersion}: ${from.breakingChanges.join(', ')}`,
 required: true,
 estimatedEffort: '2-4 ساعت',
 });
 }
 steps.push({ description: 'به‌روزرسانی client SDK به نسخه‌ی جدید', required: true, estimatedEffort: '1-2 ساعت' });
 steps.push({ description: 'اجرای تست‌های regression در محیط staging', required: true, estimatedEffort: '4-8 ساعت' });
 steps.push({ description: 'انتقال تدریجی ترافیک با feature flag (canary 5% 50% 100%)', required: true, estimatedEffort: '3-5 روز' });
 steps.push({ description: 'مانیتورینگ خطاها و metric‌ها در طول انتقال', required: true, estimatedEffort: 'مداوم' });
 if (to?.status === 'deprecated') {
 steps.push({ description: 'برنامه‌ریزی برای انتقال مجدد پس از deprecation', required: false, estimatedEffort: '1 ساعت' });
 }

 return { from: fromVersion, to: toVersion, steps };
}

// ---------- ثبت نسخه‌های پیش‌فرض هوش ----------
export function registerDefaultVersions() {
 registerVersion({
 service: 'hesab-api',
 version: '1.0.0',
 status: 'stable',
 releasedAt: new Date('2024-01-01').getTime(),
 changelogUrl: 'https://docs.hesab.ir/changelog/v1',
 });
 registerVersion({
 service: 'hesab-api',
 version: '1.1.0',
 status: 'stable',
 releasedAt: new Date('2024-06-01').getTime(),
 changelogUrl: 'https://docs.hesab.ir/changelog/v1.1',
 });
 registerVersion({
 service: 'hesab-api',
 version: '2.0.0',
 status: 'beta',
 releasedAt: new Date('2025-01-01').getTime(),
 changelogUrl: 'https://docs.hesab.ir/changelog/v2',
 breakingChanges: [
 'تغییر نوع تمام مبالغ از string به integer (ریال)',
 'حذف endpoint قدیمی /api/v1/users /api/v2/parties',
 'تغییر فرمت تاریخ از جلالی به ISO 8601',
 ],
 });
 registerVersion({
 service: 'hesab-api',
 version: '0.9.0',
 status: 'sunset',
 releasedAt: new Date('2023-06-01').getTime(),
 sunsetAt: new Date('2025-06-01').getTime(),
 changelogUrl: 'https://docs.hesab.ir/changelog/v0.9',
 });
 registerVersion({
 service: 'hesab-grpc',
 version: '1.0.0',
 status: 'stable',
 releasedAt: new Date('2024-09-01').getTime(),
 });
}

// ---------- helper برای استفاده در middleware ----------
export function versionHeaders(result: VersionNegotiationResult): Record<string, string> {
 return {
 'X-API-Version': result.matchedVersion,
 'X-API-Available-Versions': result.availableVersions.join(','),
...(result.isDeprecated? { 'Sunset': new Date(Date.now() + 90 * 86400_000).toUTCString() }: {}),
...(result.upgradeRecommended? { 'X-API-Upgrade-To': result.upgradeRecommended }: {}),
 };
}
