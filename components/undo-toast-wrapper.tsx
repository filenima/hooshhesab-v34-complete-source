"use client";

import dynamic from "next/dynamic";

const UndoToastContainer = dynamic(
 () => import("@/components/ux/undo-toast").then((m) => ({ default: m.UndoToastContainer })),
 { ssr: false }
);

export default function UndoToastWrapper() {
 return <UndoToastContainer />;
}
