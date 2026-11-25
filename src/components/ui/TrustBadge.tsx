import { ShieldCheck, UserCheck } from "lucide-react";
import { cn } from "../../lib/utils";

interface TrustBadgeProps {
  type: "user" | "organization";
  className?: string;
  showText?: boolean;
}

export function TrustBadge({ type, className, showText = true }: TrustBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold select-none",
        type === "organization"
          ? "bg-blue-50 text-blue-700 border border-blue-200"
          : "bg-green-50 text-green-700 border border-green-200",
        className
      )}
      title={type === "organization" ? "Verified Partner Organization" : "Verified Identity"}
    >
      {type === "organization" ? (
        <ShieldCheck className="h-3.5 w-3.5" />
      ) : (
        <UserCheck className="h-3.5 w-3.5" />
      )}
      {showText && (type === "organization" ? "Verified Partner" : "Verified Identity")}
    </div>
  );
}
