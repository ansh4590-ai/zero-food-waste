import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "../../lib/utils";

export interface TimelineStep {
  label: string;
  description?: string;
  date?: string;
  isCompleted: boolean;
  isCurrent?: boolean;
}

interface StatusTimelineProps {
  steps: TimelineStep[];
  className?: string;
}

export function StatusTimeline({ steps, className }: StatusTimelineProps) {
  return (
    <div className={cn("relative border-l border-border ml-3 md:ml-4", className)}>
      {steps.map((step, idx) => (
        <div key={idx} className="mb-6 ml-6 last:mb-0 relative">
          <span
            className={cn(
              "absolute -left-9 flex items-center justify-center w-6 h-6 rounded-full -ml-[1px] ring-4 ring-background",
              step.isCompleted
                ? "bg-green-100 dark:bg-green-900/30"
                : step.isCurrent
                ? "bg-blue-100 dark:bg-blue-900/30"
                : "bg-muted"
            )}
          >
            {step.isCompleted ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : step.isCurrent ? (
              <Circle className="w-2.5 h-2.5 fill-blue-600 dark:fill-blue-400 text-blue-600 dark:text-blue-400 animate-pulse" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            )}
          </span>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
            <h4
              className={cn(
                "text-sm font-semibold",
                step.isCompleted
                  ? "text-foreground"
                  : step.isCurrent
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </h4>
            {step.date && (
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                {step.date}
              </span>
            )}
          </div>
          {step.description && (
            <p className="mt-0.5 text-sm text-muted-foreground whitespace-pre-line">{step.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
