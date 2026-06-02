// =============================================================================
// useFleetData — Fleet operations state, fetchers, and polling
// =============================================================================
// Extracted verbatim from AdminPanel.tsx Phase 1. Zero query behavior changes.
// All Supabase queries and the 5-second polling interval are identical.
// =============================================================================

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { LISTING_STATUS } from "../lib/constants";
import type {
  FleetTask,
  IntelStats,
  QrStats,
  DailyRescuePoint,
  CategoryBreakdownPoint,
} from "../types/admin";

/** Return shape of the useFleetData hook. */
export interface UseFleetDataReturn {
  fleetTasks: FleetTask[];
  intelStats: IntelStats;
  dailyRescueTrend: DailyRescuePoint[];
  categoryBreakdown: CategoryBreakdownPoint[];
  qrStats: QrStats;
}

/**
 * Custom hook that encapsulates all fleet operations data and polling.
 *
 * @param enabled - Pass `true` when the Fleet tab is active. Controls
 *                  whether data is fetched and the 5-second polling
 *                  interval is established.
 */
export function useFleetData(enabled: boolean): UseFleetDataReturn {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [fleetTasks, setFleetTasks] = useState<FleetTask[]>([]);
  const [intelStats, setIntelStats] = useState<IntelStats>({ urgentSaved: 0, avgFreshness: 0, expiredPrevented: 0 });
  const [dailyRescueTrend, setDailyRescueTrend] = useState<DailyRescuePoint[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdownPoint[]>([]);
  const [qrStats, setQrStats] = useState<QrStats>({ qrVerified: 0, otpFallback: 0 });

  // ─── FETCH FLEET ──────────────────────────────────────────────────────────
  const fetchFleet = async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data: activeData, error: e1 } = await supabase
        .from('volunteer_tasks')
        .select(`
          id, status, completed_at,
          volunteer:volunteer_id(full_name, location_lat, location_lng),
          food_requests (
            id, status, drop_lat, drop_lng,
            food_listings (title, location_name, pickup_lat, pickup_lng)
          )
        `)
        .in('status', ['assigned', 'picked_up']);

      if (e1 && import.meta.env.DEV) console.error("Fleet active error:", e1);

      const { data: doneData, error: e2 } = await supabase
        .from('volunteer_tasks')
        .select(`
          id, status, completed_at,
          volunteer:volunteer_id(full_name, location_lat, location_lng),
          food_requests (
            id, status, drop_lat, drop_lng,
            food_listings (title, location_name, pickup_lat, pickup_lng)
          )
        `)
        .in('status', ['delivered'])
        .gte('completed_at', oneHourAgo);

      if (e2 && import.meta.env.DEV) console.error("Fleet done error:", e2);

      setFleetTasks([...((activeData as FleetTask[]) ?? []), ...((doneData as FleetTask[]) ?? [])]);
    } catch (e) {
      if (import.meta.env.DEV) console.error("fetchFleet threw:", e);
    }
  };

  // ─── FETCH FOOD INTELLIGENCE ──────────────────────────────────────────────
  const fetchIntelStats = async () => {
    try {
      const { data } = await supabase
        .from('food_listings')
        .select('status, created_at, updated_at, estimated_safe_hours, freshness_score');
      
      if (!data) return;

      let urgentSaved = 0;
      let epCount = 0;
      let totFresh = 0;
      let freshCount = 0;

      data.forEach((item: Record<string, unknown>) => {
        if (item.freshness_score) {
          totFresh += item.freshness_score as number;
          freshCount++;
        }
        if (item.status === LISTING_STATUS.COMPLETED) {
          if (item.estimated_safe_hours && (item.estimated_safe_hours as number) < 4) urgentSaved++;
          if (item.estimated_safe_hours && item.created_at) {
            const safeUntil = new Date(item.created_at as string).getTime() + ((item.estimated_safe_hours as number) * 3600000);
            const doneAt = new Date((item.updated_at as string) || Date.now()).getTime();
            if (doneAt < safeUntil) epCount++;
          }
        }
      });
      setIntelStats({ urgentSaved, avgFreshness: freshCount ? Math.round(totFresh/freshCount) : 0, expiredPrevented: epCount });

      // ─── Daily rescue trend (last 7 days) ────────────────────────────────
      const dayMap = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        dayMap.set(d.toLocaleDateString('en-US', { weekday: 'short' }), 0);
      }
      data.forEach((item: Record<string, unknown>) => {
        if (item.status === LISTING_STATUS.COMPLETED) {
          const d = new Date((item.updated_at as string) || (item.created_at as string));
          const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
          if (dayMap.has(dayLabel)) dayMap.set(dayLabel, (dayMap.get(dayLabel) ?? 0) + 1);
        }
      });
      setDailyRescueTrend(Array.from(dayMap.entries()).map(([day, count]) => ({ day, count })));

      // ─── Category breakdown ───────────────────────────────────────────
      const { data: catData } = await supabase
        .from('food_listings')
        .select('food_category');
      if (catData) {
        const catMap = new Map<string, number>();
        catData.forEach((item: Record<string, unknown>) => {
          const cat = (item.food_category as string) || 'Other';
          catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
        });
        setCategoryBreakdown(Array.from(catMap.entries()).map(([name, value]) => ({ name, value })));
      }

      // ─── QR verification analytics ────────────────────────────────────────
      const { data: qrData } = await supabase
        .from('volunteer_tasks')
        .select('pickup_qr_used, delivery_qr_used, pickup_otp_hash, delivery_otp_hash, pickup_verified_at, delivery_verified_at');
      if (qrData) {
        let qrVerified = 0;
        let otpFallback = 0;
        qrData.forEach((t: Record<string, unknown>) => {
          if (t.pickup_qr_used) qrVerified++;
          if (t.delivery_qr_used) qrVerified++;
          // OTP fallback: verified but QR not used
          if (t.pickup_verified_at && !t.pickup_qr_used && t.pickup_otp_hash) otpFallback++;
          if (t.delivery_verified_at && !t.delivery_qr_used && t.delivery_otp_hash) otpFallback++;
        });
        setQrStats({ qrVerified, otpFallback });
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("fetchIntelStats error:", e);
    }
  };

  // ─── INITIAL FETCH + 5-SECOND POLLING ─────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    fetchFleet();
    fetchIntelStats();
    const interval = setInterval(() => {
      fetchFleet();
      fetchIntelStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [enabled]);

  return {
    fleetTasks,
    intelStats,
    dailyRescueTrend,
    categoryBreakdown,
    qrStats,
  };
}
