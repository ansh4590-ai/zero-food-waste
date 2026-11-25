import { useState, useEffect } from "react";
import { useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { CheckCircle2, Truck, Package, Utensils, AlertCircle } from "lucide-react";

export default function Activity() {
  const { user } = useAuthStore();
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      if (!user || !isValidSupabaseId(user.id)) return;
      try {
        // Fetch a combined view of recent activity. For simplicity in this shell, we fetch notifications
        // since notifications are already a timeline of events.
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
          
        if (!error && data) {
          setActivities(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchActivity();
  }, [user]);

  const getActivityIcon = (type: string) => {
    switch(type) {
      case 'listing_created': return <Package className="w-4 h-4 text-blue-500" />;
      case 'reservation_made': return <Utensils className="w-4 h-4 text-amber-500" />;
      case 'task_assigned': return <Truck className="w-4 h-4 text-purple-500" />;
      case 'task_completed':
      case 'listing_completed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Activity History</h1>
        <p className="text-muted-foreground mt-2">Timeline of your interactions on the platform.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your last 50 events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-1/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No activity found yet.
            </div>
          ) : (
            <div className="relative border-l border-border ml-4 space-y-8 pb-4">
              {activities.map((activity, index) => (
                <div key={activity.id} className="relative pl-8">
                  {/* Timeline dot */}
                  <div className="absolute -left-[17px] top-1 w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center shadow-sm">
                    {getActivityIcon(activity.type)}
                  </div>
                  
                  <div className="bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-foreground">{activity.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{activity.message}</p>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md shrink-0 whitespace-nowrap">
                        {new Date(activity.created_at).toLocaleString(undefined, { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
