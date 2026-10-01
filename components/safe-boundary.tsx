"use client";

import * as React from "react";

interface ErrorBoundaryProps {
 children: React.ReactNode;
 fallback?: React.ReactNode;
 /**
 * وقتی این مقدار تغییر کند، حالت خطای مرز پاک می‌شود تا children دوباره
 * رندر شوند. برای پیاده‌سازی «تلاش مجدد» در fallback استفاده می‌شود.
 */
 resetKey?: unknown;
}

interface ErrorBoundaryState {
 hasError: boolean;
 error?: Error;
}

export class SafeBoundary extends React.Component<
 ErrorBoundaryProps,
 ErrorBoundaryState
> {
 constructor(props: ErrorBoundaryProps) {
 super(props);
 this.state = { hasError: false };
 }

 static getDerivedStateFromError(error: Error): ErrorBoundaryState {
 return { hasError: true, error };
 }

 componentDidCatch(error: Error) {
 console.warn("SafeBoundary caught:", error.message);
 }

 componentDidUpdate(prevProps: ErrorBoundaryProps) {
 // ریست حالت خطا هنگام تغییر resetKey (دکمه‌ی «تلاش مجدد»)
 if (
 this.state.hasError &&
 prevProps.resetKey!== this.props.resetKey
 ) {
 this.setState({ hasError: false, error: undefined });
 }
 }

 render() {
 if (this.state.hasError) {
 return this.props.fallback?? null;
 }
 return this.props.children;
 }
}
