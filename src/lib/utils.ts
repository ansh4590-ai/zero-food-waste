import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PICKUP_WINDOW_GRACE_MINUTES = 15;

export type PickupWindowStatus = 'upcoming' | 'available' | 'expired' | 'legacy';

export function getPickupWindowStatus(start?: string | null, end?: string | null): PickupWindowStatus {
  if (!start || !end) return 'legacy';
  
  const nowMs = Date.now();
  // Dates from Supabase (TIMESTAMPTZ) parse to correct local time/UTC equivalence in JS
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime() + (PICKUP_WINDOW_GRACE_MINUTES * 60000);

  if (nowMs < startMs) return 'upcoming';
  if (nowMs > endMs) return 'expired';
  return 'available';
}

export function formatPickupCountdown(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  
  const nowMs = Date.now();
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime(); // strict end for display purposes

  if (nowMs < startMs) {
    const diff = startMs - nowMs;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `Pickup opens in ${h > 0 ? `${h}h ` : ''}${m}m`;
  }
  
  if (nowMs <= endMs) {
    const diff = endMs - nowMs;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `Pickup closes in ${h > 0 ? `${h}h ` : ''}${m}m`;
  }
  
  return 'Pickup window closed';
}

export function formatPickupWindow(start?: string | null, end?: string | null): string {
  if (!start || !end) return 'Pickup window not set';
  const startDate = new Date(start);
  const endDate = new Date(end);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  
  if (startDate.toDateString() === endDate.toDateString()) {
    return `${startDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${startDate.toLocaleTimeString([], timeOpts)} – ${endDate.toLocaleTimeString([], timeOpts)}`;
  }
  return `${startDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${startDate.toLocaleTimeString([], timeOpts)} – ${endDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${endDate.toLocaleTimeString([], timeOpts)}`;
}

export function isPickupWindowValid(start: Date, end: Date): boolean {
  if (end.getTime() <= start.getTime()) return false;
  // Sensible duration: at least 15 mins
  if (end.getTime() - start.getTime() < 15 * 60000) return false;
  return true;
}
