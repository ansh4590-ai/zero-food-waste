/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { Toaster } from "sonner";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { useEffect } from "react";
import { useAuthStore } from "./store";
import { RBACProvider } from "./contexts/RBACContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NotificationsListener } from "./components/NotificationsListener";

import { lazy, Suspense } from "react";

import MainLayout from "./layouts/MainLayout";
import AppLayout from "./layouts/AppLayout";

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Donate = lazy(() => import("./pages/Donate"));
const Browse = lazy(() => import("./pages/Browse"));
const Request = lazy(() => import("./pages/Request"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Volunteer = lazy(() => import("./pages/Volunteer"));
const Profile = lazy(() => import("./pages/Profile"));
const Listings = lazy(() => import("./pages/Listings"));
const Activity = lazy(() => import("./pages/Activity"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));

// Keep auth and lightweight pages statically imported
import AdminSignup from "./pages/auth/AdminSignup";
import Login from "./pages/auth/Login";
import AdminLogin from "./pages/auth/AdminLogin";
import RoleSelection from "./pages/auth/RoleSelection";
import DonorSignup from "./pages/auth/DonorSignup";
import ReceiverSignup from "./pages/auth/ReceiverSignup";
import VolunteerSignup from "./pages/auth/VolunteerSignup";
import Verification from "./pages/Verification";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Support from "./pages/Support";
import Notifications from "./pages/Notifications";

export default function App() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <RBACProvider>
        <NotificationProvider>
        <Router>
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>}>
            <Routes>
              {/* Public Routes - using MainLayout (Top Nav + Footer) */}
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Home />} />
                <Route path="auth/login" element={<Login />} />
                <Route path="register" element={<RoleSelection />} />
                <Route path="register/donor" element={<DonorSignup />} />
                <Route path="register/receiver" element={<ReceiverSignup />} />
                <Route path="register/volunteer" element={<VolunteerSignup />} />
                <Route path="admin/signup" element={<AdminSignup />} />
                <Route path="admin-login" element={<AdminLogin />} />
                
                <Route path="privacy" element={<Privacy />} />
                <Route path="terms" element={<Terms />} />
                <Route path="support" element={<Support />} />
              </Route>

              {/* Protected Routes - using AppLayout (Sidebar + Header) */}
              <Route element={<ProtectedRoute permission={[]} />}>
                <Route element={<AppLayout />}>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="browse" element={<Browse />} />
                  <Route path="requests" element={<Request />} />
                  <Route path="verify" element={<Verification />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="listings" element={<Listings />} />
                  <Route path="activity" element={<Activity />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="settings" element={<Settings />} />

                  {/* Permission Based Routes */}
                  <Route element={<ProtectedRoute permission="food.create" />}>
                    <Route path="donate" element={<Donate />} />
                  </Route>

                  <Route element={<ProtectedRoute permission="tasks.view_assigned" />}>
                    <Route path="tasks" element={<Volunteer />} />
                  </Route>

                  <Route element={<ProtectedRoute permission="users.read" />}>
                    <Route path="admin" element={<AdminPanel />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </Suspense>
          <NotificationsListener />
        </Router>
        </NotificationProvider>
      </RBACProvider>
      <Toaster position="top-center" richColors theme="dark" />
    </ThemeProvider>
  );
}
