import { useState } from "react";
import { ArrowLeft, Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { NotificationFeed } from "../components/NotificationFeed";
import { useNotifications, type Notification } from "../hooks/useNotifications";

function dayLabel(value: string) {
  const today = new Date();
  const date = new Date(value);
  if (date.toDateString() === today.toDateString()) return "Today";
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllAsRead, isLoading } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const groups = new Map<string, Notification[]>();
  for (const item of notifications) {
    if (unreadOnly && item.read) continue;
    const day = dayLabel(item.created_at);
    const group = groups.get(day);
    if (group) group.push(item);
    else groups.set(day, [item]);
  }

  return (
    <div className="mx-auto max-w-2xl px-3 py-6 sm:px-6 sm:py-10">
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate(-1)}><ArrowLeft size={18} /></Button>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter notifications" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {[false, true].map(unread => (
            <button key={String(unread)} type="button" aria-pressed={unreadOnly === unread}
              onClick={() => setUnreadOnly(unread)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${unreadOnly === unread ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {unread ? `Unread (${unreadCount})` : "All"}
            </button>
          ))}
        </div>
        {unreadCount > 0 && <Button size="sm" variant="ghost" onClick={() => void markAllAsRead()}>Mark all read</Button>}
      </div>
      {groups.size === 0 && <div role="status" className="rounded-xl border border-border py-12 text-center text-sm text-muted-foreground">
        <Inbox size={24} className="mx-auto mb-3" />
        {isLoading ? "Loading notifications…" : unreadOnly ? "No unread notifications" : "No notifications yet"}
      </div>}
      {Array.from(groups, ([day, items]) => (
        <section key={day} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">{day}</h2>
          <div className="rounded-xl border border-border bg-card"><NotificationFeed items={items} /></div>
        </section>
      ))}
    </div>
  );
}
