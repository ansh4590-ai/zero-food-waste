/**
 * useNotifications.ts
 * Thin consumer hook — reads from the single NotificationProvider.
 * Components must NOT create Supabase channels themselves; import this hook instead.
 */
export type { Notification } from "../contexts/NotificationContext";
export { useNotificationContext as useNotifications } from "../contexts/NotificationContext";
