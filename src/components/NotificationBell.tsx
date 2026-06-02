import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, X, ExternalLink, Package, Truck, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useNotifications } from "../hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  task_assigned:   <Package className="w-4 h-4 text-amber-500" />,
  picked_up:       <Truck className="w-4 h-4 text-blue-500" />,
  delivered:       <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  status_update:   <AlertCircle className="w-4 h-4 text-purple-500" />,
};

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function NotificationBell() {
  const { isAuthenticated } = useAuthStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  if (!isAuthenticated) return null;

  const handleNotificationClick = async (n: typeof notifications[number]) => {
    if (!n.read) await markAsRead(n.id);
    if (n.link) {
      navigate(n.link);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen((v) => !v)}
        className="relative text-muted-foreground hover:text-foreground"
        id="notification-bell-btn"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-border bg-card shadow-2xl z-[500] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-px">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  All read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">You're all caught up!</p>
                <p className="text-xs text-muted-foreground/60 mt-1">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors group ${
                    n.read
                      ? "bg-card hover:bg-muted/30"
                      : "bg-primary/5 hover:bg-primary/10"
                  }`}
                >
                  {/* Icon */}
                  <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    {TYPE_ICONS[n.type] ?? <Bell className="w-4 h-4 text-muted-foreground" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-medium ${n.read ? "text-foreground" : "text-foreground"} truncate`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                        {n.link && (
                          <ExternalLink className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.created_at)}</p>
                  </div>

                  {/* Mark read button */}
                  {!n.read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Mark as read"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="py-2.5 px-4 border-t border-border bg-muted/30 text-center">
            <button
              onClick={() => { navigate("/notifications"); setIsOpen(false); }}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
