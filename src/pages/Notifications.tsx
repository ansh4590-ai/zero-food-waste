import { useEffect } from "react";
import { Bell, Check, CheckCheck, Package, Truck, CheckCircle2, AlertCircle, ArrowLeft, Inbox } from "lucide-react";
import { Button } from "../components/ui/button";
import { useNotifications } from "../hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  task_assigned:   <Package className="w-5 h-5 text-amber-500" />,
  picked_up:       <Truck className="w-5 h-5 text-blue-500" />,
  delivered:       <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  status_update:   <AlertCircle className="w-5 h-5 text-purple-500" />,
};

const TYPE_LABELS: Record<string, string> = {
  task_assigned: "Task Assigned",
  picked_up: "Pickup Confirmed",
  delivered: "Delivery Complete",
  status_update: "Status Update",
};

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, refetch } = useNotifications();

  // Refetch on mount to ensure fresh data
  useEffect(() => { refetch(); }, [refetch]);

  // Group notifications by date
  const groupedNotifications = notifications.reduce<Record<string, typeof notifications>>((groups, n) => {
    const dateKey = formatDate(n.created_at);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(n);
    return groups;
  }, {});

  const handleNotificationClick = async (n: typeof notifications[number]) => {
    if (!n.read) await markAsRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="min-h-[70vh] max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllAsRead}
            className="gap-1.5 text-xs"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No notifications yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            When tasks are assigned, picked up, or delivered, you'll see updates here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedNotifications).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {dateLabel}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Notification Cards */}
              <div className="space-y-2">
                {items.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`
                      group relative flex items-start gap-4 p-4 rounded-xl border cursor-pointer
                      transition-all duration-200
                      ${n.read
                        ? "bg-card border-border hover:border-border/80 hover:bg-muted/30"
                        : "bg-primary/[0.03] border-primary/20 hover:bg-primary/[0.06] shadow-sm"
                      }
                    `}
                  >
                    {/* Unread Indicator */}
                    {!n.read && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}

                    {/* Icon */}
                    <div className={`
                      shrink-0 w-10 h-10 rounded-full flex items-center justify-center mt-0.5
                      ${n.read ? "bg-muted" : "bg-primary/10"}
                    `}>
                      {TYPE_ICONS[n.type] ?? <Bell className="w-5 h-5 text-muted-foreground" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-sm font-semibold truncate ${n.read ? "text-foreground" : "text-foreground"}`}>
                              {n.title}
                            </p>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                              {TYPE_LABELS[n.type] ?? n.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{n.message}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground/60 shrink-0 mt-0.5">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>

                      {/* Action Row */}
                      <div className="flex items-center gap-2 mt-2">
                        {n.link && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs text-primary hover:text-primary/80 gap-1"
                            onClick={(e) => { e.stopPropagation(); navigate(n.link!); }}
                          >
                            View details →
                          </Button>
                        )}
                        {!n.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                          >
                            <Check className="w-3 h-3" /> Mark read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
