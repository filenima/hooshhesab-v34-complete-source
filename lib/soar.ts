/**
 * soar.ts — Security Orchestration, Automation and Response برای هوش
 * هماهنگی چند tools، playbook‌های پیچیده، و اتوماسیون کامل پاسخ
 */

import { eventBus } from '@/lib/event-bus';

export interface Tool {
 id: string;
 name: string;
 type: 'firewall' | 'edr' | 'siem' | 'iam' | 'email' | 'vpn' | 'cloud' | 'ticketing' | 'custom';
 config: Record<string, unknown>;
 availableActions: string[];
}

export interface PlaybookAction {
 id: string;
 toolId: string;
 actionName: string;
 parameters: Record<string, unknown>;
 // mapping پارامترها از context
 paramMappings?: Record<string, string>; // param name context path
 condition?: string;
 on_success?: string;
 on_failure?: string;
 timeout?: number;
}

export interface SOARPlaybook {
 id: string;
 name: string;
 description: string;
 trigger: { type: 'manual' | 'event' | 'schedule'; eventType?: string; schedule?: string };
 severity: 'low' | 'medium' | 'high' | 'critical';
 actions: PlaybookAction[];
 enabled: boolean;
 executionCount: number;
 lastExecutedAt?: number;
 averageDurationMs: number;
}

export interface Execution {
 id: string;
 playbookId: string;
 trigger: string;
 status: 'running' | 'success' | 'failed' | 'partial' | 'cancelled';
 startedAt: number;
 finishedAt?: number;
 context: Record<string, unknown>;
 actionResults: Array<{ actionId: string; status: 'success' | 'failed' | 'skipped'; result?: unknown; error?: string; durationMs: number }>;
 currentActionIndex: number;
}

// ---------- state ----------
const tools = new Map<string, Tool>();
const playbooks = new Map<string, SOARPlaybook>();
const executions = new Map<string, Execution>();
const MAX_EXECUTIONS = 500;

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- tool handlers ----------
type ToolHandler = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
const toolHandlers = new Map<string, ToolHandler>();

export function registerTool(tool: Tool, handler: ToolHandler): void {
 tools.set(tool.id, tool);
 toolHandlers.set(tool.id, handler);
}

export function getTool(id: string): Tool | undefined {
 return tools.get(id);
}

export function listTools(): Tool[] {
 return Array.from(tools.values());
}

// ---------- playbooks ----------
export function createPlaybook(pb: Omit<SOARPlaybook, 'executionCount' | 'averageDurationMs'>): SOARPlaybook {
 const playbook: SOARPlaybook = {...pb, executionCount: 0, averageDurationMs: 0 };
 playbooks.set(playbook.id, playbook);
 if (playbook.enabled && playbook.trigger.type === 'event' && playbook.trigger.eventType) {
 eventBus.subscribe(playbook.trigger.eventType, async (event) => {
 await executePlaybook(playbook.id, { event: event.payload, tenantId: event.tenantId, userId: event.tenantId });
 });
 }
 return playbook;
}

export function getPlaybook(id: string): SOARPlaybook | undefined {
 return playbooks.get(id);
}

export function listPlaybooks(): SOARPlaybook[] {
 return Array.from(playbooks.values());
}

// ---------- اجرای playbook ----------
export async function executePlaybook(playbookId: string, initialContext: Record<string, unknown>): Promise<Execution> {
 const playbook = playbooks.get(playbookId);
 if (!playbook ||!playbook.enabled) {
 throw new Error(`Playbook ${playbookId} not found or disabled`);
 }
 const execution: Execution = {
 id: nextId('exec'),
 playbookId,
 trigger: initialContext.event? 'event': 'manual',
 status: 'running',
 startedAt: Date.now(),
 context: {...initialContext },
 actionResults: [],
 currentActionIndex: 0,
 };
 executions.set(execution.id, execution);

 // اجرای هر action به ترتیب
 for (let i = 0; i < playbook.actions.length; i++) {
 const action = playbook.actions[i];
 execution.currentActionIndex = i;
 // بررسی شرط
 if (action.condition) {
 try {
 const fn = new Function('context', `with(context) { return ${action.condition}; }`);
 if (!fn(execution.context)) {
 execution.actionResults.push({ actionId: action.id, status: 'skipped', durationMs: 0 });
 continue;
 }
 } catch {
 execution.actionResults.push({ actionId: action.id, status: 'skipped', durationMs: 0 });
 continue;
 }
 }
 // resolution پارامترها از context
 const resolvedParams: Record<string, unknown> = {...action.parameters };
 if (action.paramMappings) {
 for (const [paramName, contextPath] of Object.entries(action.paramMappings)) {
 resolvedParams[paramName] = resolveContextPath(execution.context, contextPath);
 }
 }
 // اجرای action
 const start = Date.now();
 const handler = toolHandlers.get(action.toolId);
 if (!handler) {
 execution.actionResults.push({ actionId: action.id, status: 'failed', error: `Tool ${action.toolId} not found`, durationMs: Date.now() - start });
 execution.status = 'failed';
 break;
 }
 try {
 const result = await handler(action.actionName, resolvedParams);
 execution.actionResults.push({ actionId: action.id, status: 'success', result, durationMs: Date.now() - start });
 execution.context[`action_${action.id}_result`] = result;
 // ادامه به on_success یا action بعدی
 if (action.on_success) {
 const nextAction = playbook.actions.find(a => a.id === action.on_success);
 if (nextAction) {
 const nextIdx = playbook.actions.indexOf(nextAction);
 i = nextIdx - 1;
 }
 }
 } catch (e) {
 execution.actionResults.push({ actionId: action.id, status: 'failed', error: (e as Error).message, durationMs: Date.now() - start });
 if (action.on_failure) {
 const nextAction = playbook.actions.find(a => a.id === action.on_failure);
 if (nextAction) {
 const nextIdx = playbook.actions.indexOf(nextAction);
 i = nextIdx - 1;
 } else {
 execution.status = 'failed';
 break;
 }
 } else {
 execution.status = 'failed';
 break;
 }
 }
 }

 execution.finishedAt = Date.now();
 if (execution.status === 'running') execution.status = 'success';
 // به‌روزرسانی آمار playbook
 playbook.executionCount++;
 playbook.lastExecutedAt = Date.now();
 const duration = execution.finishedAt - execution.startedAt;
 playbook.averageDurationMs = Math.round((playbook.averageDurationMs * (playbook.executionCount - 1) + duration) / playbook.executionCount);
 playbooks.set(playbookId, playbook);
 // محدود کردن executions
 if (executions.size > MAX_EXECUTIONS) {
 const oldest = Array.from(executions.keys())[0];
 if (oldest) executions.delete(oldest);
 }
 return execution;
}

function resolveContextPath(context: Record<string, unknown>, path: string): unknown {
 const parts = path.split('.');
 let current: unknown = context;
 for (const part of parts) {
 if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
 current = (current as Record<string, unknown>)[part];
 } else {
 return undefined;
 }
 }
 return current;
}

export function getExecution(id: string): Execution | undefined {
 return executions.get(id);
}

export function listExecutions(limit = 50): Execution[] {
 return Array.from(executions.values()).slice(-limit).reverse();
}

// ---------- گزارش‌گیری ----------
export function getStats(): {
 totalPlaybooks: number;
 activePlaybooks: number;
 totalExecutions: number;
 successRate: number;
 avgDurationMs: number;
 byStatus: Record<string, number>;
} {
 const execs = Array.from(executions.values());
 const successful = execs.filter(e => e.status === 'success').length;
 return {
 totalPlaybooks: playbooks.size,
 activePlaybooks: Array.from(playbooks.values()).filter(p => p.enabled).length,
 totalExecutions: execs.length,
 successRate: execs.length > 0? successful / execs.length: 0,
 avgDurationMs: execs.length > 0
? Math.round(execs.reduce((s, e) => s + ((e.finishedAt || 0) - e.startedAt), 0) / execs.length)
: 0,
 byStatus: execs.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {} as Record<string, number>),
 };
}

// ---------- ثبت tools و playbook‌های پیش‌فرض ----------
export function registerDefaults() {
 // Firewall tool
 registerTool({
 id: 'firewall',
 name: 'Cloudflare WAF',
 type: 'firewall',
 config: { apiToken: process.env.CLOUDFLARE_API_TOKEN },
 availableActions: ['block_ip', 'unblock_ip', 'challenge_ip', 'list_rules'],
 }, async (action, params) => {
 console.log(`[SOAR] firewall.${action}`, params);
 return { action, status: 'success', ip: params.ip };
 });

 // EDR tool
 registerTool({
 id: 'edr',
 name: 'Endpoint Detection',
 type: 'edr',
 config: {},
 availableActions: ['isolate_host', 'scan_host', 'quarantine_file', 'get_processes'],
 }, async (action, params) => {
 console.log(`[SOAR] edr.${action}`, params);
 return { action, status: 'success', host: params.hostId };
 });

 // IAM tool
 registerTool({
 id: 'iam',
 name: 'Identity & Access',
 type: 'iam',
 config: {},
 availableActions: ['suspend_user', 'revoke_sessions', 'require_mfa', 'reset_password'],
 }, async (action, params) => {
 console.log(`[SOAR] iam.${action}`, params);
 return { action, status: 'success', userId: params.userId };
 });

 // Ticketing tool
 registerTool({
 id: 'ticketing',
 name: 'Jira/ServiceNow',
 type: 'ticketing',
 config: {},
 availableActions: ['create_ticket', 'update_ticket', 'assign_ticket'],
 }, async (action, params) => {
 console.log(`[SOAR] ticketing.${action}`, params);
 return { action, status: 'success', ticketId: nextId('tkt') };
 });

 // Email tool
 registerTool({
 id: 'email',
 name: 'Email Gateway',
 type: 'email',
 config: {},
 availableActions: ['send_alert', 'block_sender', 'quarantine_message'],
 }, async (action, params) => {
 console.log(`[SOAR] email.${action}`, params);
 return { action, status: 'success' };
 });

 // playbook‌ها
 createPlaybook({
 id: 'auto_block_brute_force',
 name: 'مسدودسازی خودکار brute-force',
 description: 'هنگام تشخیص brute-force، IP را مسدود کن و تیکت بساز',
 trigger: { type: 'event', eventType: 'security.login_blocked' },
 severity: 'high',
 enabled: true,
 actions: [
 { id: 'a1', toolId: 'firewall', actionName: 'block_ip', parameters: {}, paramMappings: { ip: 'event.ipAddress' }, timeout: 5000 },
 { id: 'a2', toolId: 'ticketing', actionName: 'create_ticket', parameters: { priority: 'high', category: 'security' }, paramMappings: { description: 'event.description' } },
 { id: 'a3', toolId: 'email', actionName: 'send_alert', parameters: { template: 'security_alert' }, paramMappings: { recipient: 'event.adminEmail' } },
 ],
 });

 createPlaybook({
 id: 'compromised_account_response',
 name: 'پاسخ به حساب هک‌شده',
 description: 'تشخیص نشست مشکوک تعلیق کاربر، لغو نشست‌ها، الزام MFA',
 trigger: { type: 'event', eventType: 'security.impossible_travel' },
 severity: 'critical',
 enabled: true,
 actions: [
 { id: 'c1', toolId: 'iam', actionName: 'revoke_sessions', parameters: {}, paramMappings: { userId: 'event.userId' } },
 { id: 'c2', toolId: 'iam', actionName: 'require_mfa', parameters: {}, paramMappings: { userId: 'event.userId' } },
 { id: 'c3', toolId: 'iam', actionName: 'suspend_user', parameters: {}, paramMappings: { userId: 'event.userId' }, condition: 'event.severity === "critical"' },
 { id: 'c4', toolId: 'ticketing', actionName: 'create_ticket', parameters: { priority: 'critical', category: 'incident' } },
 { id: 'c5', toolId: 'email', actionName: 'send_alert', parameters: { template: 'account_compromised' } },
 ],
 });

 createPlaybook({
 id: 'malware_response',
 name: 'پاسخ به بدافزار',
 description: 'قرنطینه فایل، ایزوله هاست، اسکن کامل',
 trigger: { type: 'event', eventType: 'security.malware_detected' },
 severity: 'critical',
 enabled: true,
 actions: [
 { id: 'm1', toolId: 'edr', actionName: 'quarantine_file', parameters: {}, paramMappings: { fileId: 'event.fileHash' } },
 { id: 'm2', toolId: 'edr', actionName: 'isolate_host', parameters: {}, paramMappings: { hostId: 'event.hostId' } },
 { id: 'm3', toolId: 'edr', actionName: 'scan_host', parameters: { deep: true }, paramMappings: { hostId: 'event.hostId' } },
 { id: 'm4', toolId: 'ticketing', actionName: 'create_ticket', parameters: { priority: 'critical' } },
 ],
 });
}
