import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';

export interface User {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  /** true when this user was authenticated via Firebase (Google), not Supabase */
  isFirebaseUser?: boolean;
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
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      // ignore if firebase auth is not initialized or logged in
    }
    set({ user: null, isAuthenticated: false });
  },
  initializeAuth: () => {
    // ── Pre-check: if a test session was injected into localStorage ───────────
    if (typeof window !== "undefined") {
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
                isFirebaseUser: false,
              },
              isAuthenticated: true,
              isInitialized: true,
            });
          }
        }
      } catch {}
    }

    let supabaseResolved = false;
    let firebaseResolved = false;

    const checkInit = () => {
      if ((supabaseResolved && firebaseResolved) || (supabaseResolved && get().isAuthenticated)) {
        set((state) => ({ ...state, isInitialized: true }));
      }
    };

    // Safety timeout in case remote Firebase connection hangs or runs in CI/mock environment
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
            isFirebaseUser: false,
          },
          isAuthenticated: true,
        });
      }
      supabaseResolved = true;
      checkInit();
    });

    // ── Supabase: listen for session changes (login / logout / token refresh) ─
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Prevent unnecessary state updates on tab focus/token refresh if it's the same user
        const current = get().user;
        if (current && current.id === session.user.id && current.role === session.user.user_metadata?.role) {
          return;
        }

        // Supabase session always wins – overwrite any Firebase state
        set({
          user: {
            id: session.user.id,
            email: session.user.email || '',
            role: session.user.user_metadata?.role || 'donor',
            fullName: session.user.user_metadata?.full_name || '',
            isFirebaseUser: false,
          },
          isAuthenticated: true,
        });
      } else {
        // Supabase session ended; only clear state if the current user is a
        // Supabase user (don't evict a Firebase-only user)
        const current = get().user;
        if (current && !current.isFirebaseUser) {
          set({ user: null, isAuthenticated: false });
        }
      }
    });

    // ── Firebase: only used when there is NO Supabase session ─────────────────
    // (e.g. Google Sign-In that hasn't been linked to Supabase yet)
    onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Only apply Firebase user if Supabase has no session
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.user) {
            set({
              user: {
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                role: 'donor',
                fullName: firebaseUser.displayName || '',
                isFirebaseUser: true,
              },
              isAuthenticated: true,
            });
          }
          // else: Supabase session already set — Firebase state is ignored
        });
      } else {
        // Firebase signed out — if the current user is a Firebase-only user, clear state
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.user) {
            const current = get().user;
            if (current?.isFirebaseUser || !current) {
              set({ user: null, isAuthenticated: false });
            }
          }
        });
      }
      firebaseResolved = true;
      checkInit();
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
