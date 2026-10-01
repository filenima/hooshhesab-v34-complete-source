import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";
import { decodeState } from "../nobatime/route";

export const runtime = "nodejs";

const NOBATIME_TOKEN_URL = "https://nobatime.ir/oauth/token";
const NOBATIME_USER_URL = "https://nobatime.ir/api/user";
const NOBATIME_BASE_URL = "https://nobatime.ir";

/**
 * GET /api/ecosystem/oauth/callback
 * - callback واقعی از Nobatime پس از تأیید کاربر
 * - params:?code=...&state=...
 * - تعویض code با access_token، ذخیره در EcosystemConnection
 * - redirect به /ecosystem با status
 */
export async function GET(req: NextRequest) {
 const url = new URL(req.url);
 const code = url.searchParams.get("code");
 const stateRaw = url.searchParams.get("state");
 const error = url.searchParams.get("error");

 const redirectBase = url.origin;

 // اگر Nobatime خطا برگرداند
 if (error) {
 const desc = url.searchParams.get("error_description") || error;
 return NextResponse.redirect(
 new URL(
 `/ecosystem?oauth_error=${encodeURIComponent(desc)}`,
 redirectBase
 )
 );
 }

 if (!code ||!stateRaw) {
 return NextResponse.redirect(
 new URL(
 `/ecosystem?oauth_error=${encodeURIComponent("code یا state یافت نشد")}`,
 redirectBase
 )
 );
 }

 const state = decodeState(stateRaw);
 if (!state) {
 return NextResponse.redirect(
 new URL(
 `/ecosystem?oauth_error=${encodeURIComponent("state نامعتبر یا منقضی")}`,
 redirectBase
 )
 );
 }

 // تأیید کاربر فعلی (با userId در state)
 const user = await db.user.findUnique({
 where: { id: state.userId },
 select: { id: true, tenantId: true, name: true, family: true, tenant: true },
 });
 if (!user || user.tenantId!== state.tenantId) {
 return NextResponse.redirect(
 new URL(
 `/ecosystem?oauth_error=${encodeURIComponent("کاربر یافت نشد")}`,
 redirectBase
 )
 );
 }

 const clientId = process.env.NOBATIME_CLIENT_ID;
 const clientSecret = process.env.NOBATIME_CLIENT_SECRET;
 const redirectUri =
 process.env.NOBATIME_REDIRECT_URI || `${url.origin}/api/ecosystem/oauth/callback`;

 // اگر OAuth پیکربندی نشده fallback به mock
 if (!clientId ||!clientSecret) {
 const ssoToken = crypto.randomBytes(32).toString("hex");
 await db.ecosystemConnection.upsert({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "NOBATIME" },
 },
 update: {
 status: "CONNECTED",
 ssoToken,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "mock",
 connectedAt: new Date().toISOString(),
 }),
 },
 create: {
 tenantId: user.tenantId,
 service: "NOBATIME",
 status: "CONNECTED",
 ssoToken,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "mock",
 connectedAt: new Date().toISOString(),
 }),
 },
 });
 return NextResponse.redirect(
 new URL(`/ecosystem?oauth_success=mock`, redirectBase)
 );
 }

 try {
 // تعویض code با access_token
 const tokenRes = await fetch(NOBATIME_TOKEN_URL, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({
 grant_type: "authorization_code",
 code,
 client_id: clientId,
 client_secret: clientSecret,
 redirect_uri: redirectUri,
 }),
 });

 if (!tokenRes.ok) {
 throw new Error(`token exchange failed: ${tokenRes.status}`);
 }

 const tokenJson = (await tokenRes.json()) as {
 access_token?: string;
 refresh_token?: string;
 expires_in?: number;
 token_type?: string;
 scope?: string;
 };

 const accessToken = tokenJson.access_token;
 if (!accessToken) {
 throw new Error("no access_token in response");
 }

 // دریافت اطلاعات کاربر
 let externalUserInfo: { id?: string; name?: string; email?: string } = {};
 try {
 const userRes = await fetch(NOBATIME_USER_URL, {
 headers: { Authorization: `Bearer ${accessToken}` },
 });
 if (userRes.ok) {
 externalUserInfo = (await userRes.json()) as {
 id?: string;
 name?: string;
 email?: string;
 };
 }
 } catch {
 /* ignore */
 }

 // ذخیره اتصال
 await db.ecosystemConnection.upsert({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "NOBATIME" },
 },
 update: {
 status: "CONNECTED",
 ssoToken: accessToken,
 externalId: externalUserInfo.id || `nobatime_${Date.now()}`,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "live",
 accessToken,
 refreshToken: tokenJson.refresh_token || null,
 expiresIn: tokenJson.expires_in || null,
 tokenType: tokenJson.token_type || "Bearer",
 scope: tokenJson.scope || "",
 externalUser: externalUserInfo,
 }),
 },
 create: {
 tenantId: user.tenantId,
 service: "NOBATIME",
 status: "CONNECTED",
 ssoToken: accessToken,
 externalId: externalUserInfo.id || `nobatime_${Date.now()}`,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "live",
 accessToken,
 refreshToken: tokenJson.refresh_token || null,
 expiresIn: tokenJson.expires_in || null,
 tokenType: tokenJson.token_type || "Bearer",
 scope: tokenJson.scope || "",
 externalUser: externalUserInfo,
 }),
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "OAUTH_NOBATIME_CALLBACK",
 entity: "EcosystemConnection",
 entityId: null,
 changes: JSON.stringify({
 service: "NOBATIME",
 mode: "live",
 externalUser: externalUserInfo,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.redirect(
 new URL(
 `/ecosystem?oauth_success=live&service=NOBATIME`,
 redirectBase
 )
 );
 } catch (err) {
 console.error("Nobatime OAuth callback error:", err);
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 return NextResponse.redirect(
 new URL(
 `/ecosystem?oauth_error=${encodeURIComponent(msg)}`,
 redirectBase
 )
 );
 }
}
