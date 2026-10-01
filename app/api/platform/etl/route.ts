import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { runETLJob, getETLStatus, type ETLResult } from "@/lib/etl-pipeline";
import { getWarehouseStats } from "@/lib/warehouse";
import { readFile, stat } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

// GET /api/platform/etl — لیست ETL job ها + آمار انبار داده
// GET /api/platform/etl?file=hoshhesab-backup-xxx.json — دانلود فایل پشتیبان
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 // دانلود فایل پشتیبان تولیدشده توسط export_full
 const { searchParams } = new URL(req.url);
 const file = searchParams.get("file");
 if (file) {
 // فقط نام فایل‌های تولیدشده توسط export_full مجاز است (بدون path traversal)
 if (!/^hoshhesab-backup-[A-Za-z0-9-]+\.json$/.test(file)) {
 return NextResponse.json(
 { success: false, error: "نام فایل نامعتبر است" },
 { status: 400 }
 );
 }
 const fullPath = path.join(process.cwd(), "backups", file);
 try {
 const st = await stat(fullPath);
 if (!st.isFile()) throw new Error("not a file");
 const content = await readFile(fullPath, "utf8");
 return new NextResponse(content, {
 status: 200,
 headers: {
 "Content-Type": "application/json; charset=utf-8",
 "Content-Disposition": `attachment; filename="${file}"`,
 },
 });
 } catch {
 return NextResponse.json(
 { success: false, error: "فایل پشتیبان یافت نشد" },
 { status: 404 }
 );
 }
 }

 const [jobs, warehouseStats] = await Promise.all([
 getETLStatus(),
 getWarehouseStats(),
 ]);
 return NextResponse.json({
 success: true,
 data: {
 jobs,
 warehouse: warehouseStats,
 },
 });
 } catch (error) {
 console.error("ETL status error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت وضعیت ETL" },
 { status: 500 }
 );
 }
}

// POST /api/platform/etl — اجرای یک ETL job
// body: { jobName, runAll?, data? } — data فقط برای import_full (محتوای JSON خروجی export_full)
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const { jobName, runAll, data } = body as {
 jobName?: string;
 runAll?: boolean;
 data?: unknown;
 };

 if (runAll) {
 // اجرای همه‌ی job ها (به‌جز job های دستی مثل import_full که payload می‌خواهند)
 const results: ETLResult[] = [];
 const jobs = await getETLStatus();
 for (const job of jobs) {
 if (job.name === "import_full") continue;
 const result = await runETLJob(job.name);
 results.push(result);
 }
 return NextResponse.json({ success: true, data: { results } });
 }

 if (!jobName) {
 return NextResponse.json(
 { success: false, error: "jobName یا runAll الزامی است" },
 { status: 400 }
 );
 }

 const result = await runETLJob(jobName, { data });
 const ok = result.status === "success";
 return NextResponse.json(
 { success: ok, data: result },
 { status: ok? 200: 400 }
 );
 } catch (error) {
 console.error("ETL run error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای ETL job" },
 { status: 500 }
 );
 }
}
