import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { MapPin, Package, Clock, Navigation, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { calculateHaversineDistance } from "../lib/distance";

interface AssignedTask {
  id: string; // volunteer_task id
  requestId: string;
  foodName: string;
  quantity: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  expiryTime: string | null;
  volunteerLat: number;
  volunteerLng: number;
}

interface TaskAssignmentModalProps {
  volunteerLat: number;
  volunteerLng: number;
  onAccepted: () => void;
}

export function TaskAssignmentModal({ volunteerLat, volunteerLng, onAccepted }: TaskAssignmentModalProps) {
  const { user } = useAuthStore();
  const [pendingTask, setPendingTask] = useState<AssignedTask | null>(null);
  const [isActing, setIsActing] = useState(false);

  const fetchPendingAssignments = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("volunteer_tasks")
      .select(`
        id, status,
        profiles:volunteer_id (location_lat, location_lng),
        food_requests (
          id, drop_lat, drop_lng,
          food_listings ( title, quantity_description, location_name, pickup_lat, pickup_lng, expiry_time, pickup_window )
        )
      `)
      .eq("volunteer_id", user.id)
      .eq("status", "pending_acceptance")
      .limit(1)
      .maybeSingle();

    if (!data) { setPendingTask(null); return; }

    const req = Array.isArray(data.food_requests) ? data.food_requests[0] : data.food_requests;
    const listing = req ? (Array.isArray(req.food_listings) ? req.food_listings[0] : req.food_listings) : null;
    const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

    if (!req || !listing) { setPendingTask(null); return; }

    setPendingTask({
      id: data.id,
      requestId: req.id,
      foodName: listing.title ?? "Food Donation",
      quantity: listing.quantity_description ?? "—",
      pickupAddress: listing.location_name ?? "Donor location",
      pickupLat: listing.pickup_lat ?? volunteerLat,
      pickupLng: listing.pickup_lng ?? volunteerLng,
      dropoffAddress: "Receiver location",
      dropoffLat: req.drop_lat ?? volunteerLat,
      dropoffLng: req.drop_lng ?? volunteerLng,
      expiryTime: listing.expiry_time ?? null,
      volunteerLat: profile?.location_lat ?? volunteerLat,
      volunteerLng: profile?.location_lng ?? volunteerLng,
    });
  }, [user, volunteerLat, volunteerLng]);

  // Initial check + realtime listener
  useEffect(() => {
    fetchPendingAssignments();
  }, [fetchPendingAssignments]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`assignment-modal-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "volunteer_tasks",
        filter: `volunteer_id=eq.${user.id}`,
      }, () => {
        fetchPendingAssignments();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchPendingAssignments]);

  const handleAction = async (action: "accept" | "decline") => {
    if (!pendingTask || !user) return;
    setIsActing(true);
    try {
      const { data, error } = await supabase.rpc("handle_task_assignment", {
        p_task_id: pendingTask.id,
        p_volunteer_id: user.id,
        p_action: action,
      });

      if (error || !data?.success) {
        toast.error(data?.error ?? "Action failed. Please retry.");
        return;
      }

      if (action === "accept") {
        toast.success("Assignment Accepted! 🚗", {
          description: "OSRM is computing your route to the pickup point.",
        });
        onAccepted();
      } else {
        toast("Assignment declined. Task returned to pool.");
      }

      setPendingTask(null);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsActing(false);
    }
  };

  if (!pendingTask) return null;

  const distanceKm = calculateHaversineDistance(
    volunteerLat, volunteerLng,
    pendingTask.pickupLat, pendingTask.pickupLng
  );

  const minutesToExpiry = pendingTask.expiryTime
    ? Math.floor((new Date(pendingTask.expiryTime).getTime() - Date.now()) / 60000)
    : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isActing) setPendingTask(null); }}>
      <DialogContent className="sm:max-w-md bg-[#0f1111] text-white border border-white/10 rounded-2xl shadow-2xl p-0 overflow-hidden">
        {/* Urgent header stripe */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-blue-100 font-semibold">Auto-Dispatch Alert</p>
              <DialogTitle className="text-lg font-bold text-white m-0">New Assignment</DialogTitle>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <DialogDescription className="text-white/50 text-xs sr-only">
            A new food delivery task has been assigned to you. Review the details and accept or decline.
          </DialogDescription>

          {/* Food info */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-white text-sm">{pendingTask.foodName}</span>
              </div>
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                {pendingTask.quantity}
              </Badge>
            </div>

            {minutesToExpiry !== null && minutesToExpiry > 0 && (
              <div className={`flex items-center gap-1.5 text-xs mb-3 ${minutesToExpiry <= 30 ? "text-red-400" : "text-amber-400/70"}`}>
                <Clock className="w-3 h-3" />
                Expires in {minutesToExpiry < 60 ? `${minutesToExpiry} min` : `${Math.floor(minutesToExpiry / 60)}h ${minutesToExpiry % 60}m`}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Pickup</p>
                  <p className="text-xs text-white/80">{pendingTask.pickupAddress}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Dropoff</p>
                  <p className="text-xs text-white/80">{pendingTask.dropoffAddress}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Distance badge */}
          <div className="flex items-center justify-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-400">
              {distanceKm.toFixed(1)} km from your location
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              onClick={() => handleAction("decline")}
              disabled={isActing}
              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50 bg-transparent h-11"
            >
              {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><XCircle className="w-4 h-4 mr-2" /> Decline</>
              )}
            </Button>
            <Button
              onClick={() => handleAction("accept")}
              disabled={isActing}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold h-11"
            >
              {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Accept Dispatch</>
              )}
            </Button>
          </div>

          <p className="text-[10px] text-white/25 text-center">
            Task auto-expires if no action is taken within 2 minutes
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
