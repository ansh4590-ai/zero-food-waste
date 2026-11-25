import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type NeonBadgeVariant = "green" | "blue" | "amber" | "red" | "violet" | "gray";

interface NeonBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: NeonBadgeVariant;
  dot?: boolean;
  pulse?: boolean;
}

const variantClass: Record<NeonBadgeVariant, string> = {
  green:  "neon-badge neon-badge-green",
  blue:   "neon-badge neon-badge-blue",
  amber:  "neon-badge neon-badge-amber",
  red:    "neon-badge neon-badge-red",
  violet: "neon-badge neon-badge-violet",
  gray:   "neon-badge bg-muted border-border text-muted-foreground",
};

const dotColor: Record<NeonBadgeVariant, string> = {
  green:  "bg-[#00e599]",
  blue:   "bg-[#60a5fa]",
  amber:  "bg-[#fbbf24]",
  red:    "bg-[#f87171]",
  violet: "bg-[#a78bfa]",
  gray:   "bg-muted-foreground",
};

/**
 * NeonBadge
 * A pill-shaped status badge with neon border and optional animated dot indicator.
 */
const NeonBadge = forwardRef<HTMLSpanElement, NeonBadgeProps>(
  ({ className, variant = "green", dot = false, pulse = false, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(variantClass[variant], className)}
      {...props}
    >
      {dot && (
        <span className="relative flex h-2 w-2 shrink-0">
          {pulse && (
            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", dotColor[variant])} />
          )}
          <span className={cn("relative inline-flex rounded-full h-2 w-2", dotColor[variant])} />
        </span>
      )}
      {children}
    </span>
  )
);
NeonBadge.displayName = "NeonBadge";
export { NeonBadge };
