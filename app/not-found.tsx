import Link from "next/link";

export default function NotFound() {
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
 {/* 404 */}
 <div
 style={{
 fontSize: "4rem",
 fontWeight: 800,
 color: "#10b981",
 lineHeight: 1,
 marginBottom: "0.75rem",
 }}
 >
 ۴۰۴
 </div>

 {/* Brand */}
 <h1
 style={{
 fontSize: "1.5rem",
 fontWeight: 700,
 color: "#10b981",
 marginBottom: "0.75rem",
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
 صفحه مورد نظر یافت نشد
 </h2>

 <p
 style={{
 fontSize: "0.875rem",
 color: "#6b7280",
 lineHeight: 1.7,
 marginBottom: "1.5rem",
 }}
 >
 آدرس وارد شده معتبر نیست یا صفحه حذف شده است.
 <br />
 لطفاً به صفحه اصلی بازگردید.
 </p>

 {/* Link */}
 <Link
 href="/"
 style={{
 display: "inline-block",
 padding: "0.75rem 2rem",
 borderRadius: "0.5rem",
 border: "none",
 background: "#10b981",
 color: "#ffffff",
 fontSize: "0.9375rem",
 fontWeight: 600,
 textDecoration: "none",
 transition: "background 0.2s",
 }}
 >
 بازگشت به صفحه اصلی
 </Link>
 </div>
 </div>
 );
}
