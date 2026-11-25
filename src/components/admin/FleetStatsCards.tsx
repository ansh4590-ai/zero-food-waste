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
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Urgent Dispatches Saved</p>
              <p className="text-2xl font-black text-destructive">{intelStats.urgentSaved}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center"><Navigation className="w-5 h-5 text-destructive"/></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-success" /> Avg Freshness Score</p>
              <p className="text-2xl font-black text-success">{intelStats.avgFreshness}%</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-success"/></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-warning" /> Spoilage Prevented</p>
              <p className="text-2xl font-black text-warning">{intelStats.expiredPrevented}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center"><Package className="w-5 h-5 text-warning"/></div>
          </CardContent>
        </Card>
      </div>

      {/* QR Verification Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-info" /> QR Verifications</p>
              <p className="text-2xl font-black text-info">{qrStats.qrVerified}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-info"/></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-success" /> Verification Protocol</p>
              <p className="text-2xl font-black text-success">100% QR</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-success"/></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
});

export default FleetStatsCards;
