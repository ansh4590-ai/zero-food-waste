import { useState, useEffect } from "react";
import { useAuthStore } from "../store";
import { useUserRole } from "../hooks/useRBAC";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Search, MapPin, Calendar, Utensils, Package, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Listings() {
  const { user } = useAuthStore();
  const { roles } = useUserRole();
  const primaryRole = roles?.[0] || 'donor';
  const navigate = useNavigate();
  
  const [listings, setListings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function fetchListings() {
      if (!user || !isValidSupabaseId(user.id)) return;
      try {
        let query = supabase.from("food_listings").select("*").order("created_at", { ascending: false });
        
        // Filter by role
        if (primaryRole === 'donor') {
          query = query.eq("donor_id", user.id);
        } else if (primaryRole === 'receiver') {
          // For receiver, fetch listings they have requested
          const { data: requests } = await supabase.from("food_requests").select("listing_id").eq("receiver_id", user.id);
          const listingIds = requests?.map(r => r.listing_id) || [];
          if (listingIds.length > 0) {
             query = query.in("id", listingIds);
          } else {
             setListings([]);
             setIsLoading(false);
             return;
          }
        }
        // Admin sees all

        const { data, error } = await query;
        if (!error && data) {
          setListings(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchListings();
  }, [user, primaryRole]);

  const filteredListings = listings.filter(l => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['active', 'reserved'].includes(l.status);
    if (filter === 'completed') return l.status === 'completed';
    if (filter === 'cancelled') return l.status === 'cancelled';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {primaryRole === 'donor' ? 'My Listings' : primaryRole === 'receiver' ? 'My Reservations' : 'All Listings'}
          </h1>
          <p className="text-muted-foreground mt-2">Manage and track food rescue items.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-muted p-1 rounded-lg self-start">
          <button 
            onClick={() => setFilter('all')} 
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('active')} 
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === 'active' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Active
          </button>
          <button 
            onClick={() => setFilter('completed')} 
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === 'completed' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Completed
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-[200px] animate-pulse">
              <CardContent className="h-full bg-muted/50 rounded-lg" />
            </Card>
          ))}
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-xl bg-card">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold">No listings found</h3>
          <p className="text-muted-foreground mt-1 mb-6">You don't have any listings matching this filter.</p>
          {primaryRole === 'donor' && (
            <button onClick={() => navigate('/donate')} className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium">
              Create Listing
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map(listing => (
            <Card key={listing.id} className="overflow-hidden hover:border-primary/50 transition-colors group cursor-pointer" onClick={() => navigate(`/browse?id=${listing.id}`)}>
              <div className="h-2 w-full bg-gradient-to-r from-emerald-500 to-teal-400 opacity-80" />
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant={
                    listing.status === 'completed' ? 'success' : 
                    listing.status === 'active' ? 'default' : 
                    listing.status === 'cancelled' ? 'destructive' : 'secondary'
                  }>
                    {listing.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-medium">
                    {new Date(listing.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold mb-1 truncate group-hover:text-primary transition-colors">{listing.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1.5 line-clamp-1">
                  <Utensils className="w-3.5 h-3.5" /> {listing.food_category} • {listing.quantity_description}
                </p>
                
                <div className="space-y-2 mt-auto">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <span className="line-clamp-2 leading-tight">{listing.location_name || 'Location hidden'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Expires: {new Date(listing.expiry_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}</span>
                  </div>
                </div>
                
                <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-sm font-medium text-primary">
                  <span>View details</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
