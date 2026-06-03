import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a subtle top highlight border */
  highlight?: boolean;
  /** Intensity of the blur effect */
  blur?: "sm" | "md" | "lg";
}

const blurStyles = {
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-xl",
};

/**
 * GlassPanel
 * A frosted-glass dark panel for overlays, sidebars, and secondary content areas.
 */
const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, highlight = false, blur = "md", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "glass-panel",
        blurStyles[blur],
        highlight && "border-t border-t-white/10",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
GlassPanel.displayName = "GlassPanel";
export { GlassPanel };
