import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isValidSupabaseId } from '../lib/supabase';
import { useAuthStore } from '../store';
import { AppRole, AppPermission } from '../types/rbac';

interface RBACContextType {
  roles: AppRole[];
  permissions: AppPermission[];
  isLoading: boolean;
  can: (permission: AppPermission | AppPermission[]) => boolean;
  hasRole: (role: AppRole | AppRole[]) => boolean;
}

const RBACContext = createContext<RBACContextType | undefined>(undefined);

export function RBACProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isInitialized } = useAuthStore();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchRBAC() {
      if (!isInitialized) return;
      
      if (!isAuthenticated || !user) {
        if (isMounted) {
          setRoles([]);
          setPermissions([]);
          setIsLoading(false);
        }
        return;
      }

      // Guard: Firebase UIDs are not valid Supabase UUIDs — skip to avoid 400 errors
      if (!isValidSupabaseId(user.id)) {
        if (isMounted) {
          setRoles([]);
          setPermissions([]);
          setIsLoading(false);
        }
        return;
      }

      if (roles.length === 0) {
        setIsLoading(true);
      }

      try {
        // 1. Fetch user role from profiles
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileErr || !profile) {
          /* console.error("Error fetching profile role:", profileErr); removed for security */
          if (isMounted) setIsLoading(false);
          return;
        }

        const currentRole = profile.role as AppRole;
        
        // 2. Fetch specific permissions tied to this role
        const { data: permsData, error: permsErr } = await supabase
          .from('role_permissions')
          .select(`
            permissions ( name )
          `)
          .eq('role', currentRole);

        if (permsErr) {
          /* console.error("Error fetching permissions:", permsErr); removed for security */
        }

        const loadedPerms: Set<AppPermission> = new Set();
        
        permsData?.forEach((rp: any) => {
          if (rp.permissions?.name) {
            loadedPerms.add(rp.permissions.name as AppPermission);
          }
        });

        if (isMounted) {
          setRoles([currentRole]);
          setPermissions(Array.from(loadedPerms));
        }
      } catch (err) {
        /* console.error("RBAC Provider Exception:", err); removed for security */
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchRBAC();

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.role, isAuthenticated, isInitialized]);

  // Helper functions
  const can = (perm: AppPermission | AppPermission[]) => {
    if (Array.isArray(perm)) {
      return perm.some(p => permissions.includes(p));
    }
    return permissions.includes(perm);
  };

  const hasRole = (role: AppRole | AppRole[]) => {
    if (Array.isArray(role)) {
      return role.some(r => roles.includes(r));
    }
    return roles.includes(role);
  };

  return (
    <RBACContext.Provider value={{ roles, permissions, isLoading, can, hasRole }}>
      {children}
    </RBACContext.Provider>
  );
}

export function useRBACContext() {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBACContext must be used within an RBACProvider');
  }
  return context;
}
