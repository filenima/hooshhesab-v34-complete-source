"use client";

import dynamic from "next/dynamic";

const ToastQueue = dynamic(
 () => import("@/components/ui/toast-queue").then((m) => ({ default: m.ToastQueue })),
 { ssr: false }
);

export default function ToastQueueWrapper() {
 return <ToastQueue />;
}
