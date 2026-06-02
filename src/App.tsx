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

import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Donate from "./pages/Donate";
import Browse from "./pages/Browse";
import Request from "./pages/Request";
import AdminPanel from "./pages/AdminPanel";
import Volunteer from "./pages/Volunteer";
import AdminSignup from "./pages/auth/AdminSignup";
import Login from "./pages/auth/Login";
import AdminLogin from "./pages/auth/AdminLogin";
import RoleSelection from "./pages/auth/RoleSelection";
import DonorSignup from "./pages/auth/DonorSignup";
import ReceiverSignup from "./pages/auth/ReceiverSignup";
import VolunteerSignup from "./pages/auth/VolunteerSignup";
import Verification from "./pages/Verification";
import SupabaseTest from "./pages/SupabaseTest";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Support from "./pages/Support";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";

export default function App() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <RBACProvider>
        <NotificationProvider>
        <Router>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              {/* Public Routes */}
            <Route index element={<Home />} />
            <Route path="test-db" element={<SupabaseTest />} />
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

            {/* Protected Routes - General Logged In Access */}
            <Route element={<ProtectedRoute permission={[]} />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="browse" element={<Browse />} />
              <Route path="requests" element={<Request />} />
              <Route path="verify" element={<Verification />} />
              <Route path="profile" element={<Profile />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>

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
        </Routes>
          <NotificationsListener />
        </Router>
        </NotificationProvider>
      </RBACProvider>
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}
