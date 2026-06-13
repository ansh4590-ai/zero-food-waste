import { useAuthStore } from "../store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../components/ThemeProvider";
import { Moon, Sun, Monitor, Bell, Shield, User, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your preferences and account settings.</p>
      </div>

      <div className="grid gap-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Profile Settings</CardTitle>
            <CardDescription>Manage your personal information and contact details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-muted/20">
              <div>
                <p className="font-medium">{user?.fullName || "User Name"}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <Button onClick={() => navigate("/profile")} variant="outline">Edit Profile</Button>
            </div>
            {user?.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="w-4 h-4" /> {user.phone}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Theme Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Monitor className="w-5 h-5" /> Appearance</CardTitle>
            <CardDescription>Customize the look and feel of the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={() => setTheme("light")}
                className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${theme === 'light' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
              >
                <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
                  <Sun className="w-6 h-6" />
                </div>
                <span className="font-medium">Light</span>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
              >
                <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <Moon className="w-6 h-6" />
                </div>
                <span className="font-medium">Dark</span>
              </button>
              <button
                onClick={() => setTheme("system")}
                className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${theme === 'system' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
              >
                <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                  <Monitor className="w-6 h-6" />
                </div>
                <span className="font-medium">System</span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" /> Notifications</CardTitle>
            <CardDescription>Choose what updates you want to receive.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="space-y-0.5">
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive daily summaries and critical alerts.</p>
              </div>
              {/* Visual toggle placeholder */}
              <div className="w-11 h-6 bg-primary rounded-full relative cursor-pointer opacity-70">
                <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="space-y-0.5">
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-muted-foreground">Real-time alerts for reservations and pickups.</p>
              </div>
              <div className="w-11 h-6 bg-primary rounded-full relative cursor-pointer opacity-70">
                <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security & Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Security & Data</CardTitle>
            <CardDescription>Manage your account security and data privacy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full sm:w-auto">Change Password</Button>
            <div className="pt-4 border-t border-border mt-4">
              <Button variant="destructive" className="w-full sm:w-auto">Delete Account</Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
