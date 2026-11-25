import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowRight, Bell, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import { useAuthStore } from "../store";
import { NotificationFeed } from "./NotificationFeed";
import { Button } from "./ui/button";

export function NotificationBell() {
  const { isAuthenticated } = useAuthStore();
  const { notifications, unreadCount, markAllAsRead, isLoading } = useNotifications();
  const [open, setOpen] = useState(false);
  if (!isAuthenticated) return null;
  const recent = notifications.slice(0, 5);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger id="notification-bell-btn" aria-label={`Notifications, ${unreadCount} unread`}
        render={<Button variant="ghost" size="icon" className="relative" />}>
        <Bell size={20} />
        {unreadCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8} collisionPadding={8} className="z-[500]">
          <Popover.Popup className="flex max-h-[min(80dvh,var(--available-height))] w-[min(23rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Popover.Title className="mr-auto text-base font-semibold">Notifications</Popover.Title>
              {unreadCount > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void markAllAsRead()}>Mark all read</Button>}
              <Popover.Close aria-label="Close notifications" render={<Button variant="ghost" size="icon" className="size-8" />}><X size={16} /></Popover.Close>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              {recent.length ? <NotificationFeed items={recent} compact onNavigate={() => setOpen(false)} /> :
                <p role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">{isLoading ? "Loading notifications…" : "No notifications yet"}</p>}
            </div>
            <Link to="/notifications" onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-muted/50">
              View all notifications <ArrowRight size={16} />
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
