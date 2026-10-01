// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * vuln-mgmt.ts — Vulnerability Management برای هوش
 * اسکن، ردیابی، رتبه‌بندی، و مدیریت رفع آسیب‌پذیری‌ها
 */

export type VulnSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type VulnStatus = 'open' | 'in_progress' | 'remediated' | 'accepted_risk' | 'false_positive';

export interface Vulnerability {
 id: string;
 cveId?: string;
 title: string;
 description: string;
 severity: VulnSeverity;
 cvssScore: number; // 0..10
 cvssVector?: string;
 cweId?: string;
 affectedResource: string; // نام سرویس/بسته
 affectedVersion: string;
 fixedVersion?: string;
 status: VulnStatus;
 discoveredAt: number;
 remediatedAt?: number;
 discoveredBy: string; // scanner name
 references: string[];
 exploitAvailable: boolean;
 patchAvailable: boolean;
 // metadata
 assignedTo?: string;
 dueDate?: number;
 tags: string[];
 evidence?: string;
}

export interface Scanner {
 id: string;
 name: string;
 type: 'sast' | 'dast' | 'sca' | 'container' | 'infrastructure' | 'network';
 enabled: boolean;
 lastScan?: number;
 scanInterval: number; // ساعت
 config: Record<string, unknown>;
}

export interface ScanResult {
 id: string;
 scannerId: string;
 startedAt: number;
 finishedAt?: number;
 status: 'running' | 'success' | 'failed';
 vulnerabilitiesFound: number;
 newVulnerabilities: number;
 targets: string[];
}

// ---------- state ----------
const vulnerabilities = new Map<string, Vulnerability>();
const scanners = new Map<string, Scanner>();
const scanResults: ScanResult[] = [];
const MAX_RESULTS = 1000;

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- vulnerability management ----------
export function addVulnerability(vuln: Omit<Vulnerability, 'id' | 'discoveredAt' | 'status'>): Vulnerability {
 const v: Vulnerability = {
...vuln,
 id: vuln.cveId || nextId('vuln'),
 discoveredAt: Date.now(),
 status: 'open',
 };
 // اگر با همان id وجود دارد، به‌روزرسانی کن
 if (vulnerabilities.has(v.id)) {
 const existing = vulnerabilities.get(v.id)!;
 Object.assign(existing, vuln);
 vulnerabilities.set(v.id, existing);
 return existing;
 }
 vulnerabilities.set(v.id, v);
 return v;
}

export function getVulnerability(id: string): Vulnerability | undefined {
 return vulnerabilities.get(id);
}

export function updateVulnerability(id: string, updates: Partial<Vulnerability>): Vulnerability | null {
 const v = vulnerabilities.get(id);
 if (!v) return null;
 Object.assign(v, updates);
 if (updates.status === 'remediated' &&!v.remediatedAt) {
 v.remediatedAt = Date.now();
 }
 vulnerabilities.set(id, v);
 return v;
}

export function listVulnerabilities(filter?: {
 severity?: VulnSeverity;
 status?: VulnStatus;
 assignedTo?: string;
 resource?: string;
}): Vulnerability[] {
 let result = Array.from(vulnerabilities.values());
 if (filter?.severity) result = result.filter(v => v.severity === filter.severity);
 if (filter?.status) result = result.filter(v => v.status === filter.status);
 if (filter?.assignedTo) result = result.filter(v => v.assignedTo === filter.assignedTo);
 if (filter?.resource) result = result.filter(v => v.affectedResource.includes(filter.resource!));
 result.sort((a, b) => b.cvssScore - a.cvssScore);
 return result;
}

export function deleteVulnerability(id: string): boolean {
 return vulnerabilities.delete(id);
}

// ---------- scanners ----------
export function registerScanner(scanner: Omit<Scanner, 'lastScan'>): Scanner {
 const s: Scanner = {...scanner, lastScan: undefined };
 scanners.set(s.id, s);
 return s;
}

export function listScanners(): Scanner[] {
 return Array.from(scanners.values());
}

export async function runScan(scannerId: string, targets: string[]): Promise<ScanResult> {
 const scanner = scanners.get(scannerId);
 if (!scanner) throw new Error(`Scanner ${scannerId} not found`);
 const result: ScanResult = {
 id: nextId('scan'),
 scannerId,
 startedAt: Date.now(),
 status: 'running',
 vulnerabilitiesFound: 0,
 newVulnerabilities: 0,
 targets,
 };
 scanResults.push(result);
 if (scanResults.length > MAX_RESULTS) scanResults.shift();

 // شبیه‌سازی اسکن
 try {
 const found = await simulateScan(scanner, targets);
 result.vulnerabilitiesFound = found.length;
 for (const v of found) {
 const existing = vulnerabilities.get(v.id);
 if (!existing) result.newVulnerabilities++;
 addVulnerability(v);
 }
 result.status = 'success';
 result.finishedAt = Date.now();
 scanner.lastScan = Date.now();
 scanners.set(scannerId, scanner);
 } catch (e) {
 result.status = 'failed';
 result.finishedAt = Date.now();
 console.error(`[vuln-mgmt] scan failed:`, e);
 }
 return result;
}

async function simulateScan(scanner: Scanner, targets: string[]): Promise<Omit<Vulnerability, 'id' | 'discoveredAt' | 'status'>[]> {
 // در عمل: فراخوانی scanner واقعی
 // برای demo: تولید آسیب‌پذیری‌های نمونه بر اساس نوع scanner
 const found: Omit<Vulnerability, 'id' | 'discoveredAt' | 'status'>[] = [];
 if (scanner.type === 'sca') {
 found.push({
 cveId: 'CVE-2024-1234',
 title: 'lodash Prototype Pollution',
 description: 'آسیب‌پذیری prototype pollution در lodash نسخه‌ی قدیمی',
 severity: 'high',
 cvssScore: 7.5,
 cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
 cweId: 'CWE-1321',
 affectedResource: targets[0] || 'app',
 affectedVersion: '4.17.20',
 fixedVersion: '4.17.21',
 discoveredBy: scanner.name,
 references: ['https://nvd.nist.gov/vuln/detail/CVE-2024-1234'],
 exploitAvailable: true,
 patchAvailable: true,
 tags: ['dependency', 'npm'],
 });
 } else if (scanner.type === 'container') {
 found.push({
 cveId: 'CVE-2024-5678',
 title: 'OpenSSL Buffer Overflow',
 description: 'سرریز بافر در OpenSSL نسخه‌ی قدیمی در تصویر container',
 severity: 'critical',
 cvssScore: 9.8,
 cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
 cweId: 'CWE-120',
 affectedResource: 'hesab-hosh:latest',
 affectedVersion: 'openssl-3.0.7',
 fixedVersion: 'openssl-3.0.12',
 discoveredBy: scanner.name,
 references: [],
 exploitAvailable: false,
 patchAvailable: true,
 tags: ['container', 'base-image'],
 });
 } else if (scanner.type === 'dast') {
 found.push({
 title: 'XSS در فرم جستجو',
 description: 'آسیب‌پذیری Cross-Site Scripting در پارامتر q',
 severity: 'medium',
 cvssScore: 5.4,
 cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N',
 cweId: 'CWE-79',
 affectedResource: '/search',
 affectedVersion: 'web-1.2.0',
 fixedVersion: 'web-1.2.1',
 discoveredBy: scanner.name,
 references: [],
 exploitAvailable: false,
 patchAvailable: false,
 tags: ['web', 'xss'],
 evidence: 'Payload: <script>alert(1)</script>',
 });
 }
 return found;
}

// ---------- risk scoring ----------
export interface RiskScore {
 overall: number; // 0..100
 bySeverity: Record<VulnSeverity, number>;
 trend: 'improving' | 'stable' | 'worsening';
 topRisks: Vulnerability[];
 slaCompliance: number; // درصد
}

const SLA_DAYS: Record<VulnSeverity, number> = {
 critical: 7,
 high: 14,
 medium: 30,
 low: 90,
 info: 365,
};

export function calculateRiskScore(): RiskScore {
 const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
 const now = Date.now();
 let slaBreaches = 0;
 let totalOpen = 0;
 for (const v of vulnerabilities.values()) {
 if (v.status === 'open' || v.status === 'in_progress') {
 bySeverity[v.severity]++;
 totalOpen++;
 const daysOpen = (now - v.discoveredAt) / 86400_000;
 if (daysOpen > SLA_DAYS[v.severity]) slaBreaches++;
 }
 }
 const weights = { critical: 100, high: 50, medium: 20, low: 5, info: 0 };
 const overall = Math.min(100, Math.round(
 (bySeverity.critical * weights.critical +
 bySeverity.high * weights.high +
 bySeverity.medium * weights.medium +
 bySeverity.low * weights.low) / 10
 ));
 // top risks: مرتب بر اساس CVSS و exploit
 const topRisks = Array.from(vulnerabilities.values())
.filter(v => v.status === 'open' || v.status === 'in_progress')
.sort((a, b) => {
 const aScore = a.cvssScore + (a.exploitAvailable? 2: 0);
 const bScore = b.cvssScore + (b.exploitAvailable? 2: 0);
 return bScore - aScore;
 })
.slice(0, 10);
 // trend: مقایسه‌ی هفته‌ی اخیر با قبلی
 const recentCount = scanResults.filter(s => s.finishedAt && s.finishedAt > now - 7 * 86400_000).length;
 const previousCount = scanResults.filter(s => s.finishedAt && s.finishedAt > now - 14 * 86400_000 && s.finishedAt <= now - 7 * 86400_000).length;
 const trend: RiskScore['trend'] = recentCount < previousCount? 'improving': recentCount > previousCount? 'worsening': 'stable';
 return {
 overall,
 bySeverity,
 trend,
 topRisks,
 slaCompliance: totalOpen > 0? Math.round(((totalOpen - slaBreaches) / totalOpen) * 100): 100,
 };
}

// ---------- reporting ----------
export function getStats() {
 return {
 total: vulnerabilities.size,
 byStatus: Array.from(vulnerabilities.values()).reduce((acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc; }, {} as Record<string, number>),
 bySeverity: Array.from(vulnerabilities.values()).reduce((acc, v) => { acc[v.severity] = (acc[v.severity] || 0) + 1; return acc; }, {} as Record<string, number>),
 scanners: scanners.size,
 recentScans: scanResults.slice(-10).reverse(),
 };
}

// ---------- registration ----------
export function registerDefaultScanners() {
 registerScanner({ id: 'sca-npm', name: 'NPM Audit', type: 'sca', enabled: true, scanInterval: 24, config: {} });
 registerScanner({ id: 'sast-eslint', name: 'ESLint Security', type: 'sast', enabled: true, scanInterval: 12, config: {} });
 registerScanner({ id: 'dast-zap', name: 'OWASP ZAP', type: 'dast', enabled: true, scanInterval: 24, config: {} });
 registerScanner({ id: 'container-trivy', name: 'Trivy', type: 'container', enabled: true, scanInterval: 12, config: {} });
 registerScanner({ id: 'k8s-kubebench', name: 'kube-bench', type: 'infrastructure', enabled: true, scanInterval: 168, config: {} });
 registerScanner({ id: 'net-nmap', name: 'Nmap NSE', type: 'network', enabled: true, scanInterval: 168, config: {} });
}
