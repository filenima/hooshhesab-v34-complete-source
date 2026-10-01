export default function Loading() {
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
 <div style={{ textAlign: "center" }}>
 {/* Spinner */}
 <div
 style={{
 width: "48px",
 height: "48px",
 margin: "0 auto 1.25rem",
 border: "4px solid #d1fae5",
 borderTopColor: "#10b981",
 borderRadius: "50%",
 animation: "hoshHesabSpin 0.8s linear infinite",
 }}
 />

 {/* Brand — عمداً h1 نیست: این کامپوننت fallback استریمی است و
 با H1 صفحه اصلی تداخل سئویی ایجاد می‌کرد (دو H1 در HTML خام) */}
 <div
 style={{
 fontSize: "1.25rem",
 fontWeight: 700,
 color: "#10b981",
 marginBottom: "0.5rem",
 }}
 >
 هوش
 </div>

 <p
 style={{
 fontSize: "0.875rem",
 color: "#6b7280",
 }}
 >
 در حال بارگذاری...
 </p>

 {/* Keyframes injected via style tag */}
 <style>{`
 @keyframes hoshHesabSpin {
 0% { transform: rotate(0deg); }
 100% { transform: rotate(360deg); }
 }
 `}</style>
 </div>
 </div>
 );
}
