import { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 border-2 border-dashed border-border rounded-2xl bg-surface-soft/50",
        className
      )}
    >
      <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-surface shadow-sm border border-border mb-5 relative">
        <div className="absolute inset-0 rounded-full ring-4 ring-surface m-[-4px]" />
        <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground relative z-10" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm sm:text-base text-muted-foreground max-w-sm mx-auto mb-6 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="rounded-full px-6 shadow-sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
