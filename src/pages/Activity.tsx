import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { useNotifications } from "../hooks/useNotifications";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/ui/EmptyState";
import {
  CheckCircle2,
  Truck,
  Package,
  Utensils,
  Bell,
  Clock,
  MapPin,
  Search,
  RefreshCw,
  ArrowUpRight,
  XCircle,
  ShieldCheck,
  Activity as ActivityIcon,
  Sparkles,
  CheckCheck,
  X,
} from "lucide-react";

type EventCategory = "all" | "alerts" | "donations" | "requests" | "deliveries";
type Tone = "emerald" | "blue" | "purple" | "amber" | "rose" | "slate";

interface ActivityEvent {
  id: string;
  category: Exclude<EventCategory, "all">;
  title: string;
  description: string;
  timestamp: string;
  statusLabel: string;
  tone: Tone;
  iconKey: string;
  location?: string | null;
  quantity?: string | null;
  link?: string | null;
  notificationId?: string;
  unread?: boolean;
}

const TONE_STYLES: Record<Tone, { dot: string; badge: string; borderAccent: string }> = {
  emerald: {
    dot: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    borderAccent: "hover:border-emerald-500/40",
  },
  blue: {
    dot: "bg-blue-500/15 text-blue-400 border-blue-500/40",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    borderAccent: "hover:border-blue-500/40",
  },
  purple: {
    dot: "bg-purple-500/15 text-purple-400 border-purple-500/40",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/25",
    borderAccent: "hover:border-purple-500/40",
  },
  amber: {
    dot: "bg-amber-500/15 text-amber-400 border-amber-500/40",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    borderAccent: "hover:border-amber-500/40",
  },
  rose: {
    dot: "bg-rose-500/15 text-rose-400 border-rose-500/40",
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    borderAccent: "hover:border-rose-500/40",
  },
  slate: {
    dot: "bg-muted text-muted-foreground border-border",
    badge: "bg-muted text-muted-foreground border-border",
    borderAccent: "hover:border-border",
  },
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDayGroupLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function inferNotificationMeta(type: string, title: string): {
  iconKey: string;
  tone: Tone;
  statusLabel: string;
  defaultLink: string;
} {
  const t = (type || "").toLowerCase();
  const lowerTitle = (title || "").toLowerCase();

  if (t.includes("delivered") || t.includes("completed") || lowerTitle.includes("completed")) {
    return { iconKey: "delivered", tone: "emerald", statusLabel: "Completed", defaultLink: "/dashboard" };
  }
  if (t.includes("picked_up") || lowerTitle.includes("picked up")) {
    return { iconKey: "truck", tone: "blue", statusLabel: "In Transit", defaultLink: "/dashboard" };
  }
  if (t.includes("dispatch") || t.includes("assigned") || lowerTitle.includes("dispatch") || lowerTitle.includes("pickup")) {
    return { iconKey: "truck", tone: "purple", statusLabel: "Dispatch", defaultLink: "/volunteer" };
  }
  if (t.includes("reservation") || t.includes("request")) {
    return { iconKey: "utensils", tone: "amber", statusLabel: "Request", defaultLink: "/requests" };
  }
  if (t.includes("kyc") || t.includes("verif")) {
    return { iconKey: "shield", tone: "emerald", statusLabel: "Verification", defaultLink: "/verification" };
  }
  if (t.includes("cancel") || t.includes("expir") || t.includes("reject")) {
    return { iconKey: "cancelled", tone: "rose", statusLabel: "Cancelled", defaultLink: "/listings" };
  }
  if (t.includes("listing")) {
    return { iconKey: "package", tone: "blue", statusLabel: "Listing", defaultLink: "/listings" };
  }
  return { iconKey: "bell", tone: "slate", statusLabel: "Update", defaultLink: "/notifications" };
}

function renderIcon(iconKey: string) {
  switch (iconKey) {
    case "package":
      return <Package className="w-4 h-4" />;
    case "utensils":
      return <Utensils className="w-4 h-4" />;
    case "truck":
      return <Truck className="w-4 h-4" />;
    case "delivered":
      return <CheckCircle2 className="w-4 h-4" />;
    case "cancelled":
      return <XCircle className="w-4 h-4" />;
    case "shield":
      return <ShieldCheck className="w-4 h-4" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
}

function getStatusTone(status: string): { label: string; tone: Tone; iconKey: string } {
  switch (status) {
    case "completed":
    case "delivered":
      return { label: "Completed", tone: "emerald", iconKey: "delivered" };
    case "picked_up":
      return { label: "Picked Up", tone: "blue", iconKey: "truck" };
    case "assigned":
    case "reserved":
      return { label: status === "reserved" ? "Reserved" : "Assigned", tone: "purple", iconKey: "truck" };
    case "active":
    case "pending":
    case "accepted":
      return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "amber", iconKey: "utensils" };
    case "cancelled":
    case "expired":
    case "rejected":
      return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "rose", iconKey: "cancelled" };
    default:
      return { label: status || "Updated", tone: "slate", iconKey: "package" };
  }
}

export default function Activity() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, refetch: refetchNotifications } = useNotifications();

  const [domainEvents, setDomainEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<EventCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchDomainActivity = useCallback(async (showSpin = false) => {
    if (!user || !isValidSupabaseId(user.id)) {
      setIsLoading(false);
      return;
    }
    if (showSpin) setIsRefreshing(true);

    try {
      const [listingsRes, requestsRes, tasksRes] = await Promise.allSettled([
        supabase
          .from("food_listings")
          .select("id, title, status, quantity_description, location_name, created_at, updated_at")
          .eq("donor_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("food_requests")
          .select("id, listing_id, status, created_at, updated_at, food_listings(title, quantity_description, location_name)")
          .eq("receiver_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("volunteer_tasks")
          .select("id, status, created_at, updated_at, food_requests(food_listings(title, quantity_description, location_name))")
          .eq("volunteer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      const collected: ActivityEvent[] = [];

      if (listingsRes.status === "fulfilled" && !listingsRes.value.error && listingsRes.value.data) {
        for (const l of listingsRes.value.data as any[]) {
          const st = getStatusTone(l.status);
          collected.push({
            id: `listing-${l.id}`,
            category: "donations",
            title: l.title || "Food Donation",
            description:
              l.status === "completed"
                ? "Surplus food donation was successfully delivered."
                : l.status === "reserved"
                ? "A receiver reserved your food listing; volunteer dispatch in progress."
                : l.status === "cancelled" || l.status === "expired"
                ? `Listing marked as ${l.status}.`
                : "Listed surplus food for nearby receivers.",
            timestamp: l.updated_at || l.created_at,
            statusLabel: st.label,
            tone: l.status === "active" ? "blue" : st.tone,
            iconKey: l.status === "active" ? "package" : st.iconKey,
            location: l.location_name,
            quantity: l.quantity_description,
            link: "/listings",
          });
        }
      }

      if (requestsRes.status === "fulfilled" && !requestsRes.value.error && requestsRes.value.data) {
        for (const r of requestsRes.value.data as any[]) {
          const listing = Array.isArray(r.food_listings) ? r.food_listings[0] : r.food_listings;
          const st = getStatusTone(r.status);
          collected.push({
            id: `request-${r.id}`,
            category: "requests",
            title: listing?.title ? `Requested: ${listing.title}` : "Food Request",
            description:
              r.status === "delivered"
                ? "Food delivery received and verified."
                : r.status === "picked_up"
                ? "Volunteer has picked up your food and is en route."
                : r.status === "assigned"
                ? "Volunteer assigned to pick up this food."
                : "Food reservation submitted.",
            timestamp: r.updated_at || r.created_at,
            statusLabel: st.label,
            tone: st.tone,
            iconKey: st.iconKey,
            location: listing?.location_name,
            quantity: listing?.quantity_description,
            link: "/requests",
          });
        }
      }

      if (tasksRes.status === "fulfilled" && !tasksRes.value.error && tasksRes.value.data) {
        for (const t of tasksRes.value.data as any[]) {
          const reqObj = Array.isArray(t.food_requests) ? t.food_requests[0] : t.food_requests;
          const listing = reqObj ? (Array.isArray(reqObj.food_listings) ? reqObj.food_listings[0] : reqObj.food_listings) : null;
          const st = getStatusTone(t.status);
          collected.push({
            id: `task-${t.id}`,
            category: "deliveries",
            title: listing?.title ? `Delivery: ${listing.title}` : "Volunteer Delivery Task",
            description:
              t.status === "delivered"
                ? "Completed food rescue handoff."
                : t.status === "picked_up"
                ? "Picked up from donor — en route to drop-off."
                : t.status === "cancelled"
                ? "Delivery task cancelled."
                : "Assigned pickup & delivery task.",
            timestamp: t.updated_at || t.created_at,
            statusLabel: st.label,
            tone: st.tone,
            iconKey: st.iconKey,
            location: listing?.location_name,
            quantity: listing?.quantity_description,
            link: "/volunteer",
          });
        }
      }

      setDomainEvents(collected);
      if (showSpin) {
        await refetchNotifications();
      }
    } catch (err) {
      console.error("[Activity] Failed to load activity:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, refetchNotifications]);

  useEffect(() => {
    fetchDomainActivity();
  }, [fetchDomainActivity]);

  // Combine real notifications (from NotificationContext) + domain events
  const allEvents = useMemo<ActivityEvent[]>(() => {
    const alertEvents: ActivityEvent[] = notifications.map((n) => {
      const meta = inferNotificationMeta(n.type, n.title);
      return {
        id: `notif-${n.id}`,
        category: "alerts",
        title: n.title,
        description: n.message,
        timestamp: n.created_at,
        statusLabel: meta.statusLabel,
        tone: meta.tone,
        iconKey: meta.iconKey,
        link: n.link || meta.defaultLink,
        notificationId: n.id,
        unread: !n.read,
      };
    });

    return [...domainEvents, ...alertEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [domainEvents, notifications]);

  const counts = useMemo(() => {
    return {
      all: allEvents.length,
      donations: allEvents.filter((e) => e.category === "donations").length,
      deliveries: allEvents.filter((e) => e.category === "deliveries").length,
      requests: allEvents.filter((e) => e.category === "requests").length,
      alerts: allEvents.filter((e) => e.category === "alerts").length,
      completed: allEvents.filter((e) => e.statusLabel === "Completed").length,
    };
  }, [allEvents]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEvents.filter((e) => {
      if (activeFilter !== "all" && e.category !== activeFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q)) ||
        e.statusLabel.toLowerCase().includes(q)
      );
    });
  }, [allEvents, activeFilter, searchQuery]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, ActivityEvent[]>();
    for (const ev of filteredEvents) {
      const label = getDayGroupLabel(ev.timestamp);
      const list = groups.get(label);
      if (list) list.push(ev);
      else groups.set(label, [ev]);
    }
    return Array.from(groups.entries());
  }, [filteredEvents]);

  const filterTabs: { id: EventCategory; label: string; count: number }[] = [
    { id: "all", label: "All Activity", count: counts.all },
    { id: "donations", label: "Donations", count: counts.donations },
    { id: "deliveries", label: "Deliveries", count: counts.deliveries },
    { id: "requests", label: "Requests", count: counts.requests },
    { id: "alerts", label: "Alerts", count: counts.alerts },
  ];

  const handleEventClick = (ev: ActivityEvent) => {
    if (ev.notificationId && ev.unread) {
      void markAsRead(ev.notificationId);
    }
    if (ev.link) {
      navigate(ev.link);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <ActivityIcon className="w-7 h-7 text-emerald-500" />
            Activity History
          </h1>
          <p className="text-muted-foreground mt-1">
            Unified timeline of your food rescues, deliveries, requests, and dispatch alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void markAllAsRead()}
              className="gap-1.5"
            >
              <CheckCheck className="w-4 h-4 text-emerald-500" />
              Mark alerts read ({unreadCount})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDomainActivity(true)}
            disabled={isRefreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-0 pt-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Events</CardTitle>
            <Sparkles className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-2xl font-bold tabular-nums">{isLoading ? "-" : counts.all}</div>
          </CardContent>
        </Card>

        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-0 pt-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Food Interactions</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-2xl font-bold tabular-nums">
              {isLoading ? "-" : counts.donations + counts.requests + counts.deliveries}
            </div>
          </CardContent>
        </Card>

        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-0 pt-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-2xl font-bold tabular-nums">{isLoading ? "-" : counts.completed}</div>
          </CardContent>
        </Card>

        <Card
          className="neon-kpi-card cursor-pointer transition-colors hover:border-amber-500/40"
          onClick={() => setActiveFilter("alerts")}
        >
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-0 pt-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Unread Alerts</CardTitle>
            <Bell className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-2xl font-bold tabular-nums">{isLoading ? "-" : unreadCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter activity by category">
              {filterTabs.map((tab) => {
                const isActive = activeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveFilter(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 shadow-sm"
                        : "bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                        isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-background/60 text-muted-foreground"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search food, location, alert..."
                className="pl-9 pr-8 h-9 bg-muted/30 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Timeline Body */}
          {isLoading ? (
            <div className="space-y-4 pt-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2 rounded-xl border border-border p-4">
                    <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : groupedEvents.length === 0 ? (
            <EmptyState
              icon={ActivityIcon}
              title={searchQuery || activeFilter !== "all" ? "No matching activity" : "No activity yet"}
              description={
                searchQuery || activeFilter !== "all"
                  ? "Try clearing your search or switching to All Activity."
                  : "Your food donations, pickup tasks, requests, and alerts will appear here as you use the platform."
              }
              actionLabel={searchQuery || activeFilter !== "all" ? "Reset Filters" : "Explore Food"}
              onAction={() => {
                if (searchQuery || activeFilter !== "all") {
                  setSearchQuery("");
                  setActiveFilter("all");
                } else {
                  navigate("/browse");
                }
              }}
              className="my-2"
            />
          ) : (
            <div className="space-y-6 pt-2">
              {groupedEvents.map(([dayLabel, events]) => (
                <section key={dayLabel} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {dayLabel}
                    </span>
                    <div className="h-px flex-1 bg-border/70" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {events.length} {events.length === 1 ? "event" : "events"}
                    </span>
                  </div>

                  <div className="relative border-l border-border/80 ml-4 space-y-3.5 pb-1">
                    {events.map((ev) => {
                      const styles = TONE_STYLES[ev.tone];
                      const exactTime = new Date(ev.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <div key={ev.id} className="relative pl-7 group">
                          {/* Timeline node */}
                          <div
                            className={`absolute -left-[17px] top-3.5 w-8 h-8 rounded-full border flex items-center justify-center shadow-sm bg-background ${styles.dot}`}
                          >
                            {renderIcon(ev.iconKey)}
                          </div>

                          <div
                            onClick={() => handleEventClick(ev)}
                            role={ev.link ? "button" : undefined}
                            tabIndex={ev.link ? 0 : undefined}
                            onKeyDown={
                              ev.link
                                ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      handleEventClick(ev);
                                    }
                                  }
                                : undefined
                            }
                            className={`rounded-xl border border-border bg-card/60 p-4 transition-all ${styles.borderAccent} ${
                              ev.link ? "cursor-pointer hover:bg-muted/25 hover:shadow-sm" : ""
                            } ${ev.unread ? "ring-1 ring-emerald-500/30 bg-emerald-500/[0.03]" : ""}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                              <div className="space-y-1.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {ev.unread && (
                                    <span
                                      className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                                      title="Unread alert"
                                    />
                                  )}
                                  <h4 className="font-semibold text-sm sm:text-base text-foreground leading-snug">
                                    {ev.title}
                                  </h4>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-2 py-0 font-medium ${styles.badge}`}
                                  >
                                    {ev.statusLabel}
                                  </Badge>
                                </div>

                                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                  {ev.description}
                                </p>

                                {(ev.quantity || ev.location) && (
                                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
                                    {ev.quantity && (
                                      <span className="inline-flex items-center gap-1">
                                        <Utensils className="w-3 h-3 text-emerald-500/80" />
                                        {ev.quantity}
                                      </span>
                                    )}
                                    {ev.location && (
                                      <span className="inline-flex items-center gap-1 truncate max-w-xs sm:max-w-md">
                                        <MapPin className="w-3 h-3 text-blue-400/80 shrink-0" />
                                        <span className="truncate">{ev.location}</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                                <div
                                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md whitespace-nowrap"
                                  title={new Date(ev.timestamp).toLocaleString()}
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>{formatRelativeTime(ev.timestamp)}</span>
                                  <span className="text-muted-foreground/60">·</span>
                                  <span>{exactTime}</span>
                                </div>

                                {ev.link && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 opacity-80 group-hover:opacity-100 transition-opacity">
                                    Open
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
