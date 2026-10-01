/**
 * pam.ts — Privileged Access Management برای هوش
 * مدیریت دسترسی‌های privileged، just-in-time access، session recording
 */

export interface PrivilegedAccount {
 id: string;
 userId: string;
 tenantId: string;
 accountType: 'admin' | 'root_db' | 'cloud_console' | 'k8s_admin' | 'vault_admin' | 'ssh';
 targetResource: string; // مثلاً: postgres-primary, k8s-prod
 credentials: { username: string; passwordRef?: string; keyRef?: string }; // مرجع Vault
 status: 'active' | 'revoked' | 'expired';
 maxSessionDuration: number; // دقیقه
 requiresApproval: boolean;
 approvers: string[]; // userId‌هایی که باید تأیید کنند
 lastAccessedAt?: number;
 totalSessions: number;
 createdAt: number;
}

export interface AccessRequest {
 id: string;
 accountId: string;
 userId: string;
 reason: string;
 requestedDuration: number; // دقیقه
 status: 'pending' | 'approved' | 'denied' | 'expired' | 'active' | 'completed' | 'revoked';
 requestedAt: number;
 decidedAt?: number;
 decidedBy?: string;
 denialReason?: string;
 grantedAt?: number;
 expiresAt?: number;
 revokedAt?: number;
 session?: ActiveSession;
 approvals: Array<{ approverId: string; status: 'pending' | 'approved' | 'denied'; decidedAt?: number; comment?: string }>;
}

export interface ActiveSession {
 id: string;
 requestId: string;
 accountId: string;
 userId: string;
 startedAt: number;
 expiresAt: number;
 commands: Array<{ timestamp: number; command: string; output?: string }>; // session recording
 ipAddress: string;
 isActive: boolean;
}

// ---------- state ----------
const accounts = new Map<string, PrivilegedAccount>();
const requests = new Map<string, AccessRequest>();
const sessions = new Map<string, ActiveSession>();

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- account management ----------
export function registerAccount(account: Omit<PrivilegedAccount, 'id' | 'createdAt' | 'totalSessions' | 'lastAccessedAt'>): PrivilegedAccount {
 const acc: PrivilegedAccount = {...account, id: nextId('pam'), createdAt: Date.now(), totalSessions: 0 };
 accounts.set(acc.id, acc);
 return acc;
}

export function getAccount(id: string): PrivilegedAccount | undefined {
 return accounts.get(id);
}

export function listAccounts(tenantId?: string): PrivilegedAccount[] {
 const all = Array.from(accounts.values());
 return tenantId? all.filter(a => a.tenantId === tenantId): all;
}

export function revokeAccount(id: string): boolean {
 const acc = accounts.get(id);
 if (!acc) return false;
 acc.status = 'revoked';
 // لغو همه‌ی نشست‌های فعال
 for (const s of sessions.values()) {
 if (s.accountId === id && s.isActive) {
 s.isActive = false;
 s.expiresAt = Date.now();
 }
 }
 return true;
}

// rotate credentials
export async function rotateCredentials(accountId: string): Promise<{ newPassword: string; rotatedAt: number }> {
 const acc = accounts.get(accountId);
 if (!acc) throw new Error('Account not found');
 // در عمل: فراخوانی Vault برای تولید password جدید
 const randomBytes = new Uint8Array(24);
 crypto.getRandomValues(randomBytes);
 const newPassword = Buffer.from(randomBytes).toString('base64url');
 console.log(`[PAM] credentials rotated for ${acc.accountType}:${acc.targetResource}`);
 return { newPassword, rotatedAt: Date.now() };
}

// ---------- JIT access request ----------
export function requestAccess(
 accountId: string,
 userId: string,
 reason: string,
 durationMinutes: number
): AccessRequest {
 const acc = accounts.get(accountId);
 if (!acc) throw new Error('Account not found');
 if (acc.status!== 'active') throw new Error(`Account is ${acc.status}`);
 if (durationMinutes > acc.maxSessionDuration) {
 throw new Error(`حداکثر مدت مجاز: ${acc.maxSessionDuration} دقیقه`);
 }

 const req: AccessRequest = {
 id: nextId('req'),
 accountId,
 userId,
 reason,
 requestedDuration: durationMinutes,
 status: acc.requiresApproval? 'pending': 'approved',
 requestedAt: Date.now(),
 decidedAt: acc.requiresApproval? undefined: Date.now(),
 decidedBy: acc.requiresApproval? undefined: 'system',
 approvals: acc.approvers.map(a => ({ approverId: a, status: 'pending' })),
 };
 requests.set(req.id, req);
 if (!acc.requiresApproval) {
 activateSession(req.id);
 }
 return req;
}

export function approveRequest(requestId: string, approverId: string, comment?: string): AccessRequest | null {
 const req = requests.get(requestId);
 if (!req || req.status!== 'pending') return null;
 const approval = req.approvals.find(a => a.approverId === approverId);
 if (!approval || approval.status!== 'pending') return null;
 approval.status = 'approved';
 approval.decidedAt = Date.now();
 approval.comment = comment;
 // اگر همه تأیید کردند
 if (req.approvals.every(a => a.status === 'approved')) {
 req.status = 'approved';
 req.decidedAt = Date.now();
 req.decidedBy = approverId;
 activateSession(req.id);
 }
 requests.set(requestId, req);
 return req;
}

export function denyRequest(requestId: string, approverId: string, reason: string): AccessRequest | null {
 const req = requests.get(requestId);
 if (!req || req.status!== 'pending') return null;
 req.status = 'denied';
 req.decidedAt = Date.now();
 req.decidedBy = approverId;
 req.denialReason = reason;
 requests.set(requestId, req);
 return req;
}

function activateSession(requestId: string): void {
 const req = requests.get(requestId);
 if (!req) return;
 const acc = accounts.get(req.accountId);
 if (!acc) return;
 const session: ActiveSession = {
 id: nextId('sess'),
 requestId,
 accountId: req.accountId,
 userId: req.userId,
 startedAt: Date.now(),
 expiresAt: Date.now() + req.requestedDuration * 60_000,
 commands: [],
 ipAddress: 'auto',
 isActive: true,
 };
 req.session = session;
 req.status = 'active';
 req.grantedAt = Date.now();
 req.expiresAt = session.expiresAt;
 sessions.set(session.id, session);
 acc.lastAccessedAt = Date.now();
 acc.totalSessions++;
 accounts.set(req.accountId, acc);
 requests.set(requestId, req);

 // زمان‌بندی لغو خودکار
 setTimeout(() => revokeSession(session.id), req.requestedDuration * 60_000);
}

export function revokeSession(sessionId: string): void {
 const session = sessions.get(sessionId);
 if (!session ||!session.isActive) return;
 session.isActive = false;
 session.expiresAt = Date.now();
 sessions.set(sessionId, session);
 // به‌روزرسانی request
 for (const req of requests.values()) {
 if (req.session?.id === sessionId) {
 req.status = 'completed';
 req.revokedAt = Date.now();
 requests.set(req.id, req);
 break;
 }
 }
}

export function revokeRequest(requestId: string, by: string): void {
 const req = requests.get(requestId);
 if (!req || req.status!== 'active') return;
 req.status = 'revoked';
 req.revokedAt = Date.now();
 if (req.session) revokeSession(req.session.id);
 console.log(`[PAM] request ${requestId} revoked by ${by}`);
}

// ---------- session recording ----------
export function recordCommand(sessionId: string, command: string, output?: string): void {
 const session = sessions.get(sessionId);
 if (!session ||!session.isActive) return;
 session.commands.push({ timestamp: Date.now(), command, output });
 // اگر دستور خطرناک بود، هشدار
 const dangerousPatterns = [/rm\s+-rf/, /DROP\s+TABLE/, /DELETE\s+FROM/i, /:\(\)\{.*\};/, /chmod\s+777/];
 if (dangerousPatterns.some(p => p.test(command))) {
 console.warn(`[PAM] dangerous command detected in session ${sessionId}: ${command}`);
 // در عمل: emit security event
 }
}

// ---------- query ----------
export function getActiveSessions(): ActiveSession[] {
 return Array.from(sessions.values()).filter(s => s.isActive);
}

export function getSession(id: string): ActiveSession | undefined {
 return sessions.get(id);
}

export function listRequests(filter?: { userId?: string; accountId?: string; status?: AccessRequest['status'] }): AccessRequest[] {
 let result = Array.from(requests.values());
 if (filter?.userId) result = result.filter(r => r.userId === filter.userId);
 if (filter?.accountId) result = result.filter(r => r.accountId === filter.accountId);
 if (filter?.status) result = result.filter(r => r.status === filter.status);
 return result.sort((a, b) => b.requestedAt - a.requestedAt);
}

// ---------- audit ----------
export function getAuditTrail(accountId?: string, limit = 100): Array<{
 type: string;
 timestamp: number;
 accountId?: string;
 userId?: string;
 details: Record<string, unknown>;
}> {
 const trail: Array<{ type: string; timestamp: number; accountId?: string; userId?: string; details: Record<string, unknown> }> = [];
 for (const req of requests.values()) {
 if (accountId && req.accountId!== accountId) continue;
 trail.push({ type: 'request', timestamp: req.requestedAt, accountId: req.accountId, userId: req.userId, details: { reason: req.reason, duration: req.requestedDuration, status: req.status } });
 if (req.decidedAt) {
 trail.push({ type: 'decision', timestamp: req.decidedAt, accountId: req.accountId, userId: req.decidedBy, details: { status: req.status, reason: req.denialReason } });
 }
 if (req.session) {
 trail.push({ type: 'session_start', timestamp: req.session.startedAt, accountId: req.accountId, userId: req.userId, details: { sessionId: req.session.id } });
 if (!req.session.isActive) {
 trail.push({ type: 'session_end', timestamp: req.session.expiresAt, accountId: req.accountId, userId: req.userId, details: { sessionId: req.session.id, commands: req.session.commands.length } });
 }
 }
 }
 return trail.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

// ---------- defaults ----------
export function registerDefaultAccounts() {
 registerAccount({
 userId: 'system', tenantId: 'global',
 accountType: 'root_db', targetResource: 'postgres-primary',
 credentials: { username: 'postgres', passwordRef: 'secret/data/hesab/db-root' },
 status: 'active',
 maxSessionDuration: 30,
 requiresApproval: true,
 approvers: ['user_admin1', 'user_admin2'],
 });
 registerAccount({
 userId: 'system', tenantId: 'global',
 accountType: 'k8s_admin', targetResource: 'k8s-prod',
 credentials: { username: 'hesab-admin', keyRef: 'secret/data/hesab/k8s-admin' },
 status: 'active',
 maxSessionDuration: 60,
 requiresApproval: true,
 approvers: ['user_admin1'],
 });
 registerAccount({
 userId: 'system', tenantId: 'global',
 accountType: 'vault_admin', targetResource: 'vault',
 credentials: { username: 'vault-admin' },
 status: 'active',
 maxSessionDuration: 15,
 requiresApproval: true,
 approvers: ['user_admin1', 'user_admin2'],
 });
}
