// Helper برای serialization BigInt در JSON responses
// Prisma BigInt را نمی‌تواند مستقیم serialize کند

export function serializeBigInt(obj: unknown): unknown {
 if (obj === null || obj === undefined) return obj;
 if (typeof obj === "bigint") return Number(obj);
 if (Array.isArray(obj)) return obj.map(serializeBigInt);
 if (typeof obj === "object") {
 const result: Record<string, unknown> = {};
 for (const key of Object.keys(obj)) {
 result[key] = serializeBigInt(obj[key]);
 }
 return result;
 }
 return obj;
}

// JSON replacer برای BigInt
export const bigIntReplacer = (_key: string, value: unknown) =>
 typeof value === "bigint"? Number(value): value;
