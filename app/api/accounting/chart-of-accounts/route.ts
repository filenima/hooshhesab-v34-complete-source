import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/accounting/chart-of-accounts
 *
 * بازگرداندن کدینگ حساب‌ها به‌صورت ساختار سه‌سطحی (گروه > حساب > معین).
 * SECURITY (C1): احراز هویت اجباری — tenant از auth context گرفته می‌شود.
 *
 * Response shape:
 * { success: true, data: AccountNode[] }
 * AccountNode = { code, name, level, nature?, balance?, children? }
 */

interface AccountNode {
 code: string;
 name: string;
 level: "group" | "account" | "subaccount";
 nature?: "debit" | "credit";
 balance?: number;
 children?: AccountNode[];
}

export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tid = ctx.tenantId;

 // واکشی گروه‌ها + حساب‌ها + معین‌ها به‌صورت همزمان
 const [groups, accounts, subAccounts] = await Promise.all([
 db.accountGroup.findMany({
 where: { tenantId: tid },
 orderBy: { code: "asc" },
 select: {
 id: true,
 code: true,
 name: true,
 type: true,
 nature: true,
 order: true,
 },
 }),
 db.account.findMany({
 where: { tenantId: tid },
 orderBy: { code: "asc" },
 select: {
 id: true,
 code: true,
 name: true,
 groupId: true,
 nature: true,
 balanceType: true,
 },
 }),
 db.subAccount.findMany({
 where: { tenantId: tid },
 orderBy: { code: "asc" },
 select: {
 id: true,
 code: true,
 name: true,
 accountId: true,
 },
 }),
 ]);

 // اگر هیچ داده‌ای در DB نبود، schema پیش‌فرض ایرانی را برمی‌گردانیم
 if (groups.length === 0) {
 return NextResponse.json({
 success: true,
 data: defaultPersianChart(),
 });
 }

 // ساخت درخت: groups accounts subAccounts
 const tree: AccountNode[] = groups.map((g) => {
 const childAccounts: AccountNode[] = accounts
.filter((a) => a.groupId === g.id)
.map((a) => {
 const childSubs: AccountNode[] = subAccounts
.filter((s) => s.accountId === a.id)
.map((s) => ({
 code: s.code,
 name: s.name,
 level: "subaccount" as const,
 }));
 return {
 code: a.code,
 name: a.name,
 level: "account" as const,
 nature: (a.nature.toLowerCase() === "debit"? "debit": "credit") as
 | "debit"
 | "credit",
 children: childSubs.length > 0? childSubs: undefined,
 };
 });
 return {
 code: g.code,
 name: g.name,
 level: "group" as const,
 nature: (g.nature.toLowerCase() === "debit"? "debit": "credit") as
 | "debit"
 | "credit",
 children: childAccounts.length > 0? childAccounts: undefined,
 };
 });

 return NextResponse.json({ success: true, data: tree });
 } catch (err) {
 console.error("[chart-of-accounts] error:", err);
 return NextResponse.json(
 {
 success: false,
 error:
 err instanceof Error
? err.message
: "خطا در دریافت کدینگ حساب‌ها",
 },
 { status: 500 }
 );
 }
}

/**
 * کدینگ استاندارد ایرانی (الگوی استاندارد سازمان حسابرسی).
 * در صورت خالی بودن دیتابیس، به‌عنوان نقطه شروع استفاده می‌شود.
 */
function defaultPersianChart(): AccountNode[] {
 return [
 {
 code: "1",
 name: "دارایی‌ها",
 level: "group",
 nature: "debit",
 children: [
 {
 code: "11",
 name: "دارایی‌های جاری",
 level: "account",
 nature: "debit",
 children: [
 { code: "1101", name: "وجود نقد و بانک", level: "subaccount" },
 { code: "1102", name: "بدهکاران تجاری", level: "subaccount" },
 { code: "1103", name: "حساب‌های پیش‌پرداخت", level: "subaccount" },
 { code: "1104", name: "موجودی کالا", level: "subaccount" },
 ],
 },
 {
 code: "12",
 name: "دارایی‌های غیرجاری",
 level: "account",
 nature: "debit",
 children: [
 { code: "1201", name: "دارایی‌های ثابت مشهود", level: "subaccount" },
 { code: "1202", name: "دارایی‌های نامشهود", level: "subaccount" },
 { code: "1203", name: "سرمایه‌گذاری‌های بلندمدت", level: "subaccount" },
 ],
 },
 ],
 },
 {
 code: "2",
 name: "بدهی‌ها",
 level: "group",
 nature: "credit",
 children: [
 {
 code: "21",
 name: "بدهی‌های جاری",
 level: "account",
 nature: "credit",
 children: [
 { code: "2101", name: "بستانکاران تجاری", level: "subaccount" },
 { code: "2102", name: "هزینه‌های پرداختنی", level: "subaccount" },
 { code: "2103", name: "پیش‌دریافت‌ها", level: "subaccount" },
 { code: "2104", name: "مالیات پرداختنی", level: "subaccount" },
 ],
 },
 {
 code: "22",
 name: "بدهی‌های غیرجاری",
 level: "account",
 nature: "credit",
 children: [
 { code: "2201", name: "وام‌های بلندمدت", level: "subaccount" },
 { code: "2202", name: "اسناد پرداختنی بلندمدت", level: "subaccount" },
 ],
 },
 ],
 },
 {
 code: "3",
 name: "حقوق صاحبان سهام",
 level: "group",
 nature: "credit",
 children: [
 {
 code: "31",
 name: "سرمایه",
 level: "account",
 nature: "credit",
 children: [
 { code: "3101", name: "سرمایه ثبت‌شده", level: "subaccount" },
 { code: "3102", name: "اندوخته قانونی", level: "subaccount" },
 { code: "3103", name: "سود انباشته", level: "subaccount" },
 ],
 },
 ],
 },
 {
 code: "4",
 name: "درآمدها",
 level: "group",
 nature: "credit",
 children: [
 {
 code: "41",
 name: "درآمدهای عملیاتی",
 level: "account",
 nature: "credit",
 children: [
 { code: "4101", name: "فروش کالا", level: "subaccount" },
 { code: "4102", name: "فروش خدمات", level: "subaccount" },
 { code: "4103", name: "بازگشتی از فروش", level: "subaccount" },
 ],
 },
 {
 code: "42",
 name: "درآمدهای غیرعملیاتی",
 level: "account",
 nature: "credit",
 children: [
 { code: "4201", name: "سود تسهیماتی", level: "subaccount" },
 { code: "4202", name: "سود سپرده‌های بانکی", level: "subaccount" },
 ],
 },
 ],
 },
 {
 code: "5",
 name: "هزینه‌ها",
 level: "group",
 nature: "debit",
 children: [
 {
 code: "51",
 name: "بهای تمام‌شده",
 level: "account",
 nature: "debit",
 children: [
 { code: "5101", name: "بهای تمام‌شده فروش کالا", level: "subaccount" },
 { code: "5102", name: "بهای تمام‌شده خدمات", level: "subaccount" },
 ],
 },
 {
 code: "52",
 name: "هزینه‌های فروش و اداری",
 level: "account",
 nature: "debit",
 children: [
 { code: "5201", name: "حقوق و دستمزد", level: "subaccount" },
 { code: "5202", name: "هزینه آب، برق، گاز", level: "subaccount" },
 { code: "5203", name: "هزینه استهلاک", level: "subaccount" },
 { code: "5204", name: "هزینه تبلیغات", level: "subaccount" },
 ],
 },
 ],
 },
 ];
}
