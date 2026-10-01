/**
 * هوش — CQRS Command Bus
 * =============================================================
 * Command Bus برای هندل write-side operations.
 *
 * هر Command به یک CommandHandler نگاشته می‌شود. هندلر در یک registry
 * ثبت می‌شوند و CommandBus با lookup آن‌ها را اجرا می‌کند.
 *
 * Usage:
 * registerCommandHandler(new CreateInvoiceHandler());
 * const result = await commandBus.execute(new CreateInvoiceCommand(payload));
 */

import { appendEvent } from "@/lib/event-store";

// ============ Command ============

export interface Command {
 readonly type: string;
 readonly tenantId: string;
 readonly userId?: string;
 readonly payload: unknown;
}

export interface CommandResult<T = unknown> {
 success: boolean;
 data?: T;
 error?: string;
 eventId?: string;
 durationMs: number;
}

export interface CommandHandler<T extends Command = Command> {
 readonly commandType: string;
 handle(command: T): Promise<{ data: unknown; event?: { aggregateType: string; aggregateId: string; eventType: string; data: unknown } }>;
}

// ============ Command Bus ============

const handlerRegistry = new Map<string, CommandHandler>();

/**
 * ثبت یک هندلر برای نوع command.
 */
export function registerCommandHandler(handler: CommandHandler): void {
 handlerRegistry.set(handler.commandType, handler);
}

/**
 * اجرای یک command.
 * ۱) یافتن هندلر
 * ۲) اجرای هندلر
 * ۳) در صورت بازگرداندن event، آن را به event store اضافه می‌کند
 */
export async function executeCommand<T extends Command>(
 command: T
): Promise<CommandResult> {
 const start = Date.now();
 const handler = handlerRegistry.get(command.type);
 if (!handler) {
 return {
 success: false,
 error: `هندلری برای command نوع "${command.type}" ثبت نشده است`,
 durationMs: Date.now() - start,
 };
 }

 try {
 const result = await handler.handle(command);

 // اگر هندلر event برگرداند، به event store اضافه کن
 let eventId: string | undefined;
 if (result.event) {
 const stored = await appendEvent({
 tenantId: command.tenantId,
 aggregateType: result.event.aggregateType,
 aggregateId: result.event.aggregateId,
 eventType: result.event.eventType,
 data: result.event.data,
 metadata: {
 userId: command.userId,
 source: "command-bus",
 correlationId: command.type,
 },
 });
 eventId = stored.id;
 }

 return {
 success: true,
 data: result.data,
 eventId,
 durationMs: Date.now() - start,
 };
 } catch (err) {
 const message = err instanceof Error? err.message: "خطای ناشناخته در اجرای command";
 console.error(`[command-bus] ${command.type} failed:`, err);
 return {
 success: false,
 error: message,
 durationMs: Date.now() - start,
 };
 }
}

/**
 * اجرای batch از commands (به‌صورت ترتیبی برای حفظ ترتیب eventها).
 */
export async function executeCommands(
 commands: Command[]
): Promise<CommandResult[]> {
 const results: CommandResult[] = [];
 for (const cmd of commands) {
 results.push(await executeCommand(cmd));
 }
 return results;
}

/**
 * لیست همه‌ی command types ثبت‌شده.
 */
export function getRegisteredCommandTypes(): string[] {
 return Array.from(handlerRegistry.keys());
}

/**
 * پاک کردن registry (برای تست).
 */
export function clearCommandHandlers(): void {
 handlerRegistry.clear();
}
