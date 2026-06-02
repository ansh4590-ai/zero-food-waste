import React from "react";
import { Card, CardContent } from "../ui/card";
import { Users, CheckCircle2, Clock, XCircle, Brain, BarChart3 } from "lucide-react";
import type { KycStats } from "../../types/admin";

interface KycStatsCardsProps {
  stats: KycStats;
}

const KycStatsCards: React.FC<KycStatsCardsProps> = React.memo(function KycStatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <Users className="h-5 w-5 text-blue-500 mx-auto mb-1" />
          <span className="block text-2xl font-bold text-foreground">{stats.total}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Users</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
          <span className="block text-2xl font-bold text-emerald-600">{stats.verified}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
          <span className="block text-2xl font-bold text-amber-600">{stats.pending}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <span className="block text-2xl font-bold text-red-600">{stats.rejected}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Rejected</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <Brain className="h-5 w-5 text-violet-500 mx-auto mb-1" />
          <span className="block text-2xl font-bold text-violet-600">{stats.autoApproved}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Auto Approved</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <BarChart3 className="h-5 w-5 text-cyan-500 mx-auto mb-1" />
          <span className="block text-2xl font-bold text-cyan-600">{stats.avgScore}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg KYC Score</span>
        </CardContent>
      </Card>
    </div>
  );
});

export default KycStatsCards;
