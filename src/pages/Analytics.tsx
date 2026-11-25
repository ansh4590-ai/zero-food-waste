import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, TrendingDown, Award, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

export default function Analytics() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    completionRate: 0,
    avgPickupTime: 0,
    monthOverMonth: 0,
    weeklyData: [] as any[],
    categoryData: [] as any[]
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!user) return;
      try {
        const [listingsRes, tasksRes] = await Promise.all([
          supabase.from("food_listings").select("status, created_at, food_category, quantity_description"),
          supabase.from("volunteer_tasks").select("status, created_at, updated_at")
        ]);

        const listings = listingsRes.data || [];
        const tasks = tasksRes.data || [];

        // Compute Completion Rate
        let completionRate = 0;
        if (tasks.length > 0) {
          const completedTasks = tasks.filter(t => t.status === 'delivered').length;
          completionRate = Math.round((completedTasks / tasks.length) * 1000) / 10;
        }

        // Compute Avg Pickup Time
        let avgPickupTime = 0;
        const completedTasks = tasks.filter(t => t.status === 'delivered');
        if (completedTasks.length > 0) {
          const totalMs = completedTasks.reduce((sum, t) => {
            const start = new Date(t.created_at).getTime();
            const end = new Date(t.updated_at).getTime();
            return sum + (end - start);
          }, 0);
          avgPickupTime = Math.round(totalMs / completedTasks.length / 60000); // minutes
        }

        // Compute Food Categories
        const categoryMap: Record<string, number> = {};
        listings.forEach(l => {
          const cat = l.food_category || 'Other';
          categoryMap[cat] = (categoryMap[cat] || 0) + 1;
        });
        const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

        // Compute Weekly Impact
        const weeklyMap: Record<string, { donations: number, meals: number }> = {};
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          weeklyMap[days[d.getDay()]] = { donations: 0, meals: 0 };
        }

        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        listings.forEach(l => {
          const date = new Date(l.created_at);
          if (date >= sevenDaysAgo) {
            const dayName = days[date.getDay()];
            if (weeklyMap[dayName]) {
              weeklyMap[dayName].donations++;
              const match = String(l.quantity_description || "").match(/(\d+)/);
              const meals = match ? parseInt(match[1], 10) : 0;
              weeklyMap[dayName].meals += meals;
            }
          }
        });
        
        // Re-order weekly data to start from 6 days ago up to today
        const sortedWeeklyData = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dayName = days[d.getDay()];
          sortedWeeklyData.push({ name: dayName, ...weeklyMap[dayName] });
        }

        // Month over month
        let thisMonth = 0;
        let lastMonth = 0;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        listings.forEach(l => {
          const date = new Date(l.created_at);
          if (date.getFullYear() === currentYear) {
            if (date.getMonth() === currentMonth) thisMonth++;
            if (date.getMonth() === currentMonth - 1) lastMonth++;
          } else if (currentMonth === 0 && date.getFullYear() === currentYear - 1 && date.getMonth() === 11) {
            lastMonth++;
          }
        });
        
        let monthOverMonth = 0;
        if (lastMonth > 0) {
          monthOverMonth = Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;
        } else if (thisMonth > 0) {
          monthOverMonth = 100;
        }

        setStats({
          completionRate,
          avgPickupTime,
          monthOverMonth,
          weeklyData: sortedWeeklyData,
          categoryData
        });
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalytics();
  }, [user]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics & Impact</h1>
        <p className="text-muted-foreground mt-2">Deep dive into your food rescue metrics and efficiency.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/20 rounded-lg text-primary">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completion Rate</p>
                <h3 className="text-2xl font-bold">
                  {isLoading ? "-" : `${stats.completionRate}%`}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Pickup Time</p>
                <h3 className="text-2xl font-bold">
                  {isLoading ? "-" : `${stats.avgPickupTime} mins`}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${stats.monthOverMonth >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                {stats.monthOverMonth >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Month over Month</p>
                <h3 className={`text-2xl font-bold ${stats.monthOverMonth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {isLoading ? "-" : `${stats.monthOverMonth >= 0 ? '+' : ''}${stats.monthOverMonth}%`}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Impact</CardTitle>
            <CardDescription>Meals rescued over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="meals" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Food Categories</CardTitle>
            <CardDescription>Distribution by food type</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : stats.categoryData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No category data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
