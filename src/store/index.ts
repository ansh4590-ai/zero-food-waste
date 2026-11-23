import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface User {
  id: string;
  email: string;
  role: string;
  fullName?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
  initializeAuth: () => void | (() => void);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,
  login: (user) => set({ user, isAuthenticated: true, isInitialized: true }),
  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },
  initializeAuth: () => {
    // ── Pre-check: if a test session was injected into localStorage (DEV only) ─
    if (import.meta.env.DEV && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("sb-test-auth-token") || window.localStorage.getItem("test_session");
        if (raw) {
          const testSession = JSON.parse(raw);
          if (testSession?.user) {
            set({
              user: {
                id: testSession.user.id,
                email: testSession.user.email || "",
                role: testSession.user.user_metadata?.role || "donor",
                fullName: testSession.user.user_metadata?.full_name || "",
              },
              isAuthenticated: true,
              isInitialized: true,
            });
            return;
          }
        }
      } catch {}
    }

    // Supabase emits INITIAL_SESSION and subsequent sign-in / sign-out events.
    // Query profiles after releasing the auth callback's session lock.
    let revision = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentRevision = ++revision;
      if (!session?.user) {
        set({ user: null, isAuthenticated: false, isInitialized: true });
        return;
      }
      const identity = session.user;
      if (get().user && get().user?.id !== identity.id) {
        set({ user: null, isAuthenticated: false, isInitialized: false });
      }
      setTimeout(async () => {
        if (currentRevision !== revision) return;
        const { data: profile } = await supabase.from("profiles")
          .select("role, full_name")
          .eq("id", identity.id)
          .abortSignal(AbortSignal.timeout(8000))
          .maybeSingle();
        if (currentRevision !== revision) return;
        set({
          user: {
            id: identity.id,
            email: identity.email || "",
            role: profile?.role || "donor",
            fullName: profile?.full_name || identity.user_metadata?.full_name || "",
          },
          isAuthenticated: true,
          isInitialized: true,
        });
      }, 0);
    });
    return () => {
      revision++;
      subscription.unsubscribe();
    };
  },
}));

interface LoadingState {
  isLoading: boolean;
  setLoading: (isLoading: boolean) => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
