import { NextResponse } from "next/server";

// ریشه‌ی /api — هدایت به مستندات OpenAPI
export async function GET() {
  return NextResponse.json({
    name: "هوش API",
    version: "1.0",
    docs: "/api-docs",
    openapi: "/api-docs/openapi.json",
    health: "/api/health",
  });
}
