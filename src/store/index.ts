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
  initializeAuth: () => void;
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
          }
        }
      } catch {}
    }

    // Safety timeout in case remote auth lookup hangs
    setTimeout(() => {
      if (!get().isInitialized) {
        set((state) => ({ ...state, isInitialized: true }));
      }
    }, 1500);

    // ── Supabase: check existing session on load ──────────────────────────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        set({
          user: {
            id: session.user.id,
            email: session.user.email || '',
            role: session.user.user_metadata?.role || 'donor',
            fullName: session.user.user_metadata?.full_name || '',
          },
          isAuthenticated: true,
        });
      }
      set((state) => ({ ...state, isInitialized: true }));
    });

    // ── Supabase: listen for session changes (login / logout / token refresh) ─
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Prevent unnecessary state updates on tab focus/token refresh if it's the same user
        const current = get().user;
        if (current && current.id === session.user.id && current.role === session.user.user_metadata?.role) {
          return;
        }

        set({
          user: {
            id: session.user.id,
            email: session.user.email || '',
            role: session.user.user_metadata?.role || 'donor',
            fullName: session.user.user_metadata?.full_name || '',
          },
          isAuthenticated: true,
        });
      } else {
        // Supabase session ended; only clear state if not in DEV test session
        const isDevTestSession = import.meta.env.DEV && typeof window !== "undefined" &&
          Boolean(window.localStorage.getItem("sb-test-auth-token") || window.localStorage.getItem("test_session"));
        if (!isDevTestSession) {
          set({ user: null, isAuthenticated: false });
        }
      }
    });
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
