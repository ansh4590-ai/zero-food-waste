import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Utensils,
  MapPin,
  Clock,
  TrendingUp,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
  AlertCircle,
  Truck,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { RoleGate } from "../components/auth/RoleGate";
import {
  LISTING_STATUS, LISTING_DELIVERED_STATUSES, LISTING_ACTIVE_STATUSES,
  VOLUNTEER_STATUS, REQUEST_STATUS,
} from "../lib/constants";
import { EmptyState } from "../components/ui/EmptyState";
import { QRCodeCard } from "../components/QRVerification";
import { useNavigate } from "react-router-dom";
import { useRealtimeHealth } from "../hooks/useRealtimeHealth";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

const COLORS = ["#2f6f57", "#c6923b", "#8b5cf6", "#5c8f62", "#a64b4b", "#f5f3ef"];

// DB lifecycle for food_listings: active → completed | expired
// food_listings.status = 'completed' is set by the verify_qr_token / verify_task_otp RPC on delivery
const DELIVERED_STATUSES = LISTING_DELIVERED_STATUSES as readonly string[];
const ACTIVE_STATUSES    = LISTING_ACTIVE_STATUSES as readonly string[];

export function isExpired(expiryTime?: string | null) {
  if (!expiryTime) return false;
  return new Date(expiryTime).getTime() <= Date.now();
}

type Listing = {
  id: string;
  foodType: string;
  quantity: string;
  status: string;
  time: string;
  location: string;
  taskId?: string | null;
  taskStatus?: string | null;
  pickupQrToken?: string | null;
  pickupQrExpiresAt?: string | null;
};

type RequestItem = {
  id: string;
  foodType: string;
  donor: string;
  status: string;
  date: string;
};

type ActivityItem = {
  id: string;
  title?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

/** Guard: only render Recharts once the container has a real measured size */
function ChartReadyGuard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    // Use ResizeObserver to know when the container has real dimensions
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setReady(true);
        }
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: "inherit" }}>
      {ready && children}
    </div>
  );
}

function mapListingRow(d: Record<string, unknown>): Listing {
  // Extract first active volunteer task from nested joins
  const requests = Array.isArray(d.food_requests) ? d.food_requests : d.food_requests ? [d.food_requests] : [];
  let taskId: string | null = null;
  let taskStatus: string | null = null;
  let pickupQrToken: string | null = null;
  let pickupQrExpiresAt: string | null = null;
  for (const req of requests) {
    const tasks = Array.isArray(req?.volunteer_tasks) ? req.volunteer_tasks : req?.volunteer_tasks ? [req.volunteer_tasks] : [];
    for (const t of tasks) {
      if (t?.status && !['cancelled'].includes(t.status)) {
        taskId = t.id;
        taskStatus = t.status;
        pickupQrToken = t.pickup_qr_token || null;
        pickupQrExpiresAt = t.pickup_qr_expires_at || null;
        break;
      }
    }
    if (taskId) break;
  }
  return {
    id:       String(d.id),
    foodType: (d.title as string)               ?? "Untitled",
    quantity: (d.quantity_description as string) ?? "—",
    status:   (d.status as string)              ?? "unknown",
    time:     d.created_at
      ? new Date(d.created_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : "—",
    location: (d.location_name as string) ?? "Not set",
    taskId,
    taskStatus,
    pickupQrToken,
    pickupQrExpiresAt,
  };
}

function mapRequestRow(d: Record<string, unknown>): RequestItem {
  return {
    id:       String(d.id),
    foodType: (d.food_listings as Record<string, unknown> | null)?.title as string ?? "Unknown",
    donor:    "Verified Partner",
    status:   (d.status as string) ?? "pending",
    date:     d.created_at
      ? new Date(d.created_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : "—",
  };
}

function getRequestBadgeVariant(status: string): "success" | "default" | "warning" | "secondary" {
  if ((["delivered", "fulfilled"] as string[]).includes(status)) return "success";
  if ((["assigned", "picked_up"] as string[]).includes(status)) return "default";
  if ((["cancelled", "rejected"] as string[]).includes(status)) return "secondary";
  return "warning"; // pending, pending_acceptance
}

function getRequestLabel(status: string): string {
  const MAP: Record<string, string> = {
    [REQUEST_STATUS.PENDING]:   "⏳ Waiting",
    pending_acceptance:         "🔔 Notified",
    [REQUEST_STATUS.ASSIGNED]:  "🚗 En Route",
    [REQUEST_STATUS.PICKED_UP]: "📦 Delivering",
    fulfilled:                  "✅ Delivered",
    [REQUEST_STATUS.DELIVERED]: "✅ Delivered",
    [REQUEST_STATUS.CANCELLED]: "Cancelled",
    [REQUEST_STATUS.REJECTED]:  "Rejected",
  };
  return MAP[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate  = useNavigate();

  const [isLoading,       setIsLoading]       = useState(true);
  const [fetchError,      setFetchError]       = useState(false);
  const [recentListings,  setRecentListings]   = useState<Listing[]>([]);
  const [requests,        setRequests]         = useState<RequestItem[]>([]);

  // Analytics
  const [totalMeals,     setTotalMeals]     = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [activeCount,    setActiveCount]    = useState(0);
  const [pendingPickups, setPendingPickups] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [trendData,      setTrendData]      = useState<{ name: string; meals: number }[]>([]);
  const [categoryData,   setCategoryData]   = useState<{ name: string; value: number }[]>([]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const handleCancelListing = async (listingId: string) => {
    if (!window.confirm("Are you sure you want to cancel this listing? It will be removed from the Find Food page.")) return;
    
    try {
      const { error } = await supabase
        .from('food_listings')
        .update({ status: LISTING_STATUS.CANCELLED })
        .eq('id', listingId)
        .eq('donor_id', user?.id); // extra safety
        
      if (error) throw error;
      toast.success("Listing cancelled successfully.");
      // Realtime subscription will handle updating the UI state automatically
    } catch (e) {
      if (import.meta.env.DEV) console.error("Cancel listing failed", e);
      toast.error("Could not cancel listing.");
    }
  };

  // ─── Data fetch ───────────────────────────────────────────────────────────
  const fetchDashboard = async () => {
    setIsLoading(true);
    setFetchError(false);
    try {
      // ── Unified Data Fetch ──
      const [listingsData, tasksData] = await Promise.all([
        supabase
          .from("food_listings")
          .select("id, title, status, created_at, updated_at, food_category, quantity_description, expiry_time")
          .order("created_at", { ascending: false }),
        supabase
          .from("volunteer_tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "assigned")
      ]);

      const rawItems = listingsData.data || [];
      if (listingsData.error && import.meta.env.DEV) console.error("Dashboard fetch error:", listingsData.error);
      
      let totMeals = 0, comp = 0, act = 0;
      if (rawItems.length > 0) {
        comp = rawItems.filter(i => DELIVERED_STATUSES.includes(i.status)).length;
        act = rawItems.filter(i => {
          if (!ACTIVE_STATUSES.includes(i.status)) return false;
          if (i.expiry_time) {
            return new Date(i.expiry_time).getTime() > Date.now();
          }
          return true;
        }).length;
        
        rawItems.filter(i => DELIVERED_STATUSES.includes(i.status)).forEach(i => {
           const match = String(i.quantity_description || "").match(/(\d+)/);
           totMeals += match ? parseInt(match[1], 10) : 15;
        });
      }
      setTotalMeals(totMeals);
      setCompletedCount(comp);
      setActiveCount(act);
      setPendingPickups(tasksData.count || 0);

      const activityFeed = [...rawItems].sort((a, b) => 
        new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
      ).slice(0, 10);
      setRecentActivity(activityFeed);

      if (rawItems.length > 0) {
        // Category pie
        const catMap: Record<string, number> = {};
        rawItems.forEach((i) => {
          const cat = (i.food_category || "other").replace(/_/g, " ");
          catMap[cat] = (catMap[cat] || 0) + 1;
        });
        setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name, value })));

        // 7-day bar chart (Mon=0 … Sun=6)
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const trendsMap = days.map((name) => ({ name, meals: 0 }));
        rawItems.forEach((i) => {
          if (!i.created_at) return;
          const dayIdx = new Date(i.created_at).getDay(); // 0=Sun
          const mapped = dayIdx === 0 ? 6 : dayIdx - 1;  // 0=Mon
          trendsMap[mapped].meals += 1;
        });
        setTrendData(trendsMap);
      } else {
        setTrendData([]);
        setCategoryData([]);
      }

      // ── User-specific data ──
      if (user && isValidSupabaseId(user.id)) {
        const [listingsRes, requestsRes] = await Promise.all([
          supabase
            .from("food_listings")
            .select("id, title, quantity_description, status, created_at, location_name, food_requests(volunteer_tasks(id, status, pickup_qr_token, pickup_qr_expires_at))")
            .eq("donor_id", user.id)
            .or(`expiry_time.is.null,expiry_time.gt.${new Date().toISOString()}`)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("food_requests")
            .select("id, status, created_at, food_listings(title)")
            .eq("receiver_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        if (listingsRes.error && import.meta.env.DEV) console.error("Listings fetch error:", listingsRes.error);
        else setRecentListings((listingsRes.data ?? []).map(mapListingRow));

        if (requestsRes.error && import.meta.env.DEV) console.error("Requests fetch error:", requestsRes.error);
        else setRequests((requestsRes.data ?? []).map(mapRequestRow));
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("Dashboard fetch failed:", err);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only re-run when the actual user ID changes

  // Upgrade 3: Auto-refetch on tab focus / network restore
  useRealtimeHealth(fetchDashboard);

  // ─── Realtime ───
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "food_listings" }, async (payload) => {
        try {
          // 1. Scalable Incremental KPI Updates (No full table scans per event)
          if (payload.eventType === 'INSERT') {
            const newRec = payload.new as ActivityItem;
            if (ACTIVE_STATUSES.includes(newRec.status as string)) setActiveCount(prev => prev + 1);
            if (DELIVERED_STATUSES.includes(newRec.status as string)) setCompletedCount(prev => prev + 1);
            
            setRecentActivity(prev => [newRec, ...prev].slice(0, 10));
          } else if (payload.eventType === 'UPDATE') {
            const oldStatus = (payload.old as Record<string, unknown>)?.status as string | undefined;
            const newStatus = (payload.new as Record<string, unknown>)?.status as string | undefined;

            if (oldStatus !== newStatus && oldStatus && newStatus) {
              if (ACTIVE_STATUSES.includes(newStatus)) setActiveCount(prev => prev + 1);
              if (ACTIVE_STATUSES.includes(oldStatus)) setActiveCount(prev => Math.max(0, prev - 1));
              
              if (DELIVERED_STATUSES.includes(newStatus)) {
                 setCompletedCount(prev => prev + 1);
                 const match = String((payload.new as Record<string, unknown>)?.quantity_description || "").match(/(\d+)/);
                 setTotalMeals(prev => prev + (match ? parseInt(match[1], 10) : 15));
              }
              if (DELIVERED_STATUSES.includes(oldStatus)) {
                 setCompletedCount(prev => Math.max(0, prev - 1));
              }
            } else if (!oldStatus) {
              // If REPLICA IDENTITY is not FULL, old status is missing, fetch to stay synced
              fetchDashboard();
            }

            setRecentActivity(prev => {
              const filtered = prev.filter(item => item.id !== (payload.new as ActivityItem).id);
              return [payload.new as ActivityItem, ...filtered].sort((a: ActivityItem, b: ActivityItem) => 
                new Date(b.updated_at || b.created_at || Date.now()).getTime() - new Date(a.updated_at || a.created_at || Date.now()).getTime()
              ).slice(0, 10);
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRec = payload.old as Record<string, unknown>;
            if (ACTIVE_STATUSES.includes(oldRec?.status as string)) setActiveCount(prev => Math.max(0, prev - 1));
            if (DELIVERED_STATUSES.includes(oldRec?.status as string)) setCompletedCount(prev => Math.max(0, prev - 1));
          }

          // 2. Fetch specific donor records only if relevant
          const newRec = payload.new as Record<string, unknown>;
          const oldRec = payload.old as Record<string, unknown>;
          if (user && isValidSupabaseId(user.id) && (newRec?.donor_id === user.id || oldRec?.donor_id === user.id)) {
            const { data: ld } = await supabase
              .from("food_listings")
              .select("id, title, quantity_description, status, created_at, location_name, food_requests(volunteer_tasks(id, status, pickup_qr_token, pickup_qr_expires_at))")
              .eq("donor_id", user.id)
              .order("created_at", { ascending: false })
              .limit(10);
            if (ld) setRecentListings(ld.map(mapListingRow));
          }
        } catch (e) {
          if (import.meta.env.DEV) console.error("Realtime listing update failed:", e);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "volunteer_tasks" }, async () => {
        // Sync QR code generations instantly
        if (user) fetchDashboard();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "food_requests" }, async (payload) => {
        if (!user || !isValidSupabaseId(user.id)) return;
        try {
          const newRec = payload.new as Record<string, any>;
          const oldRec = payload.old as Record<string, any>;
          if (newRec?.receiver_id === user.id || oldRec?.receiver_id === user.id) {
            // Direct fetch allowed since load on per-receiver filter is tiny
            const { data: rd } = await supabase
            .from("food_requests")
            .select("id, status, created_at, food_listings(title)")
            .eq("receiver_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5);
            if (rd) setRequests(rd.map(mapRequestRow));
          }
        } catch (e) {
          if (import.meta.env.DEV) console.error("Realtime request update failed:", e);
        }
      })
      .subscribe();

    // 3. Fallback poller to passively self-heal stats over time
    const syncInterval = setInterval(() => {
      fetchDashboard();
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(syncInterval);
    };
  }, [user]);

  // ─── Derived UI values ────────────────────────────────────────────────────
  const listingBadgeVariant = (status: string) => {
    if (status === LISTING_STATUS.ACTIVE)    return "warning"   as const;
    if (status === LISTING_STATUS.COMPLETED) return "success"   as const;
    return "secondary" as const;
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live platform metrics, powered by your Supabase database.
        </p>
      </div>

      {fetchError && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Could not load dashboard data.{" "}
            <button onClick={fetchDashboard} className="underline font-medium">
              Retry
            </button>
          </span>
        </div>
      )}

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="hover:shadow-md transition-shadow group relative overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-green-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">Meals Rescued</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-foreground">
              {isLoading ? <div className="h-9 w-16 bg-muted animate-pulse rounded" /> : totalMeals}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-green-600 dark:text-green-500 font-medium flex items-center">
              <Utensils className="h-3.5 w-3.5 mr-1" /> Lifetime community impact
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow group relative overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">Active Donations</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-foreground">
              {isLoading ? <div className="h-9 w-16 bg-muted animate-pulse rounded" /> : activeCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-amber-600 dark:text-amber-500 font-medium flex items-center">
              <Activity className="h-3.5 w-3.5 mr-1" /> Ready for pickup
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow group relative overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">Pending Pickups</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-foreground">
              {isLoading ? <div className="h-9 w-16 bg-muted animate-pulse rounded" /> : pendingPickups}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-blue-600 dark:text-blue-500 font-medium flex items-center">
              <Truck className="h-3.5 w-3.5 mr-1" /> Volunteers en route
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow group relative overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-teal-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">Completed Deliveries</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-foreground">
              {isLoading ? <div className="h-9 w-16 bg-muted animate-pulse rounded" /> : completedCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-teal-600 dark:text-teal-500 font-medium flex items-center">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Successful handoffs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>Listing Volume by Day</CardTitle>
            <CardDescription>Distribution of food listings across the week</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Explicit pixel height — prevents Recharts width/height = -1 warning */}
            <div style={{ width: "100%", height: 288 }}>
              {isLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : trendData.length > 0 ? (
                <ChartReadyGuard>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #e5e7eb)" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground, #6b7280)", fontSize: 12 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground, #6b7280)", fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "var(--muted, #f3f4f6)" }}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          background: "var(--card, #ffffff)",
                          color: "var(--card-foreground, #111)",
                        }}
                      />
                      <Bar dataKey="meals" fill="#2f6f57" radius={[4, 4, 0, 0]} name="Listings" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartReadyGuard>
              ) : (
                <div className="w-full h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                  <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
                  <span className="text-sm">No data yet</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pie chart */}
        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
            <CardDescription>Breakdown of food types across all listings</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div style={{ width: "100%", height: 288 }}>
              {isLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : categoryData.length > 0 ? (
                <ChartReadyGuard>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          background: "var(--card, #ffffff)",
                          color: "var(--card-foreground, #111)",
                        }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartReadyGuard>
              ) : (
                <div className="w-full h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                  <PieChartIcon className="w-8 h-8 mb-2 opacity-40" />
                  <span className="text-sm">No data yet</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Global Organization: Recent Activity Timeline ─── */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          Platform Activity Pulse
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </h3>
        {isLoading ? (
          <div className="bg-card text-card-foreground shadow-sm overflow-hidden rounded-lg border border-border p-5">
             <div className="animate-pulse space-y-4">
                 {[1,2,3,4].map(i => (
                    <div key={i} className="flex gap-4">
                       <div className="h-4 w-4 bg-muted rounded-full shrink-0" />
                       <div className="space-y-2 flex-1">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/4" />
                       </div>
                    </div>
                 ))}
             </div>
          </div>
        ) : recentActivity.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No recent activity"
            description="The platform is quiet right now. Check back soon."
            actionLabel="Refresh"
            onAction={fetchDashboard}
          />
        ) : (
          <div className="bg-card text-card-foreground shadow-sm overflow-hidden rounded-lg border border-border p-6">
            <div className="relative border-l-2 border-muted pl-4 ml-2 space-y-6">
              {recentActivity.map((activity, idx) => (
                <div key={activity.id + '-' + idx} className="relative">
                  <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-1">
                    <p className="text-sm font-medium text-foreground">
                      Listing <span className="font-semibold text-primary">{activity.title}</span> was updated.
                    </p>
                    <time className="text-xs text-muted-foreground whitespace-nowrap">
                       {new Date(activity.updated_at || activity.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Current status: <Badge variant="secondary" className="scale-90 origin-left mt-1">{activity.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Receiver: Recent Requests ─── */}
      <RoleGate permission="requests.read_own">
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            Recent Requests
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
            </span>
          </h3>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={Utensils}
              title="No active requests"
              description="You haven't requested any food yet. Browse live surplus from verified kitchens."
              actionLabel="Find Food"
              onAction={() => navigate("/browse")}
            />
          ) : (
            <div className="bg-card text-card-foreground shadow-sm overflow-hidden rounded-lg border border-border">
              <ul className="divide-y divide-border/50">
                {requests.map((req) => (
                  <li
                    key={req.id}
                    className="px-5 py-4 flex flex-wrap items-center justify-between hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center shrink-0">
                        <Utensils className="h-4 w-4 text-green-600 dark:text-green-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{req.foodType}</p>
                        <p className="text-xs text-muted-foreground">From: {req.donor}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge
                        variant={getRequestBadgeVariant(req.status)}
                        className={
                          ["pending", "pending_acceptance"].includes(req.status) ? "animate-pulse" : ""
                        }
                      >
                        {getRequestLabel(req.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{req.date}</span>
                    </div>
                    {req.status === "cancelled" && (
                      <div className="text-red-500 text-sm mt-2 w-full pl-12 flex-1 basis-full">
                        Request expired or no volunteer accepted in time.
                      </div>
                    )}
                    {req.status === "rejected" && (
                      <div className="text-red-500 text-sm mt-2 w-full pl-12 flex-1 basis-full">
                        Food expired before dispatch, or donor unavailable.
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </RoleGate>

      {/* ─── Donor: My Listings ─── */}
      <RoleGate permission="food.create">
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4">My Listings</h3>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : recentListings.length === 0 ? (
            <EmptyState
              icon={Utensils}
              title="Create your first listing"
              description="Your surplus food can feed a family tonight. List it in under 60 seconds."
              actionLabel="Donate Food"
              onAction={() => navigate("/donate")}
            />
          ) : (
            <div className="bg-card text-card-foreground shadow-sm overflow-hidden rounded-lg border border-border">
              <ul className="divide-y divide-border/50">
                {recentListings.map((listing) => (
                  <li key={listing.id} className="px-5 py-4 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <Utensils className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{listing.foodType}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {listing.location}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant={listingBadgeVariant(listing.status)}>
                          {(listing.status || "unknown")
                            .charAt(0)
                            .toUpperCase() + (listing.status || "unknown").slice(1).replace(/_/g, " ")}
                        </Badge>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {listing.time}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 ml-12">
                      <p className="text-sm text-muted-foreground">
                        Qty:{" "}
                        <span className="font-medium text-foreground">{listing.quantity}</span>
                      </p>
                      {(listing.status === 'active' || listing.status === 'reserved') && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 -mr-2"
                          onClick={() => handleCancelListing(listing.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Cancel
                        </Button>
                      )}
                    </div>
                    {/* Donor Pickup QR — show when volunteer is assigned */}
                    {listing.taskId && listing.taskStatus === 'assigned' && (
                      <div className="mt-3 ml-12">
                        <QRCodeCard
                          taskId={listing.taskId}
                          type="pickup"
                          token={listing.pickupQrToken}
                          expiresAt={listing.pickupQrExpiresAt}
                          compact
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </RoleGate>

      {/* ─── System Status footer ─── */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">All systems operational</p>
              <p className="text-xs text-muted-foreground">
                Realtime sync active · Database connected · Last refresh: just now
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
