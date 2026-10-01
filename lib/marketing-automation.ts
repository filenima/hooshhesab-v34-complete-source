/**
 * marketing-automation.ts — اجرای کمپین‌های مبتنی بر trigger برای هوش
 * قابلیت‌ها: تعریف کمپین، triggerها، journey، multi-step، AB testing
 */

import { eventBus } from '@/lib/event-bus';

export type TriggerType =
 | 'event' // بر اساس رویداد
 | 'schedule' // زمان‌بندی شده
 | 'segment' // ورود به یک بخش
 | 'threshold' // رسیدن به یک آستانه
 | 'inactivity' // عدم فعالیت
 | 'property_change'; // تغییر ویژگی

export type ActionType =
 | 'send_email'
 | 'send_sms'
 | 'send_push'
 | 'webhook'
 | 'add_tag'
 | 'remove_tag'
 | 'update_property'
 | 'add_to_segment'
 | 'remove_from_segment'
 | 'wait'
 | 'notify_slack'
 | 'ai_message';

export interface CampaignAction {
 id: string;
 type: ActionType;
 config: Record<string, unknown>;
 nextActionId?: string; // برای flow
 condition?: { // branch شرطی
 expression: string; // JS expression
 trueNextId?: string;
 falseNextId?: string;
 };
}

export interface CampaignStep {
 actionId: string;
 delayMinutes: number; // تأخیر قبل از اجرا
}

export interface Campaign {
 id: string;
 name: string;
 description?: string;
 status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
 trigger: {
 type: TriggerType;
 config: Record<string, unknown>;
 };
 entryActionId: string;
 actions: CampaignAction[];
 goals: Array<{ metric: string; target: number }>;
 abTest?: {
 enabled: boolean;
 variants: Array<{ id: string; weight: number; entryActionId: string }>;
 metric: string;
 };
 schedule?: {
 startDate?: string;
 endDate?: string;
 timezone?: string;
 };
 createdAt: number;
 stats: {
 enrolled: number;
 completed: number;
 exited: number;
 converted: number;
 };
}

// ---------- حافظه‌ی کمپین‌ها ----------
const campaigns = new Map<string, Campaign>();
const enrollments = new Map<string, { campaignId: string; userId: string; tenantId: string; currentActionId: string | null; enteredAt: number; lastExecutedAt?: number; converted: boolean; properties: Record<string, unknown> }>();

let seq = 0;
function nextId(prefix: string): string {
 seq++;
 return `${prefix}_${Date.now()}_${seq}`;
}

// ---------- مدیریت کمپین ----------
export function createCampaign(data: Omit<Campaign, 'id' | 'createdAt' | 'stats'>): Campaign {
 const campaign: Campaign = {
...data,
 id: nextId('camp'),
 createdAt: Date.now(),
 stats: { enrolled: 0, completed: 0, exited: 0, converted: 0 },
 };
 campaigns.set(campaign.id, campaign);
 // اگر فعال است، trigger را ثبت کن
 if (campaign.status === 'active') {
 registerCampaignTrigger(campaign);
 }
 return campaign;
}

export function updateCampaign(id: string, updates: Partial<Campaign>): Campaign | null {
 const campaign = campaigns.get(id);
 if (!campaign) return null;
 Object.assign(campaign, updates);
 if (updates.status === 'active') {
 registerCampaignTrigger(campaign);
 }
 campaigns.set(id, campaign);
 return campaign;
}

export function deleteCampaign(id: string): boolean {
 const campaign = campaigns.get(id);
 if (!campaign) return false;
 campaigns.delete(id);
 // حذف enrollments مرتبط
 for (const [eid, e] of enrollments) {
 if (e.campaignId === id) enrollments.delete(eid);
 }
 return true;
}

export function getCampaign(id: string): Campaign | undefined {
 return campaigns.get(id);
}

export function listCampaigns(filter?: { status?: Campaign['status']; tenantId?: string }): Campaign[] {
 return Array.from(campaigns.values()).filter(c =>
 (!filter?.status || c.status === filter.status) &&
 (!filter?.tenantId || true) // در عمل: بررسی tenantId از طریق trigger config
 );
}

// ---------- ثبت trigger ----------
function registerCampaignTrigger(campaign: Campaign) {
 const { type, config } = campaign.trigger;

 if (type === 'event') {
 const eventType = config.eventType as string;
 eventBus.subscribe(eventType, async (event) => {
 const userId = (event.payload as { userId?: string }).userId;
 const tenantId = event.tenantId;
 if (userId && tenantId) {
 await enrollUser(campaign.id, userId, tenantId, event.payload);
 }
 });
 } else if (type === 'schedule') {
 // در عمل: cron job scheduler
 const interval = (config.intervalMinutes as number) || 1440; // پیش‌فرض روزانه
 setInterval(() => {
 // یافتن کاربرانی که مطابقت دارند
 console.log(`[marketing] scheduled tick for campaign ${campaign.id}`);
 }, interval * 60_000);
 } else if (type === 'inactivity') {
 const days = (config.days as number) || 7;
 eventBus.subscribe('user.login', async (event) => {
 // در عمل: بررسی آخرین فعالیت کاربر
 void days;
 void event;
 });
 }
}

// ---------- enroll کاربر ----------
export async function enrollUser(
 campaignId: string,
 userId: string,
 tenantId: string,
 triggerPayload: unknown
): Promise<string | null> {
 const campaign = campaigns.get(campaignId);
 if (!campaign || campaign.status!== 'active') return null;

 // انتخاب variant برای AB test
 let entryActionId = campaign.entryActionId;
 if (campaign.abTest?.enabled) {
 const rand = Math.random() * 100;
 let cumulative = 0;
 for (const variant of campaign.abTest.variants) {
 cumulative += variant.weight;
 if (rand < cumulative) {
 entryActionId = variant.entryActionId;
 break;
 }
 }
 }

 const enrollmentId = nextId('enr');
 enrollments.set(enrollmentId, {
 campaignId,
 userId,
 tenantId,
 currentActionId: entryActionId,
 enteredAt: Date.now(),
 converted: false,
 properties: { trigger: triggerPayload },
 });

 campaign.stats.enrolled++;
 campaigns.set(campaignId, campaign);

 // اجرای action اولیه
 await executeAction(enrollmentId, entryActionId);

 return enrollmentId;
}

// ---------- اجرای اکشن ----------
async function executeAction(enrollmentId: string, actionId: string | null): Promise<void> {
 if (!actionId) return;
 const enrollment = enrollments.get(enrollmentId);
 if (!enrollment) return;
 const campaign = campaigns.get(enrollment.campaignId);
 if (!campaign) return;
 const action = campaign.actions.find(a => a.id === actionId);
 if (!action) return;

 // بررسی شرط
 let nextActionId = action.nextActionId;
 if (action.condition) {
 try {
 // اجرای expression ساده
 const expr = action.condition.expression;
 const matches = expr.match(/^(\w+)\s*(==|>=|<=|>|<)\s*(.+)$/);
 let result = true;
 if (matches) {
 const [, field, op, value] = matches;
 const actual = enrollment.properties[field];
 const expected = isNaN(Number(value))? value.replace(/^["']|["']$/g, ''): Number(value);
 switch (op) {
 case '==': result = actual == expected; break;
 case '>=': result = Number(actual) >= Number(expected); break;
 case '<=': result = Number(actual) <= Number(expected); break;
 case '>': result = Number(actual) > Number(expected); break;
 case '<': result = Number(actual) < Number(expected); break;
 }
 }
 nextActionId = result? action.condition.trueNextId: action.condition.falseNextId;
 } catch {
 // در صورت خطا، مسیر پیش‌فرض
 }
 }

 // اجرای اکشن
 try {
 await performAction(action, enrollment);
 } catch (e) {
 console.error(`[marketing] action failed for ${enrollmentId}:`, e);
 }

 enrollment.currentActionId = nextActionId?? null;
 enrollment.lastExecutedAt = Date.now();
 enrollments.set(enrollmentId, enrollment);

 if (!nextActionId) {
 // پایان journey
 campaign.stats.completed++;
 campaigns.set(campaign.id, campaign);
 } else {
 // ادامه‌ی flow
 const nextAction = campaign.actions.find(a => a.id === nextActionId);
 if (nextAction) {
 // برای سادگی: بدون تأخیر
 await executeAction(enrollmentId, nextActionId);
 }
 }
}

async function performAction(action: CampaignAction, enrollment: { userId: string; tenantId: string; properties: Record<string, unknown> }): Promise<void> {
 switch (action.type) {
 case 'send_email':
 console.log(`[marketing] email sent to user ${enrollment.userId}: template=${action.config.templateId}`);
 break;
 case 'send_sms':
 console.log(`[marketing] SMS sent to user ${enrollment.userId}: body=${action.config.body}`);
 break;
 case 'send_push':
 console.log(`[marketing] push to user ${enrollment.userId}: title=${action.config.title}`);
 break;
 case 'webhook':
 if (action.config.url) {
 await fetch(action.config.url as string, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({ userId: enrollment.userId, tenantId: enrollment.tenantId,...enrollment.properties }),
 }).catch(() => null);
 }
 break;
 case 'add_tag':
 enrollment.properties._tags = [...((enrollment.properties._tags as string[]) || []), action.config.tag as string];
 break;
 case 'remove_tag':
 enrollment.properties._tags = ((enrollment.properties._tags as string[]) || []).filter(t => t!== action.config.tag);
 break;
 case 'update_property':
 enrollment.properties[action.config.key as string] = action.config.value;
 break;
 case 'add_to_segment':
 enrollment.properties._segment = action.config.segment;
 break;
 case 'wait':
 await new Promise(r => setTimeout(r, (action.config.minutes as number) * 60_000));
 break;
 case 'notify_slack':
 if (process.env.SLACK_WEBHOOK) {
 await fetch(process.env.SLACK_WEBHOOK, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({ text: `[کمپین] کاربر ${enrollment.userId} وارد مرحله شد` }),
 }).catch(() => null);
 }
 break;
 case 'ai_message':
 console.log(`[marketing] AI message generated for user ${enrollment.userId}`);
 break;
 }
}

// ---------- گزارش‌گیری ----------
export function getCampaignStats(campaignId: string): Campaign['stats'] | null {
 const c = campaigns.get(campaignId);
 return c? c.stats: null;
}

export function getEnrollment(enrollmentId: string) {
 return enrollments.get(enrollmentId);
}

export function listEnrollments(campaignId?: string, limit = 50) {
 const list = Array.from(enrollments.values());
 const filtered = campaignId? list.filter(e => e.campaignId === campaignId): list;
 return filtered.slice(-limit);
}

// ---------- کمپین‌های آماده‌ی هوش ----------
export function registerDefaultCampaigns() {
 createCampaign({
 name: 'بازگرداندن کاربران غیرفعال',
 description: 'کاربرانی که ۷ روز وارد نشده‌اند، ایمیل دعوت دریافت می‌کنند',
 status: 'active',
 trigger: { type: 'inactivity', config: { days: 7 } },
 entryActionId: 'act1',
 actions: [
 { id: 'act1', type: 'send_email', config: { templateId: 'reengage_7d' }, nextActionId: 'act2' },
 { id: 'act2', type: 'wait', config: { minutes: 2880 /* ۲ روز */ } },
 { id: 'act3', type: 'send_sms', config: { body: 'به هوش برگردید — تخفیف ویژه' }, nextActionId: 'act4' },
 { id: 'act4', type: 'notify_slack', config: {} },
 ],
 goals: [{ metric: 'login', target: 100 }],
 });

 createCampaign({
 name: 'خوش‌آمدگویی به کاربران جدید',
 status: 'active',
 trigger: { type: 'event', config: { eventType: 'user.invited' } },
 entryActionId: 'w1',
 actions: [
 { id: 'w1', type: 'send_email', config: { templateId: 'welcome' }, nextActionId: 'w2' },
 { id: 'w2', type: 'wait', config: { minutes: 1440 } },
 { id: 'w3', type: 'send_email', config: { templateId: 'onboarding_tips' } },
 ],
 goals: [{ metric: 'first_invoice', target: 50 }],
 abTest: {
 enabled: true,
 variants: [
 { id: 'A', weight: 50, entryActionId: 'w1' },
 { id: 'B', weight: 50, entryActionId: 'w1' },
 ],
 metric: 'first_invoice',
 },
 });
}
