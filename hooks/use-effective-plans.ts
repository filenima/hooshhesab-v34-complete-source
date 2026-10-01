"use client";

/**
 * use-effective-plans — پلن‌های مؤثر (قابل‌ویرایش توسط سوپرادمین)
 * ============================================================================
 * منبع واحد قیمت/ویژگی پلن‌ها برای UIهای کلاینت — GET /api/plans (عمومی).
 * کش ماژول‌سطح با TTL ۶۰ ثانیه (هم‌راستا با Cache-Control سرور) و
 * invalidation با رویداد "hoshhesab:plans-changed".
 *
 * API:
 *   const { plans, visiblePlans, getEffectiveById, loading } = useEffectivePlans();
 *   plans          — Plan[] مؤثر (بدون پلن‌های hidden)
 *   visiblePlans   — همان plans (مستقیم مرئی در لندینگ)
 *   getEffectiveById(id) — (id: string) => Plan | undefined
 */

import * as React from "react";
import type { Plan } from "@/lib/plans";
import { PLANS as STATIC_PLANS } from "@/lib/plans";

const CACHE_TTL = 60 * 1000;

let cache: { at: number; data: Plan[] } | null = null;
let inflight: Promise<Plan[]> | null = null;
const listeners = new Set<() => void>();

function staticPlans(): Plan[] {
  return STATIC_PLANS.filter((p) => !p.hidden);
}

async function fetchPlans(): Promise<Plan[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/plans", { cache: "no-store" });
      const json = await res.json();
      if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
        const data = json.data as Plan[];
        cache = { at: Date.now(), data };
        return data;
      }
    } catch {
      /* offline → fallback استاتیک */
    } finally {
      inflight = null;
    }
    const fallback = cache?.data ?? staticPlans();
    cache = { at: Date.now(), data: fallback };
    return fallback;
  })();
  const result = await inflight;
  listeners.forEach((l) => l());
  return result;
}

/** بی‌اعتبارکردن کش (مثلاً پس از خرید/ویرایش توسط سوپرادمین) */
export function invalidatePlansCache() {
  cache = null;
  listeners.forEach((l) => l());
}

export function useEffectivePlans() {
  const [plans, setPlans] = React.useState<Plan[]>(cache ? cache.data : staticPlans());
  const [loading, setLoading] = React.useState(!cache);

  React.useEffect(() => {
    let cancelled = false;
    if (!cache || Date.now() - cache.at >= CACHE_TTL) {
      setLoading(true);
      void fetchPlans().then((data) => {
        if (!cancelled) {
          setPlans(data);
          setLoading(false);
        }
      });
    }
    const sync = () => {
      if (cache && !cancelled) setPlans(cache.data);
    };
    const onInvalidate = () => {
      cache = null;
      void fetchPlans().then((data) => {
        if (!cancelled) setPlans(data);
      });
    };
    listeners.add(sync);
    window.addEventListener("hoshhesab:plans-changed", onInvalidate);
    return () => {
      cancelled = true;
      listeners.delete(sync);
      window.removeEventListener("hoshhesab:plans-changed", onInvalidate);
    };
  }, []);

  const getEffectiveById = React.useCallback(
    (id: string): Plan | undefined => plans.find((p) => p.id === id),
    [plans]
  );

  return { plans, visiblePlans: plans, getEffectiveById, loading };
}

export default useEffectivePlans;
