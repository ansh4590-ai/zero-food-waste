// =============================================================================
// Admin Panel Utilities
// =============================================================================
// Formatting helpers, color logic, and chart theme constants extracted from
// inline expressions in AdminPanel.tsx for reuse across sub-components.
// =============================================================================

/**
 * Format a KYC submission timestamp into a human-readable wait duration.
 * Returns "—" if no timestamp is provided.
 *
 * Examples: "12m", "2h 34m", "—"
 */
export function formatWaitTime(submittedAt: string | null | undefined): string {
  if (!submittedAt) return '—';
  const mins = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

/**
 * Get the Tailwind text color class for a face-match score.
 *
 * >= 70  →  emerald (good)
 * >= 40  →  amber   (marginal)
 * <  40  →  red     (poor)
 */
export function getFaceMatchColor(score: number): string {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * Get badge CSS classes for a KYC auto-status value.
 * Used in both the queue table and the review dialog.
 */
export function getAutoStatusBadgeClasses(status: string | null | undefined): string {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    case 'rejected':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    default:
      return 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400';
  }
}

/**
 * Shared color palette for charts (pie chart cells, etc.).
 * Used in FleetCharts for category breakdown and its legend.
 */
export const CHART_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
] as const;

/**
 * Shared Recharts tooltip style object.
 * Matches the design system's card background, border, and text colors.
 */
export const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--card-foreground))',
};
