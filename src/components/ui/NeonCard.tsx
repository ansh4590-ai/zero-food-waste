import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type NeonVariant = "default" | "blue" | "amber" | "emerald";

interface NeonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: NeonVariant;
  /** Adds a glowing bottom-border accent bar that slides in on hover */
  accentBar?: boolean;
  /** Use the KPI-style card (has radial gradient overlay) */
  kpi?: boolean;
}

const variantClass: Record<NeonVariant, string> = {
  default: "neon-card",
  blue:    "neon-card neon-card-blue",
  amber:   "neon-card neon-card-amber",
  emerald: "neon-card neon-card-emerald",
};

/**
 * NeonCard
 * A glassmorphic dark-mode card with neon border glow on hover.
 * Drop-in replacement for shadcn <Card> in cinematic dark contexts.
 */
const NeonCard = forwardRef<HTMLDivElement, NeonCardProps>(
  ({ className, variant = "default", accentBar = false, kpi = false, children, ...props }, ref) => {
    if (kpi) {
      return (
        <div
          ref={ref}
          className={cn("neon-kpi-card", className)}
          {...props}
        >
          {accentBar && <div className="kpi-accent-bar" aria-hidden />}
          {children}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(variantClass[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

NeonCard.displayName = "NeonCard";

const NeonCardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mb-3 space-y-1", className)} {...props} />
  )
);
NeonCardHeader.displayName = "NeonCardHeader";

const NeonCardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-base font-semibold text-white/90 tracking-tight", className)} {...props}>
      {children}
    </h3>
  )
);
NeonCardTitle.displayName = "NeonCardTitle";

const NeonCardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-white/50", className)} {...props} />
  )
);
NeonCardDescription.displayName = "NeonCardDescription";

const NeonCardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
  )
);
NeonCardContent.displayName = "NeonCardContent";

export { NeonCard, NeonCardHeader, NeonCardTitle, NeonCardDescription, NeonCardContent };
