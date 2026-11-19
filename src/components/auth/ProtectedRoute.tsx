import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '../../hooks/useRBAC';
import { AppPermission } from '../../types/rbac';
import { useAuthStore } from '../../store';

interface ProtectedRouteProps {
  permission?: AppPermission | AppPermission[];
  requireAll?: boolean;
  redirectPath?: string;
}

/**
 * ProtectedRoute - Component to guard routes using React Router based on exact RBAC permissions.
 *
 * @param permission Single or multiple required permissions. If omitted, just checks if auth is loaded.
 * @param requireAll If array, specify whether ALL or just SOME permissions satisfy the requirement.
 * @param redirectPath URL to navigate to upon failure (default '/dashboard' or similar safe zone).
 */
export function ProtectedRoute({ 
  permission, 
  requireAll = false, 
  redirectPath = '/dashboard' 
}: ProtectedRouteProps) {
  const { can, isLoading } = usePermissions();
  const { isAuthenticated, isInitialized } = useAuthStore(); // Check if logged in

  if (isLoading || !isInitialized) {
    // Render nothing or a full page loader while checking remote capabilities
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  // If no specific permission is required, default to allow if authenticated
  if (!permission || (Array.isArray(permission) && permission.length === 0)) {
    return <Outlet />;
  }

  let hasAccess = false;
  if (Array.isArray(permission)) {
    hasAccess = requireAll 
      ? permission.every(p => can(p)) 
      : permission.some(p => can(p));
  } else {
    hasAccess = can(permission);
  }

  if (!hasAccess) {
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
}
