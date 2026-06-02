import React, { useMemo } from "react";
import { Badge } from "../ui/badge";
import { Navigation } from "lucide-react";
import type { FleetTask, FleetFoodRequest, FleetFoodListing } from "../../types/admin";

interface FleetSidebarProps {
  fleetTasks: FleetTask[];
}

/** Safely extract the first food_request from a fleet task. */
function getFirstRequest(task: FleetTask): FleetFoodRequest | null {
  if (!task.food_requests) return null;
  return Array.isArray(task.food_requests) ? task.food_requests[0] ?? null : task.food_requests;
}

/** Safely extract the first food_listing from a food_request. */
function getFirstListing(req: FleetFoodRequest): FleetFoodListing | null {
  if (!req.food_listings) return null;
  return Array.isArray(req.food_listings) ? req.food_listings[0] ?? null : req.food_listings;
}

const FleetSidebar: React.FC<FleetSidebarProps> = React.memo(function FleetSidebar({ fleetTasks }) {
  const deliveredCount = useMemo(
    () => fleetTasks.filter(t => t.status === 'delivered').length,
    [fleetTasks]
  );

  return (
    <div className="absolute top-4 left-4 z-[400] bg-card text-card-foreground/95 backdrop-blur-md rounded-lg p-4 shadow-xl border border-border w-80">
      <h3 className="font-bold text-foreground flex items-center gap-2 mb-3"><Navigation className="w-5 h-5 text-blue-600"/> Live Agent Tracking</h3>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-muted rounded p-2 text-center">
          <span className="block text-2xl font-bold text-foreground">{fleetTasks.length}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Tasks</span>
        </div>
        <div className="bg-muted rounded p-2 text-center">
          <span className="block text-2xl font-bold text-emerald-500">{deliveredCount}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivered (1h)</span>
        </div>
      </div>
      <div className="space-y-3">
        {fleetTasks.length === 0
          ? <p className="text-sm text-gray-500 text-center py-4">No active agents deployed.</p>
          : fleetTasks.map(t => {
              const volName = (Array.isArray(t.volunteer) ? t.volunteer[0]?.full_name : t.volunteer?.full_name) || 'Unknown Agent';
              const req = getFirstRequest(t);
              const listing = req ? getFirstListing(req) : null;
              return (
                <div key={t.id} className="text-xs border-b border-border last:border-0 pb-2">
                  <strong className="text-foreground flex justify-between">
                    {volName}
                    <Badge variant="outline" className="text-[9px] uppercase">
                      {t.status === 'picked_up' ? 'Delivery' : t.status === 'delivered' ? 'Done' : 'Pickup'}
                    </Badge>
                  </strong>
                  <span className="text-muted-foreground block truncate mt-1">Trgt: {listing?.title ?? '—'}</span>
                </div>
              );
            })
        }
      </div>
    </div>
  );
});

export default FleetSidebar;
