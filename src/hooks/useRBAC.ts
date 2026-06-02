import { useRBACContext } from '../contexts/RBACContext';

/**
 * usePermissions - Primary method for checking user capabilities.
 * Prefer this over checking roles directly.
 */
export function usePermissions() {
  const { permissions, isLoading, can } = useRBACContext();
  
  return {
    permissions,
    isLoading,
    can
  };
}

/**
 * useUserRole - Returns the assigned roles for the user.
 * It's recommended to only use this for non-security UI logic (e.g. displaying "Admin Dashboard").
 */
export function useUserRole() {
  const { roles, isLoading, hasRole } = useRBACContext();
  
  return {
    roles,
    primaryRole: roles?.[0] || null, // Best-guess defaults if multiple roles exist
    isLoading,
    hasRole
  };
}
