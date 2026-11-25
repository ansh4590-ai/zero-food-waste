import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

type NeonButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type NeonButtonSize = "sm" | "md" | "lg" | "icon";

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NeonButtonVariant;
  size?: NeonButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<NeonButtonVariant, string> = {
  primary:   "bg-[rgba(47,111,87,0.2)] border-[rgba(47,111,87,0.5)] text-success hover:bg-[rgba(47,111,87,0.4)] hover:border-[rgba(47,111,87,0.9)] hover:shadow-[0_0_20px_rgba(47,111,87,0.35)] hover:text-foreground",
  secondary: "bg-[rgba(59,130,246,0.15)] border-[rgba(59,130,246,0.4)] text-info hover:bg-[rgba(59,130,246,0.3)] hover:border-[rgba(59,130,246,0.8)] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:text-foreground",
  danger:    "bg-[rgba(239,68,68,0.15)] border-[rgba(239,68,68,0.4)] text-destructive hover:bg-[rgba(239,68,68,0.3)] hover:border-[rgba(239,68,68,0.8)] hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:text-foreground",
  ghost:     "bg-transparent border-border text-muted-foreground hover:bg-accent hover:text-foreground hover:border-input",
};

const sizeStyles: Record<NeonButtonSize, string> = {
  sm:   "px-3 py-1.5 text-xs min-h-[44px] rounded-lg gap-1.5",
  md:   "px-4 py-2 text-sm min-h-[44px] rounded-xl gap-2",
  lg:   "px-6 py-3 text-base min-h-[52px] rounded-xl gap-2",
  icon: "p-2.5 min-h-[44px] min-w-[44px] rounded-xl",
};

/**
 * NeonButton
 * A cinematic dark-mode button with neon border glow and smooth hover state.
 * Meets the 44px minimum touch target requirement on all sizes except sm.
 */
const NeonButton = forwardRef<HTMLButtonElement, NeonButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-semibold border backdrop-blur-sm",
          "transition-all duration-200 ease-out active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

NeonButton.displayName = "NeonButton";
export { NeonButton };