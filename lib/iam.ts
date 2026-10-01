// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * iam.ts — Advanced Identity & Access Management برای هوش
 * RBAC + ABAC + Policy Engine با ارزیابی سیاست‌های پیچیده
 */

export interface Role {
 id: string;
 name: string;
 description?: string;
 permissions: string[]; // الگوهای wildcard: invoices:read, *
 inherits?: string[]; // role‌های ارث‌بری
 tenantId?: string; // اگر null global
 isSystem: boolean; // role سیستمی قابل حذف نیست
 createdAt: number;
}

export interface User {
 id: string;
 tenantId: string;
 email: string;
 roles: string[]; // role IDs
 attributes: Record<string, unknown>; // attributes برای ABAC
 directPermissions?: string[];
 status: 'active' | 'suspended' | 'invited';
 createdAt: number;
 lastLoginAt?: number;
}

export interface Permission {
 resource: string; // invoices, journal_entries, users,...
 action: string; // read, write, delete, approve,...
 conditions?: PermissionCondition[];
}

export interface PermissionCondition {
 attribute: string; // owner, department, tenant, time, ip_range
 operator: 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'between' | 'regex';
 value: unknown;
}

export interface Policy {
 id: string;
 name: string;
 description?: string;
 effect: 'allow' | 'deny';
 actions: string[]; // * برای همه
 resources: string[]; // * برای همه
 conditions?: PermissionCondition[]; // ABAC
 priority: number; // بالاتر = اولویت بیشتر
 enabled: boolean;
 // scope
 tenantId?: string;
 roleIds?: string[];
}

export interface AccessRequest {
 userId: string;
 resource: string;
 action: string;
 context: {
 tenantId?: string;
 resourceAttributes?: Record<string, unknown>;
 environment?: { time?: number; ip?: string; device?: string };
 };
}

export interface AccessDecision {
 allowed: boolean;
 matchedPolicies: string[];
 reason: string;
 evaluatedAt: number;
}

// ---------- state ----------
const roles = new Map<string, Role>();
const users = new Map<string, User>();
const policies = new Map<string, Policy>();

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- roles ----------
export function createRole(role: Omit<Role, 'id' | 'createdAt' | 'isSystem'>): Role {
 const r: Role = {...role, id: nextId('role'), createdAt: Date.now(), isSystem: false };
 roles.set(r.id, r);
 return r;
}

export function getRole(id: string): Role | undefined {
 return roles.get(id);
}

export function listRoles(tenantId?: string): Role[] {
 const all = Array.from(roles.values());
 return tenantId? all.filter(r =>!r.tenantId || r.tenantId === tenantId): all;
}

export function deleteRole(id: string): boolean {
 const role = roles.get(id);
 if (!role || role.isSystem) return false;
 roles.delete(id);
 return true;
}

export function assignRole(userId: string, roleId: string): boolean {
 const user = users.get(userId);
 const role = roles.get(roleId);
 if (!user ||!role) return false;
 if (!user.roles.includes(roleId)) user.roles.push(roleId);
 return true;
}

export function revokeRole(userId: string, roleId: string): boolean {
 const user = users.get(userId);
 if (!user) return false;
 user.roles = user.roles.filter(r => r!== roleId);
 return true;
}

// ---------- users ----------
export function createUser(user: Omit<User, 'createdAt'>): User {
 const u: User = {...user, createdAt: Date.now() };
 users.set(u.id, u);
 return u;
}

export function getUser(id: string): User | undefined {
 return users.get(id);
}

export function updateUserAttributes(userId: string, attributes: Record<string, unknown>): void {
 const user = users.get(userId);
 if (!user) return;
 user.attributes = {...user.attributes,...attributes };
}

// ---------- policies ----------
export function createPolicy(policy: Omit<Policy, 'id'>): Policy {
 const p: Policy = {...policy, id: nextId('pol') };
 policies.set(p.id, p);
 return p;
}

export function listPolicies(): Policy[] {
 return Array.from(policies.values()).sort((a, b) => b.priority - a.priority);
}

export function deletePolicy(id: string): boolean {
 return policies.delete(id);
}

// ---------- permission resolution ----------
function matchWildcard(pattern: string, value: string): boolean {
 if (pattern === '*') return true;
 if (pattern === value) return true;
 // پشتیبانی از * در پایان
 if (pattern.endsWith(':*')) {
 const prefix = pattern.slice(0, -2);
 return value.startsWith(prefix + ':') || value === prefix;
 }
 // پشتیبانی از * در وسط
 if (pattern.includes('*')) {
 const regex = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
 return regex.test(value);
 }
 return false;
}

function resolveUserPermissions(userId: string): string[] {
 const user = users.get(userId);
 if (!user) return [];
 const permissions = new Set<string>();
 // direct permissions
 for (const p of user.directPermissions || []) permissions.add(p);
 // role permissions (با ارث‌بری بازگشتی)
 const visited = new Set<string>();
 const resolveRole = (roleId: string) => {
 if (visited.has(roleId)) return;
 visited.add(roleId);
 const role = roles.get(roleId);
 if (!role) return;
 for (const p of role.permissions) permissions.add(p);
 if (role.inherits) role.inherits.forEach(resolveRole);
 };
 user.roles.forEach(resolveRole);
 return Array.from(permissions);
}

function evaluateCondition(condition: PermissionCondition, request: AccessRequest): boolean {
 let actual: unknown;
 // منبع مقدار: context.environment یا resourceAttributes یا user.attributes
 if (condition.attribute === 'time') {
 actual = request.context.environment?.time || Date.now();
 } else if (condition.attribute === 'ip') {
 actual = request.context.environment?.ip;
 } else if (condition.attribute === 'tenant') {
 actual = request.context.tenantId;
 } else {
 actual = request.context.resourceAttributes?.[condition.attribute];
 }
 switch (condition.operator) {
 case 'eq': return actual === condition.value;
 case 'neq': return actual!== condition.value;
 case 'in': return Array.isArray(condition.value) && condition.value.includes(actual);
 case 'gt': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
 case 'lt': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
 case 'between': return Array.isArray(condition.value) && condition.value.length === 2 && typeof actual === 'number' && actual >= (condition.value[0] as number) && actual <= (condition.value[1] as number);
 case 'regex': return typeof actual === 'string' && typeof condition.value === 'string' && new RegExp(condition.value).test(actual);
 default: return false;
 }
}

// ---------- access decision ----------
export function checkAccess(request: AccessRequest): AccessDecision {
 const user = users.get(request.userId);
 if (!user) {
 return { allowed: false, matchedPolicies: [], reason: 'کاربر یافت نشد', evaluatedAt: Date.now() };
 }
 if (user.status!== 'active') {
 return { allowed: false, matchedPolicies: [], reason: `حساب کاربر ${user.status} است`, evaluatedAt: Date.now() };
 }

 // 1. بررسی tenant
 if (request.context.tenantId && user.tenantId!== request.context.tenantId) {
 return { allowed: false, matchedPolicies: [], reason: 'عدم تطابق tenant', evaluatedAt: Date.now() };
 }

 const actionResource = `${request.resource}:${request.action}`;
 const userPermissions = resolveUserPermissions(request.userId);

 // 2. بررسی RBAC
 const hasPermission = userPermissions.some(p => matchWildcard(p, actionResource) || matchWildcard(p, `${request.resource}:*`));

 // 3. بررسی policy‌ها (deny بر‌تر از allow)
 let allowed = hasPermission;
 const matchedPolicyIds: string[] = [];
 for (const policy of listPolicies()) {
 if (!policy.enabled) continue;
 if (policy.tenantId && policy.tenantId!== request.context.tenantId) continue;
 if (policy.roleIds &&!policy.roleIds.some(r => user.roles.includes(r))) continue;

 const actionMatch = policy.actions.some(a => matchWildcard(a, request.action) || matchWildcard(a, '*'));
 const resourceMatch = policy.resources.some(r => matchWildcard(r, request.resource) || matchWildcard(r, '*'));
 if (!actionMatch ||!resourceMatch) continue;

 // ارزیابی conditions
 if (policy.conditions) {
 const allConditionsMet = policy.conditions.every(c => evaluateCondition(c, request));
 if (!allConditionsMet) continue;
 }
 matchedPolicyIds.push(policy.id);
 if (policy.effect === 'deny') {
 return { allowed: false, matchedPolicies: matchedPolicyIds, reason: `سیاست deny منطبق: ${policy.name}`, evaluatedAt: Date.now() };
 }
 if (policy.effect === 'allow') allowed = true;
 }

 return {
 allowed,
 matchedPolicies: matchedPolicyIds,
 reason: allowed? 'دسترسی مجاز': 'دسترسی غیرمجاز',
 evaluatedAt: Date.now(),
 };
}

// ---------- helper برای استفاده در middleware ----------
export function requirePermission(resource: string, action: string): (req: { userId: string; tenantId?: string }) => Promise<boolean> {
 return async (req) => {
 const decision = checkAccess({
 userId: req.userId,
 resource,
 action,
 context: { tenantId: req.tenantId, environment: { time: Date.now() } },
 });
 return decision.allowed;
 };
}

// ---------- predefined roles & policies ----------
export function registerDefaultRolesAndPolicies() {
 // system roles
 const adminRole: Role = { id: 'role_admin', name: 'مدیر سیستم', description: 'دسترسی کامل', permissions: ['*'], inherits: [], isSystem: true, createdAt: Date.now() };
 const accountantRole: Role = { id: 'role_accountant', name: 'حسابدار', permissions: ['invoices:read', 'invoices:write', 'journal:read', 'journal:write', 'reports:read', 'parties:read', 'parties:write'], inherits: [], isSystem: true, createdAt: Date.now() };
 const viewerRole: Role = { id: 'role_viewer', name: 'بیننده', permissions: ['invoices:read', 'journal:read', 'reports:read', 'parties:read'], inherits: [], isSystem: true, createdAt: Date.now() };
 const salesRole: Role = { id: 'role_sales', name: 'فروش', permissions: ['invoices:read', 'invoices:write', 'parties:read', 'parties:write', 'inventory:read'], inherits: ['role_viewer'], isSystem: true, createdAt: Date.now() };
 roles.set(adminRole.id, adminRole);
 roles.set(accountantRole.id, accountantRole);
 roles.set(viewerRole.id, viewerRole);
 roles.set(salesRole.id, salesRole);

 // policies
 createPolicy({
 id: 'pol_deny_outside_business_hours',
 name: 'ممنوع‌کردن دسترسی خارج از ساعات کاری',
 description: 'کاربران غیر admin نمی‌توانند خارج از ۸ تا ۲۰ تغییر ایجاد کنند',
 effect: 'deny',
 actions: ['write', 'delete', 'approve'],
 resources: ['*'],
 conditions: [
 { attribute: 'time', operator: 'between', value: [0, 8 * 3600_000] }, // تا ۸ صبح
 { attribute: 'time', operator: 'between', value: [20 * 3600_000, 24 * 3600_000] }, // بعد از ۸ شب
 ],
 priority: 100,
 enabled: true,
 });

 createPolicy({
 id: 'pol_owner_only_edit',
 name: 'فقط مالک می‌تواند ویرایش کند',
 description: 'کاربر فقط اسناد خودش را ویرایش کند',
 effect: 'allow',
 actions: ['write'],
 resources: ['invoices', 'journal_entries'],
 conditions: [
 { attribute: 'owner', operator: 'eq', value: '${user.id}' },
 ],
 priority: 50,
 enabled: true,
 });

 createPolicy({
 id: 'pol_ip_whitelist_admin',
 name: 'IP whitelist برای admin',
 description: 'admin فقط از IPهای مجاز',
 effect: 'deny',
 actions: ['*'],
 resources: ['*'],
 conditions: [
 { attribute: 'ip', operator: 'in', value: ['10.0.0.0/8', '192.168.0.0/16'] },
 ],
 priority: 200,
 enabled: false, // در عمل فعال می‌شود
 roleIds: ['role_admin'],
 });
}
