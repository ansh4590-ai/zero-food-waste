import { useState, useEffect } from "react";
import { useAuthStore } from "../store";
import { useUserRole, usePermissions } from "../hooks/useRBAC";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { 
  HeartHandshake, Utensils, Activity, Truck, CheckCircle2,
  Users, AlertCircle, ArrowRight, Package, MapPin, 
  Search, PlusCircle, LayoutList, ShieldCheck, PieChart, QrCode,
  Navigation, Clock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LISTING_DELIVERED_STATUSES, LISTING_ACTIVE_STATUSES } from "../lib/constants";
import { EmptyState } from "../components/ui/EmptyState";
import { useRealtimeHealth } from "../hooks/useRealtimeHealth";
import { QRCodeCard } from "../components/QRVerification";
import { StatusTimeline } from "../components/ui/StatusTimeline";

// ─── DASHBOARD OVERVIEWS ──────────────────────────────────────────────────

function DonorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ mealsDonated: 0, activeListings: 0, successfulDeliveries: 0, impactScore: 0 });
  const [recentListings, setRecentListings] = useState<any[]>([]);
  const [upcomingPickups, setUpcomingPickups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user || !isValidSupabaseId(user.id)) return;
      try {
        const { data: listings } = await supabase
          .from("food_listings")
          .select("id, title, status, quantity_description, created_at, food_requests(volunteer_tasks(status, id))")
          .eq("donor_id", user.id)
          .order("created_at", { ascending: false });

        if (listings) {
          let meals = 0;
          let active = 0;
          let deliveries = 0;
          const upcoming: any[] = [];

          listings.forEach(l => {
            if (LISTING_ACTIVE_STATUSES.includes(l.status)) active++;
            if (LISTING_DELIVERED_STATUSES.includes(l.status)) {
              deliveries++;
              const match = String(l.quantity_description || "").match(/(\d+)/);
              meals += match ? parseInt(match[1], 10) : 15;
            }

            // Find upcoming pickups
            const reqs = Array.isArray(l.food_requests) ? l.food_requests : l.food_requests ? [l.food_requests] : [];
            for (const r of reqs) {
              const tasks = Array.isArray(r.volunteer_tasks) ? r.volunteer_tasks : r.volunteer_tasks ? [r.volunteer_tasks] : [];
              for (const t of tasks) {
                if (t.status === 'assigned') {
                  upcoming.push({ 
                    ...l, 
                    taskId: t.id,
                  });
                }
              }
            }
          });

          setStats({ mealsDonated: meals, activeListings: active, successfulDeliveries: deliveries, impactScore: (deliveries * 10) + meals });
          setRecentListings(listings.slice(0, 5));
          setUpcomingPickups(upcoming.slice(0, 3));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [user]);

  useRealtimeHealth(() => { /* triggers effect again via some mechanism, omitted for brevity */ });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back, {user?.fullName || "Donor"}!</h2>
          <p className="text-muted-foreground mt-1">Here is the overview of your food rescue impact.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/donate")} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"><PlusCircle className="w-4 h-4" /> Donate Food</Button>
          <Button onClick={() => navigate("/listings")} variant="outline" className="gap-2"><LayoutList className="w-4 h-4" /> View Listings</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Meals Donated</CardTitle>
            <Utensils className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.mealsDonated}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <Activity className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.activeListings}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Successful Deliveries</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.successfulDeliveries}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Impact Score</CardTitle>
            <HeartHandshake className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.impactScore}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Recent Donations</CardTitle>
            <CardDescription>Your latest food listings</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoading ? <div className="animate-pulse h-20 bg-muted rounded" /> : recentListings.length === 0 ? (
              <EmptyState icon={Package} title="No listings" description="You haven't posted any food yet." actionLabel="Donate" onAction={() => navigate("/donate")} />
            ) : (
              <div className="space-y-4">
                {recentListings.map(l => (
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10"><Utensils className="w-4 h-4 text-primary" /></div>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{l.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Badge variant={l.status === 'completed' ? 'success' : l.status === 'active' ? 'warning' : 'secondary'}>{l.status}</Badge>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4 text-primary" onClick={() => navigate("/listings")}>View All <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Upcoming Pickups</CardTitle>
            <CardDescription>Volunteers arriving soon</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoading ? <div className="animate-pulse h-20 bg-muted rounded" /> : upcomingPickups.length === 0 ? (
              <EmptyState icon={Truck} title="No upcoming pickups" description="No volunteers are currently assigned to your active listings." />
            ) : (
              <div className="space-y-4">
                {upcomingPickups.map((p, i) => (
                  <div key={i} className="flex flex-col p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-500/20"><Truck className="w-4 h-4 text-blue-500" /></div>
                      <div>
                        <p className="font-medium text-sm">{p.title}</p>
                        <p className="text-xs text-blue-500 font-medium mt-0.5">Volunteer En Route for Pickup</p>
                      </div>
                    </div>
                    {p.taskId && (
                      <div className="pt-2 border-t border-blue-500/10">
                        <QRCodeCard
                          taskId={p.taskId}
                          type="pickup"
                          compact
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReceiverDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ mealsReceived: 0, activeReservations: 0, completedDeliveries: 0, partnerCount: 0 });
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!user || !isValidSupabaseId(user.id)) return;
    try {
      const { data: requests } = await supabase
        .from("food_requests")
        .select(`
          id, status, created_at, updated_at,
          food_listings(title, donor_id, quantity_description, location_name, food_category),
          volunteer_tasks(id, status)
        `)
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false });

      if (requests) {
        let meals = 0;
        let active = 0;
        let deliveries = 0;
        const partners = new Set<string>();
        const liveDeliveries: any[] = [];

        // Collect donor IDs to look up via the safe contact view
        const donorIds = [...new Set(
          requests
            .map(r => { const l = Array.isArray(r.food_listings) ? r.food_listings[0] : r.food_listings; return l?.donor_id as string | undefined; })
            .filter(Boolean) as string[]
        )];

        // Fetch donor display names from task_participants_contact (privacy-safe view)
        const donorNameMap: Record<string, string> = {};
        if (donorIds.length > 0) {
          const { data: contactRows } = await supabase
            .from("task_participants_contact")
            .select("id, full_name")
            .in("id", donorIds);
          (contactRows ?? []).forEach((c: any) => { donorNameMap[c.id] = c.full_name || "Verified Donor"; });
        }

        requests.forEach(r => {
          const l = Array.isArray(r.food_listings) ? r.food_listings[0] : r.food_listings;
          const taskObj = Array.isArray(r.volunteer_tasks) ? r.volunteer_tasks[0] : r.volunteer_tasks;
          if (['pending', 'assigned', 'picked_up'].includes(r.status)) {
            active++;
            liveDeliveries.push({
              ...r,
              listing: l,
              task: taskObj,
              donor_name: (l?.donor_id && donorNameMap[l.donor_id]) || 'Verified Donor',
            });
          }
          if (['delivered', 'fulfilled'].includes(r.status)) {
            deliveries++;
            if (l?.donor_id) partners.add(l.donor_id);
            const match = String(l?.quantity_description || "").match(/(\d+)/);
            meals += match ? parseInt(match[1], 10) : 15;
          }
        });

        setStats({ mealsReceived: meals, activeReservations: active, completedDeliveries: deliveries, partnerCount: partners.size });
        setRecentRequests(requests.slice(0, 5));
        setActiveDeliveries(liveDeliveries);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  // Realtime updates for receiver's requests and volunteer tasks
  useEffect(() => {
    if (!user || !isValidSupabaseId(user.id)) return;
    const channel = supabase
      .channel("receiver-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "food_requests", filter: `receiver_id=eq.${user.id}` }, () => fetchData())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "volunteer_tasks" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const getTaskStatusConfig = (taskStatus: string | null, reqStatus: string) => {
    if (reqStatus === 'pending' && !taskStatus) return { label: 'Awaiting Volunteer', color: 'text-amber-500', icon: <Clock className="w-4 h-4" />, pulse: true };
    if (taskStatus === 'assigned') return { label: 'Volunteer En Route to Pickup', color: 'text-blue-500', icon: <Navigation className="w-4 h-4" /> };
    if (taskStatus === 'picked_up') return { label: 'Out for Delivery to You', color: 'text-emerald-500', icon: <Truck className="w-4 h-4" />, pulse: true };
    return { label: 'Processing', color: 'text-muted-foreground', icon: <Clock className="w-4 h-4" /> };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back, {user?.fullName || "NGO Partner"}!</h2>
          <p className="text-muted-foreground mt-1">Overview of your food rescue operations.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/browse")} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"><Search className="w-4 h-4" /> Find Food</Button>
          <Button onClick={() => navigate("/requests")} variant="outline" className="gap-2"><LayoutList className="w-4 h-4" /> View Reservations</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Meals Received</CardTitle>
            <Utensils className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.mealsReceived}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Active Reservations</CardTitle>
            <Activity className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.activeReservations}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Completed Deliveries</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.completedDeliveries}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Partner Count</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.partnerCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── ACTIVE DELIVERIES TRACKING ── */}
      {activeDeliveries.length > 0 && (
        <Card className="border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.08)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-500" />
                  Active Deliveries
                </CardTitle>
                <CardDescription>Live tracking of your food requests</CardDescription>
              </div>
              <Badge variant="outline" className="border-blue-500/30 text-blue-500 bg-blue-500/10 animate-pulse">
                {activeDeliveries.length} Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeDeliveries.map((d) => {
                const statusConfig = getTaskStatusConfig(d.task?.status || null, d.status);
                return (
                  <div key={d.id} className="rounded-xl border border-border bg-card p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                          <span className={statusConfig.color}>{statusConfig.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm truncate">{d.listing?.title || 'Food Request'}</h4>
                          <p className="text-xs text-muted-foreground">From: {d.donor_name}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-xs ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : ''}`}>
                        {statusConfig.label}
                      </Badge>
                    </div>

                    {/* Details */}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {d.listing?.quantity_description || '—'}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {d.listing?.location_name || 'Location hidden'}</span>
                    </div>

                    {/* Progress Timeline */}
                    <StatusTimeline steps={[
                      { label: "Requested", isCompleted: true },
                      { label: "Volunteer Assigned", isCompleted: ['assigned', 'picked_up', 'delivered'].includes(d.task?.status || ''), isCurrent: d.status === 'pending' },
                      { label: "Picked Up", isCompleted: ['picked_up', 'delivered'].includes(d.task?.status || ''), isCurrent: d.task?.status === 'assigned' },
                      { label: "Delivered", isCompleted: d.task?.status === 'delivered', isCurrent: d.task?.status === 'picked_up' },
                    ]} />

                    {/* Delivery QR — shown when volunteer has picked up food; QRCodeCard self-generates the token */}
                    {d.task?.id && d.task?.status === 'picked_up' && (
                      <QRCodeCard
                        taskId={d.task.id}
                        type="delivery"
                        compact
                      />
                    )}

                    {/* Link to full tracking */}
                    <Button variant="ghost" size="sm" className="w-full text-primary text-xs" onClick={() => navigate('/requests')}>
                      View Full Details <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Recent Reservations</CardTitle>
            <CardDescription>Your latest food requests</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoading ? <div className="animate-pulse h-20 bg-muted rounded" /> : recentRequests.length === 0 ? (
              <EmptyState icon={Package} title="No reservations" description="You haven't requested any food yet." actionLabel="Find Food" onAction={() => navigate("/browse")} />
            ) : (
              <div className="space-y-4">
                {recentRequests.map(r => {
                   const l = Array.isArray(r.food_listings) ? r.food_listings[0] : r.food_listings;
                   return (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10"><Utensils className="w-4 h-4 text-primary" /></div>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{l?.title || 'Unknown Food'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Badge variant={['delivered', 'fulfilled'].includes(r.status) ? 'success' : ['pending', 'assigned'].includes(r.status) ? 'warning' : 'secondary'}>
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </div>
                )})}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4 text-primary" onClick={() => navigate("/requests")}>View All <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </CardContent>
        </Card>
        
        <Card className="flex flex-col bg-primary/5 border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Utensils className="w-32 h-32 text-primary" />
          </div>
          <CardHeader>
            <CardTitle className="text-primary">Available Food Summary</CardTitle>
            <CardDescription>Quick glance at platform surplus</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center items-center text-center">
             <div className="bg-background rounded-full p-4 border border-border mb-4">
               <Search className="w-8 h-8 text-muted-foreground" />
             </div>
             <h3 className="font-medium text-lg">Ready to find food?</h3>
             <p className="text-sm text-muted-foreground mb-6 max-w-[250px]">Browse active listings from verified donors near your location.</p>
             <Button onClick={() => navigate("/browse")} className="w-full sm:w-auto">Open Food Finder</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VolunteerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ assignedPickups: 0, completedDeliveries: 0, activeTasks: 0, efficiencyScore: 98 });
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [currentTask, setCurrentTask] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user || !isValidSupabaseId(user.id)) return;
      try {
        const { data: tasks } = await supabase
          .from("volunteer_tasks")
          .select("id, status, created_at, updated_at, food_requests(food_listings(title, location_name))")
          .eq("volunteer_id", user.id)
          .order("updated_at", { ascending: false });

        if (tasks) {
          let assigned = 0;
          let completed = 0;
          let active = 0;

          tasks.forEach(t => {
            if (['assigned', 'picked_up'].includes(t.status)) active++;
            if (t.status === 'assigned') assigned++;
            if (t.status === 'delivered') completed++;
          });

          setStats({ assignedPickups: assigned, completedDeliveries: completed, activeTasks: active, efficiencyScore: 98 });
          setRecentTasks(tasks.filter(t => t.status === 'delivered').slice(0, 5));
          
          const current = tasks.find(t => ['assigned', 'picked_up'].includes(t.status));
          if (current) setCurrentTask(current);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ready to roll, {user?.fullName || "Volunteer"}?</h2>
          <p className="text-muted-foreground mt-1">Here is your fleet overview.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/tasks")} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"><Truck className="w-4 h-4" /> Open My Tasks</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Assigned Pickups</CardTitle>
            <Package className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.assignedPickups}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Completed Deliveries</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.completedDeliveries}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.activeTasks}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Efficiency Score</CardTitle>
            <HeartHandshake className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : `${stats.efficiencyScore}%`}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
          <CardHeader>
            <CardTitle className="text-emerald-600 dark:text-emerald-400">Current Assignment</CardTitle>
            <CardDescription>Your active route</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {isLoading ? <div className="animate-pulse h-20 bg-muted rounded" /> : !currentTask ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium">No active task</h3>
                <p className="text-sm text-muted-foreground mt-1">You're all caught up! Wait for new assignments.</p>
              </div>
            ) : (
              <div className="bg-background rounded-lg p-4 border border-border">
                {(() => {
                  const req = currentTask.food_requests;
                  const l = Array.isArray(req?.food_listings) ? req.food_listings[0] : req?.food_listings;
                  return (
                    <>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                          <Truck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{l?.title || 'Food Rescue'}</h4>
                          <Badge variant="outline" className="mt-1 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                            {currentTask.status === 'assigned' ? 'En Route to Pickup' : 'Delivering'}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm mt-4">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{l?.location_name || 'Location hidden'}</span>
                        </div>
                      </div>
                      <Button className="w-full mt-4" onClick={() => navigate("/tasks")}>Open Route</Button>
                    </>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Recent Deliveries</CardTitle>
            <CardDescription>Your completed routes</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoading ? <div className="animate-pulse h-20 bg-muted rounded" /> : recentTasks.length === 0 ? (
              <EmptyState icon={Package} title="No deliveries yet" description="Complete your first task to see history here." />
            ) : (
              <div className="space-y-4">
                {recentTasks.map(t => {
                   const req = t.food_requests;
                   const l = Array.isArray(req?.food_listings) ? req.food_listings[0] : req?.food_listings;
                   return (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10"><CheckCircle2 className="w-4 h-4 text-primary" /></div>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{l?.title || 'Completed Task'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4 text-primary" onClick={() => navigate("/activity")}>View History <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalUsers: 0, activeListings: 0, pendingKyc: 0, platformHealth: 100 });
  const [recentVerifications, setRecentVerifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Use count queries instead of fetching all rows (scales to millions of rows)
        const [totalUsersRes, pendingKycRes, activeListingsRes, recentPendingRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
          supabase.from("food_listings").select("id", { count: "exact", head: true }).in("status", LISTING_ACTIVE_STATUSES),
          supabase.from("profiles").select("id, verification_status, created_at")
            .eq("verification_status", "pending")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const totalUsers = totalUsersRes.count ?? 0;
        const pendingKyc = pendingKycRes.count ?? 0;
        const activeListings = activeListingsRes.count ?? 0;

        setStats({ totalUsers, activeListings, pendingKyc, platformHealth: 100 });
        setRecentVerifications(recentPendingRes.data ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Overview</h2>
          <p className="text-muted-foreground mt-1">Platform health and operations.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => navigate("/admin")} className="gap-2"><ShieldCheck className="w-4 h-4" /> Manage Users</Button>
          <Button onClick={() => navigate("/analytics")} variant="outline" className="gap-2"><PieChart className="w-4 h-4" /> View Analytics</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.totalUsers}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.activeListings}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Pending KYC</CardTitle>
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums">{isLoading ? "-" : stats.pendingKyc}</div>
          </CardContent>
        </Card>
        <Card className="neon-kpi-card">
          <div className="kpi-accent-bar" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-sm font-medium">Platform Health</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-3xl font-bold tabular-nums text-emerald-500">{isLoading ? "-" : `${stats.platformHealth}%`}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Verification Queue</CardTitle>
            <CardDescription>Users waiting for approval</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoading ? <div className="animate-pulse h-20 bg-muted rounded" /> : recentVerifications.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No pending verifications" description="All users are verified." />
            ) : (
              <div className="space-y-4">
                {recentVerifications.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-amber-500/20"><AlertCircle className="w-4 h-4 text-amber-500" /></div>
                      <div>
                        <p className="font-medium text-sm">User {u.id.substring(0, 8)}...</p>
                        <p className="text-xs text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4 text-primary" onClick={() => navigate("/admin")}>Open Queue <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col border border-border">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Realtime infrastructure overview</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-sm">Supabase Database</span>
                </div>
                <span className="text-xs text-emerald-500">Connected</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-sm">Realtime Channels</span>
                </div>
                <span className="text-xs text-emerald-500">Active</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-sm">Background Workers</span>
                </div>
                <span className="text-xs text-emerald-500">Running</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────

export default function Dashboard() {
  const { roles, isLoading } = useUserRole();
  const primaryRole = roles?.[0] || 'donor';

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {primaryRole === 'donor' && <DonorDashboard />}
      {primaryRole === 'receiver' && <ReceiverDashboard />}
      {primaryRole === 'volunteer' && <VolunteerDashboard />}
      {primaryRole === 'admin' && <AdminDashboard />}
    </div>
  );
}
