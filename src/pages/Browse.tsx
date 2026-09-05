import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Search, MapPin, Clock, Filter, ShieldCheck, Utensils, ArrowUpDown, Leaf, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { EmptyState } from "../components/ui/EmptyState";
import { TrustBadge } from "../components/ui/TrustBadge";
import { getPickupWindowStatus, formatPickupCountdown, formatPickupWindow } from "../lib/utils";

interface FoodItem {
  id: string;
  donor: string;
  foodType: string;
  quantity: string;
  locationText: string;
  expiresIn: string;
  expiryTime?: string | null;
  image: string | null;
  tags: string[];
  freshnessScore?: number | null;
  spoilageRisk?: string | null;
  qualityStatus?: string | null;
  foodCategory?: string | null;
  createdAt: string;
  safeHours?: number | null;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
}

import { useRealtimeHealth } from "../hooks/useRealtimeHealth";

export default function Browse() {
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuthStore();
  const [availableFood, setAvailableFood] = useState<FoodItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'freshness' | 'expiring'>('newest');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  // Per-card requesting state — prevents double-clicks
  const [requestingIds, setRequestingIds] = useState<Set<string>>(new Set());
  const [confirmItem, setConfirmItem] = useState<FoodItem | null>(null);
  const [, forceTick] = useState(0);

  // Upgrade: Force live UI update every 30s to re-filter expired items
  useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchFood = async () => {
    try {
      const { data, error } = await supabase
        .from('food_listings')
        .select(`
          id, title, quantity_description, food_category,
          location_name, expiry_time, image_url, status, created_at, freshness_score, spoilage_risk, estimated_safe_hours, quality_status,
          pickup_window_start, pickup_window_end,
          profiles(full_name)
        `)
        .eq('status', 'active')
        .gt('expiry_time', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setAvailableFood(data.map(item => ({
          id: item.id,
          donor: (Array.isArray(item.profiles) ? item.profiles[0]?.full_name : (item.profiles as any)?.full_name) || 'Verified Donor',
          foodType: item.title,
          quantity: item.quantity_description,
          locationText: item.location_name || "Location not provided",
          expiresIn: item.expiry_time
            ? new Date(item.expiry_time).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
            : "Not specified",
          expiryTime: item.expiry_time,
          image: item.image_url || null,
          tags: [item.food_category?.replace('_', ' ') || 'Food'],
          freshnessScore: item.freshness_score,
          spoilageRisk: item.spoilage_risk,
          qualityStatus: item.quality_status,
          foodCategory: item.food_category,
          createdAt: item.created_at,
          safeHours: item.estimated_safe_hours,
          pickupWindowStart: item.pickup_window_start,
          pickupWindowEnd: item.pickup_window_end
        })));
      }
    } catch (e) {
      /* console.error("Failed to load listings", e); removed for security */
      toast.error("Could not load food listings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchFood(); }, []);

  // Upgrade 3: Auto-refetch on tab focus / network restore
  useRealtimeHealth(fetchFood);

  // Realtime: auto-refresh when listings change
  useEffect(() => {
    const channel = supabase
      .channel("browse-listings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "food_listings" },
        () => { fetchFood(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleRequestFood = async (item: FoodItem) => {
    if (!user || !isValidSupabaseId(user.id)) {
      toast.error("Please log in to request food.");
      return;
    }
    // Prevent double-click
    if (requestingIds.has(item.id)) return;

    setRequestingIds(prev => new Set(prev).add(item.id));
    try {
      // 1. Check for existing active request for this listing
      const { data: existing } = await supabase
        .from("food_requests")
        .select("id, status")
        .eq("listing_id", item.id)
        .eq("receiver_id", user.id)
        .not("status", "in", "(cancelled,delivered)")
        .maybeSingle();

      if (existing) {
        toast.error("You already have an active request for this listing.", {
          description: `Current status: ${existing.status}`,
        });
        return;
      }

      // 2. Fetch receiver coordinates from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("location_lat, location_lng")
        .eq("id", user.id)
        .single();

      if (!profile?.location_lat || !profile?.location_lng) {
        toast.error("Set your location before requesting food", {
          description: "Visit your profile to set your delivery address.",
        });
        return;
      }

      // 3. Insert request with coordinates
      const { error } = await supabase.from("food_requests").insert({
        listing_id: item.id,
        receiver_id: user.id,
        status: "pending",
        drop_lat: profile?.location_lat ?? null,
        drop_lng: profile?.location_lng ?? null,
      });

      if (error) {
        console.error("INSERT ERROR:", error);
        // Handle the 'listing already reserved' trigger error
        if ((error as Error).message?.includes('no longer available') || error.code === 'P0001' || (error as Error).message?.includes('unique_active_request_per_listing')) {
          toast.error("This food has already been claimed by another receiver.", {
            description: "The listing will be removed from your view.",
          });
          fetchFood(); // Refresh to remove the now-reserved listing
        } else {
          toast.error((error as Error).message || "Failed to submit request.");
        }
      } else {
        toast.success(`Request sent for ${item.foodType}!`, {
          description: "The donor has been notified. A volunteer will be dispatched shortly.",
        });
      }
    } finally {
      setRequestingIds(prev => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  const filtered = searchQuery.trim()
    ? availableFood.filter(item =>
      item.foodType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.donor.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : availableFood;

  const validAndFiltered = filtered.filter(item => {
    if (!item.expiryTime) return true;
    return new Date(item.expiryTime).getTime() > Date.now();
  }).filter(item => {
    if (filterCategory === 'all') return true;
    return item.foodCategory === filterCategory;
  });

  // Sort
  const sortedItems = [...validAndFiltered].sort((a, b) => {
    if (sortBy === 'freshness') return (b.freshnessScore ?? 0) - (a.freshnessScore ?? 0);
    if (sortBy === 'expiring') {
      const aExpMs = a.expiryTime ? new Date(a.expiryTime).getTime() : Infinity;
      const bExpMs = b.expiryTime ? new Date(b.expiryTime).getTime() : Infinity;
      return aExpMs - bExpMs; // soonest first
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
  });

  // Helper: countdown text
  const getCountdownText = (item: FoodItem) => {
    return formatPickupCountdown(item.pickupWindowStart, item.pickupWindowEnd);
  };

  const categories = ['all', 'Cooked Meals', 'Bakery', 'Packaged Food', 'Raw Ingredients', 'Fruits & Vegetables', 'Beverages', 'Snacks', 'Desserts'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col items-center justify-center mb-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Available Food
        </h2>
        <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-xl">
          Browse surplus food listings near your location.
        </p>
      </div>

      <div className="bg-card text-card-foreground p-4 rounded-lg shadow-sm border border-border mb-8 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <Input
            type="text"
            placeholder="Search by food type or donor…"
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {/* Category Filter */}
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="h-10 px-3 rounded-md border border-border bg-card text-card-foreground text-sm min-w-[160px]"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
          ))}
        </select>
        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="h-10 px-3 rounded-md border border-border bg-card text-card-foreground text-sm min-w-[140px]"
        >
          <option value="newest">Newest First</option>
          <option value="freshness">Best Freshness</option>
          <option value="expiring">Expiring Soon</option>
        </select>
      </div>

      {/* Listings */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={Utensils}
            title={searchQuery ? "No results found" : "No active food listings"}
            description={searchQuery
              ? "Try adjusting your filters or searching for something else."
              : "There is currently no active surplus food available. Please check back later."}
            actionLabel={searchQuery ? "Clear Search" : undefined}
            onAction={searchQuery ? () => setSearchQuery("") : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedItems.map((item) => {
            const countdown = getCountdownText(item);
            const windowStatus = getPickupWindowStatus(item.pickupWindowStart, item.pickupWindowEnd);
            const isLegacy = windowStatus === 'legacy';
            const isRequestable = windowStatus === 'available' || isLegacy;
            
            return (
              <div key={item.id} className="bg-card text-card-foreground rounded-lg shadow-sm border border-border overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                <div className="relative h-48 bg-gray-100 flex items-center justify-center">
                  {item.image ? (
                    <img src={item.image} alt={item.foodType} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Utensils className="h-10 w-10 text-gray-300" />
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 flex-wrap">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant={tag === 'Urgent' ? 'destructive' : 'secondary'} className="shadow-sm">
                        {tag}
                      </Badge>
                    ))}
                    {/* Packaged vs Cooked badge */}
                    {item.foodCategory === 'Packaged Food' && (
                      <Badge className="bg-blue-500/80 text-white shadow-sm text-[10px]">
                        <Package className="w-3 h-3 mr-0.5" /> Packaged
                      </Badge>
                    )}
                    {item.foodCategory === 'Cooked Meals' && (
                      <Badge className="bg-orange-500/80 text-white shadow-sm text-[10px]">
                        <Utensils className="w-3 h-3 mr-0.5" /> Cooked
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  {/* Header: Title and Donor */}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-foreground line-clamp-1 mb-1">{item.foodType}</h3>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className="font-medium">{item.donor}</span>
                      <TrustBadge type="organization" showText={false} />
                    </div>
                  </div>

                  {/* Body: Details Grid */}
                  <div className="space-y-2.5 mb-5 flex-1">
                    {/* Quantity */}
                    <div className="flex items-start text-sm text-muted-foreground">
                      <Utensils className="h-4 w-4 mr-2.5 mt-0.5 text-gray-400 shrink-0" />
                      <span className="font-medium text-foreground/80">{item.quantity}</span>
                    </div>

                    {/* Freshness & Quality */}
                    {(item.freshnessScore != null || item.qualityStatus) && (
                      <div className="flex flex-wrap gap-y-2 gap-x-4">
                        {item.freshnessScore != null && (
                          <div className="flex items-center text-sm">
                            <ShieldCheck className="h-4 w-4 mr-1.5 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Freshness: {item.freshnessScore}/100
                            </span>
                          </div>
                        )}
                        {item.qualityStatus && (
                          <div className="flex items-center text-sm">
                            <Leaf className="h-4 w-4 mr-1.5 text-blue-500" />
                            <span className={`font-medium capitalize ${
                              item.qualityStatus === 'excellent' ? 'text-emerald-600 dark:text-emerald-400' :
                              item.qualityStatus === 'good' ? 'text-blue-600 dark:text-blue-400' :
                              item.qualityStatus === 'usable' ? 'text-amber-600 dark:text-amber-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              Quality: {item.qualityStatus}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Location */}
                    <div className="flex items-start text-sm text-muted-foreground pt-1">
                      <MapPin className="h-4 w-4 mr-2.5 mt-0.5 text-gray-400 shrink-0" />
                      <span className="line-clamp-2 leading-snug">{item.locationText}</span>
                    </div>

                    {/* Pickup Window Box */}
                    <div className="mt-4 bg-muted/30 p-3 rounded-lg border border-border/40 space-y-2">
                      <div className="flex items-start">
                        <Clock className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                            Pickup Window
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            {formatPickupWindow(item.pickupWindowStart, item.pickupWindowEnd)}
                          </span>
                        </div>
                      </div>
                      
                      {countdown && (
                        <div className={`flex items-center text-xs font-semibold pl-6 ${
                          windowStatus === 'expired' ? 'text-red-500' :
                          windowStatus === 'upcoming' ? 'text-amber-500' : 
                          'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {windowStatus === 'upcoming' ? '⏳ Upcoming • ' : 
                           windowStatus === 'available' ? '✅ Available • ' : 
                           '❌ Expired • '}{countdown}
                        </div>
                      )}
                      
                      {item.expiresIn && (
                        <div className="flex items-center text-xs text-muted-foreground pl-6">
                          ⚠️ Expires: {item.expiresIn}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    className="w-full mt-auto font-semibold shadow-sm"
                    variant={isRequestable && !requestingIds.has(item.id) ? "default" : "secondary"}
                    onClick={() => setConfirmItem(item)}
                    disabled={requestingIds.has(item.id) || !isRequestable}
                  >
                    {!isRequestable 
                      ? (windowStatus === 'upcoming' ? "Not Yet Open" : "Window Closed") 
                      : requestingIds.has(item.id) ? "Requesting…" : "Request Pickup"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Confirmation Dialog ── */}
      <Dialog open={!!confirmItem} onOpenChange={open => { if (!open) setConfirmItem(null); }}>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground border border-border rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Confirm Food Request
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Please double-check the details below before confirming your request.
            </DialogDescription>
          </DialogHeader>
          {confirmItem && (
            <div className="py-4 space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Utensils className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-foreground truncate">{confirmItem.foodType}</h4>
                    <p className="text-xs text-muted-foreground">by {confirmItem.donor}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Package className="w-3.5 h-3.5" /> {confirmItem.quantity}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" /> {confirmItem.locationText}
                  </div>
                </div>
                {confirmItem.expiresIn && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Clock className="w-3.5 h-3.5" /> Expires: {confirmItem.expiresIn}
                  </div>
                )}
              </div>
              <p className="text-sm text-center text-muted-foreground">
                Are you sure you want to request this food?
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 gap-2"
                  disabled={requestingIds.has(confirmItem.id)}
                  onClick={() => {
                    handleRequestFood(confirmItem);
                    setConfirmItem(null);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {requestingIds.has(confirmItem.id) ? "Requesting…" : "Yes, Request Food"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
