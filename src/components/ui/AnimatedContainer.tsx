import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type AnimationType = "fade-in" | "fade-in-up" | "none";

interface AnimatedContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  animation?: AnimationType;
  delay?: 0 | 100 | 200 | 300 | 400 | 500;
}

const animationClass: Record<AnimationType, string> = {
  "fade-in":    "animate-fade-in opacity-0",
  "fade-in-up": "animate-fade-in-up opacity-0",
  "none":       "",
};

const delayClass: Record<number, string> = {
  0:   "",
  100: "delay-100",
  200: "delay-200",
  300: "delay-300",
  400: "delay-400",
  500: "delay-500",
};

/**
 * AnimatedContainer
 * Wraps content in a div with configurable entrance animation and stagger delay.
 * Uses CSS animations from index.css (fade-in, fade-in-up).
 */
const AnimatedContainer = forwardRef<HTMLDivElement, AnimatedContainerProps>(
  ({ className, animation = "fade-in-up", delay = 0, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        animationClass[animation],
        delay > 0 && delayClass[delay],
        className
      )}
      style={{ animationFillMode: "forwards", ...props.style }}
      {...props}
    >
      {children}
    </div>
  )
);
AnimatedContainer.displayName = "AnimatedContainer";
export { AnimatedContainer };
