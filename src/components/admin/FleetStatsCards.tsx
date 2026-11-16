import React from "react";
import { Card, CardContent } from "../ui/card";
import { AlertTriangle, Navigation, TrendingUp, CheckCircle2, Clock, Package, ShieldCheck } from "lucide-react";
import type { IntelStats, QrStats } from "../../types/admin";

interface FleetStatsCardsProps {
  intelStats: IntelStats;
  qrStats: QrStats;
}

const FleetStatsCards: React.FC<FleetStatsCardsProps> = React.memo(function FleetStatsCards({ intelStats, qrStats }) {
  return (
    <>
      {/* Intelligence Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Urgent Dispatches Saved</p>
              <p className="text-2xl font-black text-red-500">{intelStats.urgentSaved}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center"><Navigation className="w-5 h-5 text-red-500"/></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Avg Freshness Score</p>
              <p className="text-2xl font-black text-emerald-500">{intelStats.avgFreshness}%</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-500"/></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-500" /> Spoilage Prevented</p>
              <p className="text-2xl font-black text-amber-500">{intelStats.expiredPrevented}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center"><Package className="w-5 h-5 text-amber-500"/></div>
          </CardContent>
        </Card>
      </div>

      {/* QR Verification Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> QR Verifications</p>
              <p className="text-2xl font-black text-blue-500">{qrStats.qrVerified}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-blue-500"/></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Verification Protocol</p>
              <p className="text-2xl font-black text-emerald-500">100% QR</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-500"/></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
});

export default FleetStatsCards;
