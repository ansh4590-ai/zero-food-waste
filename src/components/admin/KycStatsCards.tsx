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
          <Users className="h-5 w-5 text-info mx-auto mb-1" />
          <span className="block text-2xl font-bold text-foreground">{stats.total}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Users</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <CheckCircle2 className="h-5 w-5 text-success mx-auto mb-1" />
          <span className="block text-2xl font-bold text-success">{stats.verified}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <Clock className="h-5 w-5 text-warning mx-auto mb-1" />
          <span className="block text-2xl font-bold text-warning">{stats.pending}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <XCircle className="h-5 w-5 text-destructive mx-auto mb-1" />
          <span className="block text-2xl font-bold text-destructive">{stats.rejected}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Rejected</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <Brain className="h-5 w-5 text-violet mx-auto mb-1" />
          <span className="block text-2xl font-bold text-violet">{stats.autoApproved}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Historical AI matches</span>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <BarChart3 className="h-5 w-5 text-info mx-auto mb-1" />
          <span className="block text-2xl font-bold text-info">{stats.avgScore}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg KYC Score</span>
        </CardContent>
      </Card>
    </div>
  );
});

export default KycStatsCards;
