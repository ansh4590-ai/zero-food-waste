import React from 'react';
import { usePermissions } from '../../hooks/useRBAC';
import { AppPermission } from '../../types/rbac';

interface RoleGateProps {
  children: React.ReactNode;
  permission?: AppPermission | AppPermission[];
  fallback?: React.ReactNode;
  requireAll?: boolean;
}

/**
 * RoleGate - Conditionally render portions of the UI based on user permissions.
 *
 * @param permission A single permission or an array of permissions
 * @param requireAll If an array of permissions is passed, requireAll = true means the user must have ALL of them. False means they just need ONE.
 * @param fallback Element to render if access is denied.
 */
export function RoleGate({ children, permission, fallback = null, requireAll = false }: RoleGateProps) {
  const { can, isLoading } = usePermissions();

  if (isLoading) {
    // Optional: Return a small loader or null to prevent CLS
    return null;
  }

  if (!permission) {
    return <>{children}</>;
  }

  let hasAccess = false;
  
  if (Array.isArray(permission)) {
    if (requireAll) {
      hasAccess = permission.every(p => can(p));
    } else {
      hasAccess = permission.some(p => can(p));
    }
  } else {
    hasAccess = can(permission);
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
