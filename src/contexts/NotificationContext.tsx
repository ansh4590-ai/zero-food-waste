/**
 * NotificationContext.tsx
 * Single source of truth for all notification state and the ONE Supabase realtime channel.
 * All components must consume notifications via useNotificationContext() — never create
 * their own subscriptions.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { useAuthStore } from "../store";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refetch: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotificationContext must be used inside <NotificationProvider>");
  }
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Track the single active channel so we never create duplicates
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    // Guard: Firebase UIDs are not valid Supabase UUIDs — skip to avoid 400 errors
    if (!isValidSupabaseId(user.id)) {
      setNotifications([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, type, title, message, link, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        // Table might not exist yet — fail silently so the app never crashes
        if (import.meta.env.DEV) console.warn("notifications fetch error:", error.message);
        return;
      }
      setNotifications(data || []);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("notifications fetch threw:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Single Realtime Subscription ──────────────────────────────────────────
  useEffect(() => {
    // Remove any previous channel first (user changed or component remounted)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Guard: don't subscribe with a non-UUID id (Firebase users have no Supabase notifications)
    if (!user || !isValidSupabaseId(user.id)) return;

    try {
      // Deterministic, stable channel name — exactly one per user session
      const channel = supabase.channel(`notifications:${user.id}`);

      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === (payload.new as Notification).id
                  ? (payload.new as Notification)
                  : n
              )
            );
          }
        )
        .subscribe();

      channelRef.current = channel;
    } catch (err) {
      if (import.meta.env.DEV) console.warn("Realtime subscription failed (non-fatal):", err);
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const markAsRead = useCallback(async (id: string) => {
    // Optimistic
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("markAsRead failed:", err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("markAllAsRead failed:", err);
    }
  }, [user]);

  // ── Value ─────────────────────────────────────────────────────────────────
  const unreadCount = notifications.filter((n) => !n?.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        markAllAsRead,
        refetch: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
