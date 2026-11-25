import { CheckCircle2, Circle } from "lucide-react";

interface TimelineStage {
  key: string;
  label: string;
  color: string;
}

interface ProgressTimelineProps {
  /** All stages in display order */
  stages: TimelineStage[];
  /** Key of the current active stage */
  currentStageKey: string;
  /** Optional: vertical or horizontal layout */
  direction?: "vertical" | "horizontal";
}

/**
 * A visual timeline showing task progress through ordered stages.
 * Completed stages get checkmarks, current stage pulses, future stages are gray.
 */
export function ProgressTimeline({
  stages,
  currentStageKey,
  direction = "vertical",
}: ProgressTimelineProps) {
  const currentIndex = stages.findIndex(s => s.key === currentStageKey);

  if (direction === "horizontal") {
    return (
      <div className="flex items-center gap-0 w-full py-2">
        {stages.map((stage, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;

          return (
            <div key={stage.key} className="flex items-center flex-1 last:flex-initial">
              {/* Node */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                    isPast
                      ? "bg-emerald-500 border-emerald-500"
                      : isCurrent
                      ? `border-current`
                      : "border-border bg-transparent"
                  }`}
                  style={isCurrent ? { borderColor: stage.color, boxShadow: `0 0 12px ${stage.color}40` } : undefined}
                >
                  {isPast ? (
                    <CheckCircle2 className="w-4 h-4 text-foreground" />
                  ) : isCurrent ? (
                    <div
                      className="w-2.5 h-2.5 rounded-full animate-pulse"
                      style={{ background: stage.color }}
                    />
                  ) : (
                    <Circle className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
                <span
                  className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight max-w-[60px] ${
                    isPast ? "text-success" : isCurrent ? "text-foreground" : "text-muted-foreground"
                  }`}
                  style={isCurrent ? { color: stage.color } : undefined}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector line */}
              {i < stages.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 rounded-full ${
                    i < currentIndex ? "bg-emerald-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Vertical layout
  return (
    <div className="flex flex-col gap-0 py-1">
      {stages.map((stage, i) => {
        const isPast = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <div key={stage.key} className="flex items-stretch gap-3">
            {/* Vertical line + node */}
            <div className="flex flex-col items-center">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center border-2 shrink-0 transition-all ${
                  isPast
                    ? "bg-emerald-500 border-emerald-500"
                    : isCurrent
                    ? ""
                    : "border-border"
                }`}
                style={isCurrent ? { borderColor: stage.color, boxShadow: `0 0 10px ${stage.color}30` } : undefined}
              >
                {isPast ? (
                  <CheckCircle2 className="w-3 h-3 text-foreground" />
                ) : isCurrent ? (
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: stage.color }} />
                ) : (
                  <Circle className="w-2.5 h-2.5 text-muted-foreground" />
                )}
              </div>
              {i < stages.length - 1 && (
                <div
                  className={`w-0.5 flex-1 min-h-[16px] ${
                    i < currentIndex ? "bg-emerald-500" : "bg-muted"
                  }`}
                />
              )}
            </div>

            {/* Label */}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider pb-2 ${
                isPast ? "text-success" : isCurrent ? "text-foreground" : "text-muted-foreground"
              }`}
              style={isCurrent ? { color: stage.color } : undefined}
            >
              {stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Default volunteer task stages for the ProgressTimeline */
export const VOLUNTEER_TIMELINE_STAGES = [
  { key: "pending_acceptance", label: "Assigned", color: "#ef4444" },
  { key: "assigned", label: "En Route", color: "#f59e0b" },
  { key: "picked_up", label: "Out for Delivery", color: "#3b82f6" },
  { key: "delivered", label: "Delivered", color: "#10b981" },
];
