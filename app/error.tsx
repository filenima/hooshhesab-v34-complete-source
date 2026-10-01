"use client";

import { useEffect } from "react";

export default function ErrorPage({
 error,
 reset,
}: {
 error: Error & { digest?: string };
 reset: () => void;
}) {
 useEffect(() => {
 console.error("هوش — خطای رندر:", error);
 }, [error]);

 return (
 <div
 dir="rtl"
 style={{
 minHeight: "100vh",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 fontFamily:
 'Vazirmatn, "Segoe UI", Tahoma, "Microsoft JhengHei", sans-serif',
 background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0fdfa 100%)",
 padding: "1.5rem",
 }}
 >
 <div
 style={{
 maxWidth: "480px",
 width: "100%",
 textAlign: "center",
 background: "#ffffff",
 borderRadius: "1rem",
 boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
 padding: "2.5rem 2rem",
 }}
 >
 {/* Icon */}
 <div
 style={{
 width: "72px",
 height: "72px",
 margin: "0 auto 1.25rem",
 borderRadius: "50%",
 background: "#fef2f2",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 fontSize: "2rem",
 }}
 >
 
 </div>

 {/* Brand */}
 <h1
 style={{
 fontSize: "1.5rem",
 fontWeight: 700,
 color: "#10b981",
 marginBottom: "0.5rem",
 letterSpacing: "-0.02em",
 }}
 >
 هوش
 </h1>

 {/* Message */}
 <h2
 style={{
 fontSize: "1.125rem",
 fontWeight: 600,
 color: "#1f2937",
 marginBottom: "0.5rem",
 }}
 >
 خطایی رخ داده است
 </h2>

 <p
 style={{
 fontSize: "0.875rem",
 color: "#6b7280",
 lineHeight: 1.7,
 marginBottom: "1.5rem",
 }}
 >
 متأسفانه در پردازش درخواست شما مشکلی پیش آمده است.
 <br />
 لطفاً دوباره تلاش کنید یا به صفحه اصلی بازگردید.
 </p>

 {/* Error digest (if available) */}
 {error.digest && (
 <p
 style={{
 fontSize: "0.75rem",
 color: "#9ca3af",
 marginBottom: "1rem",
 direction: "ltr",
 fontFamily: "monospace",
 }}
 >
 Digest: {error.digest}
 </p>
 )}

 {/* Buttons */}
 <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
 <button
 onClick={reset}
 style={{
 padding: "0.75rem 1.5rem",
 borderRadius: "0.5rem",
 border: "none",
 background: "#10b981",
 color: "#ffffff",
 fontSize: "0.9375rem",
 fontWeight: 600,
 cursor: "pointer",
 transition: "background 0.2s",
 }}
 onMouseOver={(e) => (e.currentTarget.style.background = "#059669")}
 onMouseOut={(e) => (e.currentTarget.style.background = "#10b981")}
 >
 تلاش مجدد
 </button>

 <a
 href="/"
 style={{
 display: "inline-block",
 padding: "0.75rem 1.5rem",
 borderRadius: "0.5rem",
 border: "1px solid #d1d5db",
 background: "#ffffff",
 color: "#374151",
 fontSize: "0.9375rem",
 fontWeight: 500,
 textDecoration: "none",
 transition: "border-color 0.2s, color 0.2s",
 }}
 onMouseOver={(e) => {
 e.currentTarget.style.borderColor = "#10b981";
 e.currentTarget.style.color = "#10b981";
 }}
 onMouseOut={(e) => {
 e.currentTarget.style.borderColor = "#d1d5db";
 e.currentTarget.style.color = "#374151";
 }}
 >
 بازگشت به صفحه اصلی
 </a>
 </div>
 </div>
 </div>
 );
}
