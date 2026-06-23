/**
 * AIRouteAdvisor — Volunteer Route Optimizer Panel
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible panel that asks the LLM for optimal task ordering.
 * Only renders when there are 2+ tasks. Hides silently on LLM failure.
 */

import { useState } from "react";
import { Sparkles, Route, ChevronDown, ChevronUp, Loader2, AlertTriangle } from "lucide-react";
import { optimizeRoutes, type TaskForOptimization, type AIRouteAdvice } from "../lib/aiService";

interface AIRouteAdvisorProps {
  tasks: Array<{
    id: string;
    name: string;
    distanceKm?: number;
    expiryTime: string | null;
    spoilageRisk?: string | null;
    priorityScore?: number;
    dbPriorityScore?: number | null;
  }>;
  onApply: (reorderedIds: string[]) => void;
}

export function AIRouteAdvisor({ tasks, onApply }: AIRouteAdvisorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [advice, setAdvice] = useState<AIRouteAdvice | null>(null);
  const [error, setError] = useState(false);
  const [applied, setApplied] = useState(false);

  if (tasks.length < 2) return null;

  const handleGetAdvice = async () => {
    setIsLoading(true);
    setError(false);
    setApplied(false);

    const taskData: TaskForOptimization[] = tasks.map((t) => ({
      id: t.id,
      name: t.name,
      distanceKm: t.distanceKm ?? 0,
      expiryTime: t.expiryTime,
      spoilageRisk: t.spoilageRisk ?? null,
      priorityScore: t.dbPriorityScore ?? t.priorityScore ?? 0,
    }));

    const result = await optimizeRoutes(taskData);

    if (result) {
      setAdvice(result);
      setError(false);
    } else {
      setError(true);
      setAdvice(null);
    }

    setIsLoading(false);
  };

  const handleApply = () => {
    if (!advice?.suggestedOrder?.length) return;
    onApply(advice.suggestedOrder);
    setApplied(true);
  };

  return (
    <div className="neon-card mb-4 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && !advice && !isLoading) {
            handleGetAdvice();
          }
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">AI Route Advisor</span>
            <span className="text-xs text-muted-foreground ml-2">
              {tasks.length} tasks
            </span>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-border">
          {isLoading ? (
            <div className="flex items-center gap-3 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span>AI is analyzing your tasks...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-5 text-center">
              <AlertTriangle className="w-5 h-5 text-amber-400 opacity-60" />
              <p className="text-sm text-muted-foreground">AI advisor is currently unavailable.</p>
              <button
                onClick={handleGetAdvice}
                className="text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : advice ? (
            <div className="space-y-3 pt-3">
              {/* Reasoning */}
              <div className="flex items-start gap-2.5 bg-purple-500/5 border border-purple-500/15 rounded-lg p-3">
                <Route className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {advice.reasoning}
                </p>
              </div>

              {/* Suggested order */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Suggested Order
                </span>
                {advice.suggestedOrder.map((taskId, idx) => {
                  const task = tasks.find((t) => t.id === taskId);
                  if (!task) return null;
                  return (
                    <div
                      key={taskId}
                      className="flex items-center gap-3 py-1.5 px-2 rounded-md bg-muted/20"
                    >
                      <span className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-sm text-foreground truncate">{task.name}</span>
                    </div>
                  );
                })}
              </div>

              {/* Apply button */}
              {!applied ? (
                <button
                  onClick={handleApply}
                  className="w-full mt-2 py-2 px-4 text-sm font-medium rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 hover:text-purple-300 transition-colors"
                >
                  Apply AI Route Order
                </button>
              ) : (
                <div className="w-full mt-2 py-2 px-4 text-sm font-medium rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-center">
                  Route order applied!
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
