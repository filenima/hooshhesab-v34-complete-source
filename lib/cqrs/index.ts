/**
 * هوش — CQRS Index
 * =============================================================
 * نقطه‌ی ورود واحد برای CQRS module.
 *
 * Import این فایل در startup کافی است تا همه‌ی handlers ثبت شوند.
 */

export {
 type Command,
 type CommandResult,
 type CommandHandler,
 registerCommandHandler,
 executeCommand,
 executeCommands,
 getRegisteredCommandTypes,
 clearCommandHandlers,
} from "./command-bus";

export {
 type Query,
 type QueryResult,
 type QueryHandler,
 registerQueryHandler,
 executeQuery,
 invalidateQueryCache,
 clearQueryCache,
 getQueryCacheStats,
 getRegisteredQueryTypes,
 clearQueryHandlers,
} from "./query-bus";

export { registerDefaultCommandHandlers } from "./handlers/commands";
export { registerDefaultQueryHandlers } from "./handlers/queries";

/**
 * ثبت همه‌ی handlers (commands + queries).
 * در startup فراخوانی شود.
 */
export function bootstrapCQRS(): void {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const { registerDefaultCommandHandlers } = require("./handlers/commands") as {
 registerDefaultCommandHandlers: () => void;
 };
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const { registerDefaultQueryHandlers } = require("./handlers/queries") as {
 registerDefaultQueryHandlers: () => void;
 };
 registerDefaultCommandHandlers();
 registerDefaultQueryHandlers();
}
