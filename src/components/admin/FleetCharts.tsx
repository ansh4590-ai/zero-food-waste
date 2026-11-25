import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { BarChart3, Package } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE } from "../../lib/adminUtils";
import type { DailyRescuePoint, CategoryBreakdownPoint } from "../../types/admin";

interface FleetChartsProps {
  dailyRescueTrend: DailyRescuePoint[];
  categoryBreakdown: CategoryBreakdownPoint[];
}

const FleetCharts: React.FC<FleetChartsProps> = React.memo(function FleetCharts({ dailyRescueTrend, categoryBreakdown }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
      {/* Daily Rescue Trend */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" /> Daily Rescue Trend
          </CardTitle>
          <CardDescription className="text-xs">Deliveries completed in the last 7 days</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyRescueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: 'hsl(var(--card-foreground))' }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Food Category Breakdown */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-500" /> Food Category Breakdown
          </CardTitle>
          <CardDescription className="text-xs">Distribution of all listings by category</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 flex items-center gap-4">
          <ResponsiveContainer width="50%" height={180}>
            <PieChart>
              <Pie
                data={categoryBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
              >
                {categoryBreakdown.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1">
            {categoryBreakdown.slice(0, 6).map((cat, i) => (
              <div key={cat.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-muted-foreground truncate">{cat.name}</span>
                <span className="ml-auto font-semibold text-foreground">{cat.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default FleetCharts;
