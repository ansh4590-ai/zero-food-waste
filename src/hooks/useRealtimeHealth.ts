/**
 * useRealtimeHealth — Upgrade 3: Auto-reconnect on tab resume / network restore
 *
 * Drop this hook into any page that uses Supabase realtime.
 * Pass in a refetch callback and it will:
 *  1. Refetch immediately when the browser tab becomes visible again
 *  2. Refetch when the device reconnects to the internet
 */
import { useEffect } from "react";

export function useRealtimeHealth(refetch: () => void) {
  useEffect(() => {
    // Re-fetch when tab becomes visible after being backgrounded / phone unlocked
    const onVisibilityChange = () => {
      if (!document.hidden) refetch();
    };

    // Re-fetch when device reconnects to the internet
    const onOnline = () => refetch();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [refetch]);
}
