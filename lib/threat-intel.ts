/**
 * threat-intel.ts — Threat Intelligence برای هوش
 * منابع feed، IOC matching، و reputation scoring
 */

export type IOCType = 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'user_agent' | 'asn';

export interface IOC {
 id: string;
 type: IOCType;
 value: string;
 severity: 'low' | 'medium' | 'high' | 'critical';
 source: string; // نام feed
 description?: string;
 tags: string[];
 firstSeen: number;
 lastSeen: number;
 confidence: number; // 0..1
 expiresAt?: number;
}

export interface ThreatFeed {
 id: string;
 name: string;
 url?: string;
 format: 'stix' | 'json' | 'csv' | 'txt';
 refreshInterval: number; // دقیقه
 lastFetch: number;
 status: 'active' | 'paused' | 'error';
 iocCount: number;
}

export interface ThreatMatch {
 ioc: IOC;
 matchedValue: string;
 matchedAt: number;
 context: { source: string; userId?: string; ipAddress?: string; details?: Record<string, unknown> };
}

// ---------- state ----------
const iocs = new Map<string, IOC>(); // key: type:value
const feeds = new Map<string, ThreatFeed>();
const matches: ThreatMatch[] = [];
const MAX_MATCHES = 5000;

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- feed management ----------
export function registerFeed(feed: Omit<ThreatFeed, 'lastFetch' | 'iocCount' | 'status'>): ThreatFeed {
 const f: ThreatFeed = {...feed, lastFetch: 0, iocCount: 0, status: 'active' };
 feeds.set(f.id, f);
 return f;
}

export async function refreshFeed(feedId: string): Promise<number> {
 const feed = feeds.get(feedId);
 if (!feed) return 0;
 try {
 if (feed.url) {
 const resp = await fetch(feed.url, { signal: AbortSignal.timeout(10000) });
 if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
 const text = await resp.text();
 const newIocs = parseFeed(text, feed.format, feed.id);
 for (const ioc of newIocs) {
 upsertIOC(ioc);
 }
 feed.iocCount = newIocs.length;
 feed.lastFetch = Date.now();
 feed.status = 'active';
 feeds.set(feedId, feed);
 return newIocs.length;
 }
 return 0;
 } catch (e) {
 feed.status = 'error';
 feeds.set(feedId, feed);
 console.error(`[threat-intel] feed refresh failed: ${feed.name}:`, e);
 return 0;
 }
}

function parseFeed(text: string, format: ThreatFeed['format'], source: string): Omit<IOC, 'id'>[] {
 const result: Omit<IOC, 'id'>[] = [];
 const now = Date.now();
 if (format === 'txt') {
 const lines = text.split('\n').map(l => l.trim()).filter(l => l &&!l.startsWith('#'));
 for (const line of lines) {
 const type = detectIOCType(line);
 if (type) {
 result.push({
 type,
 value: line,
 severity: 'medium',
 source,
 tags: [],
 firstSeen: now,
 lastSeen: now,
 confidence: 0.7,
 });
 }
 }
 } else if (format === 'json') {
 try {
 const data = JSON.parse(text) as Array<{ type?: string; value?: string; severity?: string }>;
 for (const item of data) {
 if (item.value) {
 result.push({
 type: (item.type as IOCType) || detectIOCType(item.value) || 'ip',
 value: item.value,
 severity: (item.severity as IOC['severity']) || 'medium',
 source,
 tags: [],
 firstSeen: now,
 lastSeen: now,
 confidence: 0.7,
 });
 }
 }
 } catch { /* ignore */ }
 }
 return result;
}

function detectIOCType(value: string): IOCType | null {
 // IP v4
 if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return 'ip';
 // domain
 if (/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value) &&!value.includes(' ')) return 'domain';
 // hash
 if (/^[a-f0-9]{32}$/i.test(value)) return 'hash'; // MD5
 if (/^[a-f0-9]{40}$/i.test(value)) return 'hash'; // SHA1
 if (/^[a-f0-9]{64}$/i.test(value)) return 'hash'; // SHA256
 // URL
 if (/^https?:\/\//i.test(value)) return 'url';
 // email
 if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'email';
 return null;
}

// ---------- IOC management ----------
export function upsertIOC(ioc: Omit<IOC, 'id'>): IOC {
 const key = `${ioc.type}:${ioc.value}`;
 const existing = iocs.get(key);
 const full: IOC = existing
? {...existing,...ioc, id: existing.id, lastSeen: Date.now() }
: {...ioc, id: nextId('ioc') };
 iocs.set(key, full);
 return full;
}

export function getIOC(type: IOCType, value: string): IOC | undefined {
 return iocs.get(`${type}:${value}`);
}

export function searchIOCs(query: { type?: IOCType; value?: string; source?: string; severity?: IOC['severity'] }): IOC[] {
 let result = Array.from(iocs.values());
 if (query.type) result = result.filter(i => i.type === query.type);
 if (query.value) result = result.filter(i => i.value.includes(query.value!));
 if (query.source) result = result.filter(i => i.source === query.source);
 if (query.severity) result = result.filter(i => i.severity === query.severity);
 return result.slice(0, 1000);
}

export function deleteIOC(type: IOCType, value: string): boolean {
 return iocs.delete(`${type}:${value}`);
}

// ---------- matching ----------
export function checkIOC(type: IOCType, value: string, context: ThreatMatch['context']): ThreatMatch | null {
 const ioc = iocs.get(`${type}:${value}`);
 if (!ioc) return null;
 const match: ThreatMatch = { ioc, matchedValue: value, matchedAt: Date.now(), context };
 matches.push(match);
 if (matches.length > MAX_MATCHES) matches.shift();
 return match;
}

export function checkIPAddress(ip: string, context: ThreatMatch['context']): ThreatMatch | null {
 return checkIOC('ip', ip, context);
}

export function checkDomain(domain: string, context: ThreatMatch['context']): ThreatMatch | null {
 return checkIOC('domain', domain, context);
}

export function checkHash(hash: string, context: ThreatMatch['context']): ThreatMatch | null {
 return checkIOC('hash', hash, context);
}

export function checkUrl(url: string, context: ThreatMatch['context']): ThreatMatch | null {
 return checkIOC('url', url, context);
}

// ---------- reputation scoring ----------
export function getIPReputation(ip: string): {
 score: number; // 0..100 (100 = very malicious)
 category: string;
 matches: IOC[];
 recommendation: 'allow' | 'monitor' | 'challenge' | 'block';
} {
 const matches: IOC[] = [];
 const ioc = iocs.get(`ip:${ip}`);
 if (ioc) matches.push(ioc);
 // همچنین subnet matching ساده
 const subnet = ip.split('.').slice(0, 3).join('.');
 for (const [key, val] of iocs) {
 if (key.startsWith('ip:') && key.includes(subnet) && val.value!== ip) {
 matches.push(val);
 }
 }
 const severityScore = { low: 25, medium: 50, high: 75, critical: 100 };
 const score = matches.length > 0
? Math.min(100, matches.reduce((s, m) => s + severityScore[m.severity] * m.confidence, 0) / matches.length)
: 0;

 let category = 'clean';
 let recommendation: 'allow' | 'monitor' | 'challenge' | 'block' = 'allow';
 if (score >= 75) { category = 'malicious'; recommendation = 'block'; }
 else if (score >= 50) { category = 'suspicious'; recommendation = 'challenge'; }
 else if (score >= 25) { category = 'questionable'; recommendation = 'monitor'; }

 return { score: Math.round(score), category, matches, recommendation };
}

// ---------- query matches ----------
export function getMatches(filter?: { source?: string; severity?: IOC['severity']; since?: number }): ThreatMatch[] {
 let result = [...matches];
 if (filter?.source) result = result.filter(m => m.context.source === filter.source);
 if (filter?.severity) result = result.filter(m => m.ioc.severity === filter.severity);
 if (filter?.since) result = result.filter(m => m.matchedAt >= filter.since!);
 result.sort((a, b) => b.matchedAt - a.matchedAt);
 return result.slice(0, 100);
}

// ---------- stats ----------
export function getStats(): {
 totalIOCs: number;
 byType: Record<IOCType, number>;
 bySeverity: Record<IOC['severity'], number>;
 bySource: Record<string, number>;
 feeds: ThreatFeed[];
 recentMatches: ThreatMatch[];
} {
 const byType = {} as Record<IOCType, number>;
 const bySeverity = {} as Record<IOC['severity'], number>;
 const bySource: Record<string, number> = {};
 for (const ioc of iocs.values()) {
 byType[ioc.type] = (byType[ioc.type] || 0) + 1;
 bySeverity[ioc.severity] = (bySeverity[ioc.severity] || 0) + 1;
 bySource[ioc.source] = (bySource[ioc.source] || 0) + 1;
 }
 return {
 totalIOCs: iocs.size,
 byType,
 bySeverity,
 bySource,
 feeds: Array.from(feeds.values()),
 recentMatches: matches.slice(-20).reverse(),
 };
}

// ---------- feeds پیش‌فرض ----------
export function registerDefaultFeeds() {
 registerFeed({
 id: 'abuseipdb',
 name: 'AbuseIPDB',
 url: 'https://api.abuseipdb.com/api/v2/blacklist',
 format: 'json',
 refreshInterval: 60,
 });
 registerFeed({
 id: 'spamhaus',
 name: 'Spamhaus DROP',
 url: 'https://www.spamhaus.org/drop/drop.txt',
 format: 'txt',
 refreshInterval: 1440,
 });
 registerFeed({
 id: 'tor-exit',
 name: 'Tor Exit Nodes',
 url: 'https://check.torproject.org/torbulkexitlist',
 format: 'txt',
 refreshInterval: 30,
 });
 registerFeed({
 id: 'malware-domains',
 name: 'Malware Domain Blocklist',
 url: 'https://mirror.cedia.org.ec/malwaredomains/justdomains',
 format: 'txt',
 refreshInterval: 1440,
 });

 // ثبت چند IOC نمونه برای demo
 const now = Date.now();
 upsertIOC({ type: 'ip', value: '185.220.101.45', severity: 'high', source: 'tor-exit', description: 'Tor exit node', tags: ['tor', 'anonymous'], firstSeen: now, lastSeen: now, confidence: 0.95 });
 upsertIOC({ type: 'ip', value: '45.155.205.233', severity: 'critical', source: 'abuseipdb', description: 'Brute-force attacker', tags: ['brute_force', 'ssh'], firstSeen: now, lastSeen: now, confidence: 0.9 });
 upsertIOC({ type: 'domain', value: 'phishing-example.com', severity: 'critical', source: 'malware-domains', description: 'Phishing site', tags: ['phishing'], firstSeen: now, lastSeen: now, confidence: 0.85 });
 upsertIOC({ type: 'hash', value: 'd41d8cd98f00b204e9800998ecf8427e', severity: 'medium', source: 'internal', description: 'Empty file hash (suspicious)', tags: ['empty'], firstSeen: now, lastSeen: now, confidence: 0.5 });
 upsertIOC({ type: 'user_agent', value: 'sqlmap/1.6', severity: 'critical', source: 'internal', description: 'SQL injection tool', tags: ['sqli', 'scanner'], firstSeen: now, lastSeen: now, confidence: 1.0 });
}
