/**
 * NotificationsListener.tsx
 * Consumes the shared NotificationContext to display toast alerts.
 * Does NOT create any Supabase subscriptions itself.
 * 
 * KEY FIX: Seeds ALL existing notification IDs on first load,
 * so only genuinely NEW notifications (arriving via realtime) trigger toasts.
 * Shows ONE toast per new notification, never batches.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import type { Notification } from "../hooks/useNotifications";

const TOAST_STYLES: Record<string, Parameters<typeof toast>[1]> = {
  task_assigned: {
    duration: 10000,
    style: { background: "#0f172a", color: "#f8fafc", border: "1px solid #f59e0b" },
  },
  picked_up: {
    duration: 8000,
    style: { background: "#0f172a", color: "#f8fafc", border: "1px solid #3b82f6" },
  },
  delivered: {
    duration: 8000,
    style: { background: "#0f172a", color: "#f8fafc", border: "1px solid #10b981" },
  },
};

export function NotificationsListener() {
  const navigate = useNavigate();
  const { notifications } = useNotifications();
  const seenIds = useRef<Set<string>>(new Set());
  const isInitialized = useRef(false);

  // On FIRST data load, seed ALL existing IDs so we never re-toast old ones
  useEffect(() => {
    if (!Array.isArray(notifications) || notifications.length === 0) return;
    if (isInitialized.current) return;

    // Mark everything currently loaded as "already seen"
    notifications.forEach((n) => {
      if (n?.id) seenIds.current.add(n.id);
    });
    isInitialized.current = true;
  }, [notifications]);

  // Only toast notifications that arrive AFTER initial seed
  useEffect(() => {
    if (!Array.isArray(notifications) || !isInitialized.current) return;

    for (const n of notifications) {
      if (!n?.id) continue;
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);

      // Show exactly ONE toast for this notification
      const style = TOAST_STYLES[n.type] ?? {};
      const action = n.link
        ? { label: "View →", onClick: () => navigate(n.link!) }
        : { label: "View →", onClick: () => navigate("/notifications") };

      if (n.type === "task_assigned") {
        toast.info(n.title, { description: n.message, action, ...style });
      } else if (n.type === "delivered") {
        toast.success(n.title, { description: n.message, action, ...style });
      } else {
        toast(n.title, { description: n.message, action, ...style });
      }

      // Only show ONE toast per render cycle to avoid spam
      break;
    }
  }, [notifications, navigate]);

  return null;
}
