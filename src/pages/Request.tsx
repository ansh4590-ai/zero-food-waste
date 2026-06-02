import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Utensils, Clock, MapPin, Package, RefreshCw, Truck, CheckCircle2, XCircle, Navigation } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusTimeline } from "../components/ui/StatusTimeline";
import { QRCodeCard } from "../components/QRVerification";
import { Link, useNavigate } from "react-router-dom";

interface FoodRequest {
  id: string;
  listing_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  receiver_rating: number | null;
  receiver_feedback: string | null;
  listing_title: string;
  listing_quantity: string;
  listing_location: string;
  listing_category: string;
  donor_name: string;
  task_status: string | null;
  task_id: string | null;
  delivery_qr_token: string | null;
  delivery_qr_expires_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ReactNode; pulse?: boolean }> = {
  pending:            { label: "⏳ Waiting for Volunteer",  variant: "warning",     icon: <Clock className="h-3.5 w-3.5" />, pulse: true  },
  pending_acceptance: { label: "🔔 Volunteer Notified",     variant: "warning",     icon: <Clock className="h-3.5 w-3.5" />, pulse: true  },
  assigned:           { label: "🚗 En Route to Pickup",     variant: "default",     icon: <Navigation className="h-3.5 w-3.5" /> },
  picked_up:          { label: "📦 Out for Delivery",       variant: "default",     icon: <Truck className="h-3.5 w-3.5" /> },
  delivered:          { label: "✅ Delivered",               variant: "success",     icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  fulfilled:          { label: "✅ Fulfilled",               variant: "success",     icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected:           { label: "❌ Rejected",                variant: "destructive", icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled:          { label: "Cancelled",                  variant: "secondary",   icon: <XCircle className="h-3.5 w-3.5" /> },
};

export default function Request() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = async () => {
    if (!user || !isValidSupabaseId(user.id)) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("food_requests")
        .select(`
          id, listing_id, status, created_at, updated_at,
          receiver_rating, receiver_feedback,
          food_listings (
            title, quantity_description, location_name, food_category,
            profiles ( full_name )
          ),
          volunteer_tasks ( id, status, delivery_qr_token, delivery_qr_expires_at )
        `)
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
          setRequests(data.map((r: any) => {
          // volunteer_tasks may be an object (single join) or array
          const taskObj = Array.isArray(r.volunteer_tasks)
            ? r.volunteer_tasks[0]
            : r.volunteer_tasks;
          return {
            id: r.id,
            listing_id: r.listing_id,
            status: r.status,
            created_at: r.created_at,
            updated_at: r.updated_at,
            receiver_rating: r.receiver_rating,
            receiver_feedback: r.receiver_feedback,
            listing_title: r.food_listings?.title || "Unknown Listing",
            listing_quantity: r.food_listings?.quantity_description || "—",
            listing_location: r.food_listings?.location_name || "Location not set",
            listing_category: r.food_listings?.food_category?.replace("_", " ") || "Food",
            donor_name: r.food_listings?.profiles?.full_name || "Verified Donor",
            task_status: taskObj?.status || null,
            task_id: taskObj?.id || null,
            delivery_qr_token: taskObj?.delivery_qr_token || null,
            delivery_qr_expires_at: taskObj?.delivery_qr_expires_at || null,
          };
        }));
      }
    } catch (e: any) {
      /* console.error("Failed to fetch requests:", e); removed for security */
      toast.error("Could not load your food requests.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !isValidSupabaseId(user.id)) return;

    const channel = supabase
      .channel("my-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_requests",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          fetchRequests();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "volunteer_tasks",
        },
        () => {
          // Refresh when any linked task changes status
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const cancelRequest = async (requestId: string) => {
    if (!user || !isValidSupabaseId(user.id)) return;
    try {
      const { error } = await supabase
        .from("food_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("receiver_id", user?.id);

      if (error) throw error;
      toast.success("Request cancelled.");
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: "cancelled" } : r));
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel request.");
    }
  };

  const getTaskStatusLabel = (taskStatus: string | null): string | null => {
    if (!taskStatus) return null;
    // Real volunteer_status enum: open | pending_acceptance | assigned | picked_up | delivered | cancelled
    const labels: Record<string, string> = {
      open:               "Awaiting Volunteer",
      pending_acceptance: "Volunteer Notified",
      assigned:           "Volunteer Assigned",
      picked_up:          "Out for Delivery",
      delivered:          "Delivered",
      cancelled:          "Cancelled",
    };
    return labels[taskStatus] ?? taskStatus.replace(/_/g, " ");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
            My Food Requests
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track every request you have made for surplus food listings.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : requests.length === 0 ? (
        <div className="py-12">
          <EmptyState 
            icon={Package}
            title="No requests yet"
            description="Browse available surplus food listings and submit a request. It will appear here with live tracking."
            actionLabel="Find Food"
            onAction={() => navigate('/browse')}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const taskLabel = getTaskStatusLabel(req.task_status);

            return (
              <Card key={req.id} className="overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  {/* Left: category color band */}
                  <div className="sm:w-1.5 h-1.5 sm:h-auto bg-orange-400 shrink-0" />

                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate">{req.listing_title}</h3>
                          <Badge variant={config.variant as any} className={`shrink-0 flex items-center gap-1 ${config.pulse ? "animate-pulse" : ""}`}>
                            {config.icon} {config.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">From: {req.donor_name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Utensils className="h-4 w-4 text-gray-400" /> {req.listing_quantity}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-gray-400" /> {req.listing_location}
                      </span>
                      <Badge variant="secondary" className="text-xs capitalize">{req.listing_category}</Badge>
                    </div>

                    {/* Logistics status Timeline */}
                    <div className="mt-6 border-t pt-5">
                      <StatusTimeline steps={[
                        {
                          label: "Request Submitted",
                          isCompleted: true,
                          date: new Date(req.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        },
                        {
                          label: ["rejected", "cancelled"].includes(req.status)
                            ? (req.status === "cancelled" ? "Cancelled by You" : "Request Rejected")
                            : "Logistics Dispatched",
                          isCompleted: ["assigned", "picked_up", "delivered", "fulfilled"].includes(req.status),
                          isCurrent:   req.status === "pending",
                          description:
                            req.status === "rejected"  ? "This food was allocated to another NGO or expired." :
                            req.status === "cancelled" ? "You cancelled this request." : undefined
                        },
                        ...(!["rejected", "cancelled"].includes(req.status) ? [
                          {
                            label: "Logistics Assigned",
                            isCompleted: ["assigned", "picked_up", "delivered"].includes(req.task_status || ""),
                            isCurrent:   ["open", "pending_acceptance"].includes(req.task_status || "")
                          },
                          {
                            label: "Out for Delivery",
                            isCompleted: ["picked_up", "delivered"].includes(req.task_status || ""),
                            isCurrent:   req.task_status === "assigned"
                          },
                          {
                            label: "Food Delivered",
                            isCompleted: ["delivered"].includes(req.task_status || ""),
                            isCurrent:   req.task_status === "picked_up"
                          }
                        ] : [])
                      ]} />
                    </div>

                    {/* Delivery QR — show when volunteer has picked up and is en route */}
                    {req.task_id && req.task_status === 'picked_up' && (
                      <div className="mt-4 border-t pt-4">
                        <QRCodeCard
                          taskId={req.task_id}
                          type="delivery"
                          token={req.delivery_qr_token}
                          expiresAt={req.delivery_qr_expires_at}
                          compact
                        />
                      </div>
                    )}

                    {/* Actions */}
                    {req.status === "pending" && (
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                          onClick={() => cancelRequest(req.id)}
                        >
                          Cancel Request
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
