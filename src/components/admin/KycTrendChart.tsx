import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { TrendingUp } from "lucide-react";
import type { TrendPoint } from "../../types/admin";

interface KycTrendChartProps {
  trendData: TrendPoint[];
  trendMax: number;
}

const KycTrendChart: React.FC<KycTrendChartProps> = React.memo(function KycTrendChart({ trendData, trendMax }) {
  if (trendData.length === 0) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-info" /> KYC Submissions (Last 7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-end gap-2 h-20">
          {trendData.map((point, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-blue-500/80 rounded-t-sm transition-all duration-500 min-h-[4px]"
                style={{ height: `${(point.count / trendMax) * 100}%` }}
                title={`${point.count} submissions`}
              />
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">{point.date}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

export default KycTrendChart;
