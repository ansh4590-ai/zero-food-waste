import { Bell, Check, CircleCheck, Package, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { type Notification, useNotifications } from "../hooks/useNotifications";

const icons = { task_assigned: Package, picked_up: Truck, delivered: CircleCheck };

function timestamp(value: string) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationFeed({ items, compact = false, onNavigate }: {
  items: Notification[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { markAsRead } = useNotifications();
  return (
    <ul className="divide-y divide-border/70">
      {items.map(item => {
        const Icon = icons[item.type as keyof typeof icons] ?? Bell;
        const Row = item.link || !item.read ? "button" : "div";
        return (
          <li key={item.id} className="flex items-center gap-1 px-3 sm:px-4">
            <Row
              onClick={Row === "button" ? () => {
                if (!item.read) void markAsRead(item.id);
                if (item.link) { onNavigate?.(); navigate(item.link); }
              } : undefined}
              className="flex min-w-0 flex-1 items-start gap-3 rounded-md py-3 text-left focus-visible:outline-primary"
            >
              <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${item.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                <Icon aria-hidden="true" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`break-words text-sm leading-5 ${item.read ? "font-normal" : "font-semibold"}`}>
                    {!item.read && <span className="sr-only">Unread: </span>}{item.title}
                  </span>
                  <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()} className="shrink-0 text-xs text-muted-foreground">{timestamp(item.created_at)}</time>
                </span>
                <span className={`mt-0.5 block break-words text-sm leading-5 text-muted-foreground ${compact ? "line-clamp-2" : ""}`}>{item.message}</span>
              </span>
            </Row>
            {!item.read && item.link && (
              <button type="button" onClick={() => void markAsRead(item.id)} title="Mark as read" aria-label={`Mark ${item.title} as read`}
                className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-primary">
                <Check size={15} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
