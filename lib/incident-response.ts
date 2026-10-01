/**
 * incident-response.ts — اتوماسیون پاسخ به حوادث امنیتی هوش
 * تعریف playbook، اجرای مراحل، ارتقا، و هماهنگی بین تیم‌ها
 */

import { eventBus } from '@/lib/event-bus';
import { emitSecurityEvent, type SecurityEvent, type Severity } from '@/lib/soc';

export type IncidentStatus = 'detected' | 'triaging' | 'contained' | 'eradicated' | 'recovered' | 'closed' | 'false_positive';
export type IncidentSeverity = Severity;

export interface PlaybookStep {
 id: string;
 name: string;
 description: string;
 type: 'manual' | 'automatic';
 action?: string; // نام تابع اجرایی
 timeout?: number; // میلی‌ثانیه
 requiresApproval?: boolean;
 nextStepId?: string;
 branches?: { condition: string; nextStepId: string }[];
}

export interface Playbook {
 id: string;
 name: string;
 description: string;
 triggerEvent: string; // نوع رویداد امنیتی که این playbook را فعال می‌کند
 severity: IncidentSeverity;
 entryStepId: string;
 steps: PlaybookStep[];
 estimatedResolutionTime: number; // دقیقه
}

export interface Incident {
 id: string;
 title: string;
 description: string;
 severity: IncidentSeverity;
 status: IncidentStatus;
 triggeredBy: SecurityEvent;
 playbookId?: string;
 currentStepId?: string;
 events: SecurityEvent[];
 timeline: Array<{ timestamp: number; type: string; description: string; actor?: string }>;
 assignedTo?: string;
 createdAt: number;
 updatedAt: number;
 closedAt?: number;
 postmortem?: string;
 affectedResources: string[];
}

// ---------- state ----------
const playbooks = new Map<string, Playbook>();
const incidents = new Map<string, Incident>();
const activeRunners = new Map<string, NodeJS.Timeout>();

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- action handlers ----------
const actionHandlers = new Map<string, (incident: Incident, step: PlaybookStep) => Promise<Record<string, unknown>>>();

export function registerAction(name: string, handler: (incident: Incident, step: PlaybookStep) => Promise<Record<string, unknown>>) {
 actionHandlers.set(name, handler);
}

// ثبت action‌های پیش‌فرض
registerAction('block_ip', async (incident) => {
 const ip = incident.triggeredBy.ipAddress;
 console.log(`[IR] blocking IP: ${ip}`);
 // در عمل: فراخوانی API فایروال
 return { blocked: true, ip };
});

registerAction('suspend_user', async (incident) => {
 const userId = incident.triggeredBy.userId;
 console.log(`[IR] suspending user: ${userId}`);
 return { suspended: true, userId };
});

registerAction('revoke_sessions', async (incident) => {
 console.log(`[IR] revoking sessions for user: ${incident.triggeredBy.userId}`);
 return { revoked: true };
});

registerAction('require_mfa', async (incident) => {
 console.log(`[IR] enforcing MFA for user: ${incident.triggeredBy.userId}`);
 return { enforced: true };
});

registerAction('notify_admin', async (incident) => {
 console.log(`[IR] notifying admin about incident: ${incident.id}`);
 return { notified: true };
});

registerAction('notify_user', async (incident) => {
 console.log(`[IR] notifying user: ${incident.triggeredBy.userId}`);
 return { notified: true };
});

registerAction('snapshot_state', async (incident) => {
 console.log(`[IR] taking snapshot for incident: ${incident.id}`);
 return { snapshotId: nextId('snap') };
});

registerAction('isolate_resource', async (incident) => {
 console.log(`[IR] isolating affected resources: ${incident.affectedResources.join(', ')}`);
 return { isolated: true };
});

registerAction('collect_forensics', async (incident) => {
 console.log(`[IR] collecting forensics for incident: ${incident.id}`);
 return { evidenceId: nextId('evid') };
});

// ---------- playbooks ----------
export function createPlaybook(data: Omit<Playbook, 'id'>): Playbook {
 const pb: Playbook = {...data, id: nextId('pb') };
 playbooks.set(pb.id, pb);
 // subscribe به trigger event
 eventBus.subscribe(`security.${data.triggerEvent}`, (event) => {
 const secEvent = event.payload as SecurityEvent;
 createIncident(secEvent, pb);
 });
 return pb;
}

export function getPlaybook(id: string): Playbook | undefined {
 return playbooks.get(id);
}

export function listPlaybooks(): Playbook[] {
 return Array.from(playbooks.values());
}

// ---------- incidents ----------
export function createIncident(triggerEvent: SecurityEvent, playbook?: Playbook): Incident {
 const incident: Incident = {
 id: nextId('inc'),
 title: playbook? playbook.name: `حادثه‌ی امنیتی: ${triggerEvent.type}`,
 description: triggerEvent.description,
 severity: triggerEvent.severity,
 status: 'detected',
 triggeredBy: triggerEvent,
 playbookId: playbook?.id,
 currentStepId: playbook?.entryStepId,
 events: [triggerEvent],
 timeline: [{ timestamp: Date.now(), type: 'detection', description: 'حادثه تشخیص داده شد' }],
 createdAt: Date.now(),
 updatedAt: Date.now(),
 affectedResources: [],
 };
 incidents.set(incident.id, incident);
 eventBus.publish('security.incident.created', incident, { source: 'ir' });
 // شروع خودکار playbook
 if (playbook && incident.currentStepId) {
 runPlaybookStep(incident.id, incident.currentStepId);
 }
 return incident;
}

export function getIncident(id: string): Incident | undefined {
 return incidents.get(id);
}

export function listIncidents(filter?: { status?: IncidentStatus; severity?: IncidentSeverity }): Incident[] {
 let result = Array.from(incidents.values());
 if (filter?.status) result = result.filter(i => i.status === filter.status);
 if (filter?.severity) result = result.filter(i => i.severity === filter.severity);
 result.sort((a, b) => b.createdAt - a.createdAt);
 return result;
}

async function runPlaybookStep(incidentId: string, stepId: string): Promise<void> {
 const incident = incidents.get(incidentId);
 if (!incident ||!incident.playbookId) return;
 const playbook = playbooks.get(incident.playbookId);
 if (!playbook) return;
 const step = playbook.steps.find(s => s.id === stepId);
 if (!step) return;

 incident.currentStepId = stepId;
 incident.timeline.push({ timestamp: Date.now(), type: 'step_start', description: `شروع مرحله: ${step.name}` });
 incident.updatedAt = Date.now();

 if (step.type === 'automatic' && step.action) {
 const handler = actionHandlers.get(step.action);
 if (handler) {
 try {
 const result = await handler(incident, step);
 incident.timeline.push({ timestamp: Date.now(), type: 'action_completed', description: `اکشن ${step.action} انجام شد`, actor: 'system' });
 emitSecurityEvent({
 type: 'config_change',
 severity: 'low',
 source: 'incident-response',
 description: `اکشن ${step.action} در پاسخ به حادثه ${incident.id} اجرا شد`,
 details: result,
 });

 // بررسی branches
 if (step.branches) {
 for (const branch of step.branches) {
 // ارزیابی شرط ساده
 try {
 const fn = new Function('incident', `return ${branch.condition}`);
 if (fn(incident)) {
 runPlaybookStep(incidentId, branch.nextStepId);
 return;
 }
 } catch { /* ignore */ }
 }
 }

 // مرحله‌ی بعد
 if (step.nextStepId) {
 runPlaybookStep(incidentId, step.nextStepId);
 } else {
 // پایان playbook
 incident.status = 'recovered';
 incident.timeline.push({ timestamp: Date.now(), type: 'recovered', description: 'حادثه بازیابی شد' });
 }
 } catch (e) {
 incident.timeline.push({ timestamp: Date.now(), type: 'action_failed', description: `خطا در اکشن ${step.action}: ${(e as Error).message}` });
 if (step.requiresApproval) {
 incident.status = 'triaging';
 }
 }
 }
 } else if (step.requiresApproval) {
 incident.status = 'triaging';
 incident.timeline.push({ timestamp: Date.now(), type: 'awaiting_approval', description: `منتظر تأیید برای: ${step.name}` });
 }

 incidents.set(incidentId, incident);
}

export function approveStep(incidentId: string, stepId: string, approver: string): boolean {
 const incident = incidents.get(incidentId);
 if (!incident || incident.currentStepId!== stepId) return false;
 incident.timeline.push({ timestamp: Date.now(), type: 'approved', description: `تأیید شد توسط ${approver}` });
 // اجرای step با action
 const playbook = playbooks.get(incident.playbookId!);
 const step = playbook?.steps.find(s => s.id === stepId);
 if (step?.action) {
 const handler = actionHandlers.get(step.action);
 if (handler) handler(incident, step);
 }
 if (step?.nextStepId) runPlaybookStep(incidentId, step.nextStepId);
 return true;
}

export function escalateIncident(incidentId: string, newSeverity: IncidentSeverity, reason: string): void {
 const incident = incidents.get(incidentId);
 if (!incident) return;
 incident.severity = newSeverity;
 incident.timeline.push({ timestamp: Date.now(), type: 'escalation', description: `ارتقا به ${newSeverity}: ${reason}` });
 incident.updatedAt = Date.now();
 // اعلان به مدیران
 if (newSeverity === 'critical') {
 eventBus.publish('security.incident.escalated', incident, { source: 'ir' });
 }
}

export function closeIncident(incidentId: string, resolution: string, postmortem?: string): void {
 const incident = incidents.get(incidentId);
 if (!incident) return;
 incident.status = 'closed';
 incident.closedAt = Date.now();
 incident.postmortem = postmortem;
 incident.timeline.push({ timestamp: Date.now(), type: 'closed', description: `بسته شد: ${resolution}` });
 // لغو runner فعال
 const runner = activeRunners.get(incidentId);
 if (runner) {
 clearTimeout(runner);
 activeRunners.delete(incidentId);
 }
}

// ---------- گزارش‌گیری ----------
export function getIncidentStats(): {
 total: number;
 byStatus: Record<IncidentStatus, number>;
 bySeverity: Record<IncidentSeverity, number>;
 avgResolutionTimeMs: number;
 openIncidents: number;
} {
 const stats = {
 total: incidents.size,
 byStatus: {} as Record<IncidentStatus, number>,
 bySeverity: {} as Record<IncidentSeverity, number>,
 avgResolutionTimeMs: 0,
 openIncidents: 0,
 };
 let totalResolutionTime = 0;
 let resolvedCount = 0;
 for (const inc of incidents.values()) {
 stats.byStatus[inc.status] = (stats.byStatus[inc.status] || 0) + 1;
 stats.bySeverity[inc.severity] = (stats.bySeverity[inc.severity] || 0) + 1;
 if (inc.status!== 'closed' && inc.status!== 'false_positive') stats.openIncidents++;
 if (inc.closedAt) {
 totalResolutionTime += inc.closedAt - inc.createdAt;
 resolvedCount++;
 }
 }
 stats.avgResolutionTimeMs = resolvedCount > 0? totalResolutionTime / resolvedCount: 0;
 return stats;
}

// ---------- playbook‌های پیش‌فرض ----------
export function registerDefaultPlaybooks() {
 createPlaybook({
 name: 'پاسخ به brute-force ورود',
 description: 'تشخیص و مسدودسازی تلاش‌های brute-force ورود',
 triggerEvent: 'login_blocked',
 severity: 'high',
 entryStepId: 's1',
 estimatedResolutionTime: 15,
 steps: [
 { id: 's1', name: 'مسدودسازی IP', description: 'IP مشکوک مسدود می‌شود', type: 'automatic', action: 'block_ip', nextStepId: 's2' },
 { id: 's2', name: 'اطلاع‌رسانی به مدیر', description: 'ارسال هشدار به تیم امنیت', type: 'automatic', action: 'notify_admin', nextStepId: 's3' },
 { id: 's3', name: 'جمع‌آوری شواهد', description: 'گرفتن snapshot از لاگ‌ها', type: 'automatic', action: 'collect_forensics', nextStepId: 's4' },
 { id: 's4', name: 'بستن حادثه', description: 'حادثه بسته می‌شود', type: 'manual', requiresApproval: true },
 ],
 });

 createPlaybook({
 name: 'پاسخ به نشست مشکوک',
 description: 'تشخیص نشست غیرعادی و توقف آن',
 triggerEvent: 'impossible_travel',
 severity: 'critical',
 entryStepId: 'i1',
 estimatedResolutionTime: 30,
 steps: [
 { id: 'i1', name: 'لغو همه‌ی نشست‌ها', description: 'تمام نشست‌های کاربر لغو می‌شوند', type: 'automatic', action: 'revoke_sessions', nextStepId: 'i2' },
 { id: 'i2', name: 'الزام MFA', description: 'کاربر باید MFA انجام دهد', type: 'automatic', action: 'require_mfa', nextStepId: 'i3' },
 { id: 'i3', name: 'اطلاع‌رسانی به کاربر', description: 'ارسال پیام به کاربر', type: 'automatic', action: 'notify_user', nextStepId: 'i4' },
 { id: 'i4', name: 'اطلاع‌رسانی به مدیر', description: 'اطلاع به تیم امنیت', type: 'automatic', action: 'notify_admin', nextStepId: 'i5' },
 { id: 'i5', name: 'جمع‌آوری شواهد', description: 'snapshot از وضعیت', type: 'automatic', action: 'snapshot_state', nextStepId: 'i6' },
 { id: 'i6', name: 'بررسی دستی', description: 'نیاز به بررسی توسط تحلیل‌گر', type: 'manual', requiresApproval: true },
 ],
 });

 createPlaybook({
 name: 'پاسخ به خروجی داده‌ی حجیم',
 description: 'تشخیص و محدودسازی خروجی غیرمجاز داده',
 triggerEvent: 'bulk_data_access',
 severity: 'high',
 entryStepId: 'd1',
 estimatedResolutionTime: 60,
 steps: [
 { id: 'd1', name: 'توقف خروجی‌ها', description: 'خروجی داده متوقف می‌شود', type: 'automatic', action: 'isolate_resource', nextStepId: 'd2' },
 { id: 'd2', name: 'تعلیق کاربر', description: 'حساب کاربر موقتاً تعلیق می‌شود', type: 'automatic', action: 'suspend_user', requiresApproval: true },
 { id: 'd3', name: 'اطلاع‌رسانی', description: 'اطلاع به مدیر', type: 'automatic', action: 'notify_admin', nextStepId: 'd4' },
 { id: 'd4', name: 'بررسی audit log', description: 'بررسی دستی لاگ‌ها', type: 'manual', requiresApproval: true },
 ],
 });
}
