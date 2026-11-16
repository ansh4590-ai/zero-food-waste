// =============================================================================
// useKycData — KYC verification state, fetchers, realtime, and actions
// =============================================================================
// Extracted verbatim from AdminPanel.tsx Phase 1. Zero query behavior changes.
// All Supabase queries, realtime subscription, and mutations are identical.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import type {
  KycProfile,
  KycStats,
  TrendPoint,
  SignedUrls,
} from "../types/admin";

/** Return shape of the useKycData hook. */
export interface UseKycDataReturn {
  // ─── Queue ─────────────────────────────────────────────────────────────────
  users: KycProfile[];
  isLoading: boolean;

  // ─── Analytics ─────────────────────────────────────────────────────────────
  stats: KycStats;
  trendData: TrendPoint[];
  trendMax: number;

  // ─── Review Dialog State ───────────────────────────────────────────────────
  selectedUser: KycProfile | null;
  signedUrls: SignedUrls;
  isProcessing: boolean;

  // ─── Actions ───────────────────────────────────────────────────────────────
  refreshAll: () => void;
  selectUser: (user: KycProfile) => void;
  closeDialog: () => void;
  approveUser: () => Promise<void>;
  rejectUser: (reason: string) => Promise<void>;
}

/**
 * Custom hook that encapsulates all KYC verification data and behavior.
 *
 * @param enabled - Pass `true` when the KYC tab is active. Controls
 *                  whether data is fetched and the realtime subscription
 *                  is established.
 */
export function useKycData(enabled: boolean): UseKycDataReturn {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<KycProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<KycProfile | null>(null);
  const [signedUrls, setSignedUrls] = useState<SignedUrls>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<KycStats>({ total: 0, verified: 0, pending: 0, rejected: 0, autoApproved: 0, avgScore: 0 });
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);

  // ─── FETCH KYC ANALYTICS ──────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const { count: total } = await supabase
        .from("profiles")
        .select("id", { count: "exact" });

      const { count: verified } = await supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .eq("verification_status", "approved");

      const { count: pending } = await supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .eq("verification_status", "pending");

      const { count: rejected } = await supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .eq("verification_status", "rejected");

      const { count: autoApproved } = await supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .eq("kyc_auto_status", "approved");

      // Average KYC score
      const { data: scoreData } = await supabase
        .from("profiles")
        .select("kyc_score")
        .not("kyc_score", "is", null)
        .gt("kyc_score", 0);

      const avgScore = scoreData?.length
        ? Math.round(scoreData.reduce((sum, r) => sum + ((r as { kyc_score: number }).kyc_score || 0), 0) / scoreData.length)
        : 0;

      setStats({
        total: total ?? 0,
        verified: verified ?? 0,
        pending: pending ?? 0,
        rejected: rejected ?? 0,
        autoApproved: autoApproved ?? 0,
        avgScore,
      });
    } catch (e) {
      if (import.meta.env.DEV) console.error("fetchStats error:", e);
      toast.error("Failed to load KYC statistics.");
    }
  }, []);

  // ─── FETCH KYC TREND DATA ────────────────────────────────────────────────
  const fetchTrend = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("kyc_submitted_at")
        .not("kyc_submitted_at", "is", null);

      if (!data) return;

      // Group by date
      const grouped: Record<string, number> = {};
      data.forEach((row) => {
        const date = new Date((row as { kyc_submitted_at: string }).kyc_submitted_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        grouped[date] = (grouped[date] || 0) + 1;
      });

      const points = Object.entries(grouped)
        .map(([date, count]) => ({ date, count }))
        .slice(-7); // Last 7 days

      setTrendData(points);
    } catch (e) {
      if (import.meta.env.DEV) console.error("fetchTrend error:", e);
      toast.error("Failed to load KYC trend data.");
    }
  }, []);

  // ─── FETCH KYC QUEUE (PRIORITY: LATEST FIRST) ─────────────────────────
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone, created_at, verification_status, verification_rejection_reason, documents, is_verified, kyc_submitted_at, location_lat, location_lng, kyc_score, face_match_score, kyc_auto_status, document_verified, extracted_data')
        .in('verification_status', ['pending', 'approved', 'rejected'])
        .order('kyc_submitted_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      setUsers((data as KycProfile[]) || []);
    } catch (error: unknown) {
      const msg = error instanceof Error ? (error as Error).message : JSON.stringify(error);
      toast.error(`Failed to load verification requests: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── INITIAL FETCH + TAB ACTIVATION ───────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    fetchUsers();
    fetchStats();
    fetchTrend();
  }, [enabled, fetchUsers, fetchStats, fetchTrend]);

  // ─── REALTIME: Auto-refresh KYC queue on profile changes ──────────────────
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel("admin-kyc-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "profiles",
      }, () => {
        fetchUsers();
        fetchStats();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [enabled, fetchUsers, fetchStats]);

  // ─── FETCH SIGNED URLS FOR MODAL ──────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const fetchSignedUrls = async () => {
      if (!selectedUser?.documents) {
        if (isMounted) setSignedUrls({});
        return;
      }
      try {
        const { aadhaar, selfie } = selectedUser.documents;
        const urls: SignedUrls = {};
        
        if (aadhaar) {
          const { data, error } = await supabase.storage.from('identity_docs').createSignedUrl(aadhaar, 60 * 5); // 5 mins
          if (error) throw error;
          if (data && isMounted) urls.aadhaar = data.signedUrl;
        }
        if (selfie) {
          const { data, error } = await supabase.storage.from('identity_docs').createSignedUrl(selfie, 60 * 5);
          if (error) throw error;
          if (data && isMounted) urls.selfie = data.signedUrl;
        }
        if (isMounted) setSignedUrls(urls);
      } catch (e) {
        if (import.meta.env.DEV) console.error("Signed URL error:", e);
        if (isMounted) toast.error("Failed to load document previews.");
      }
    };

    fetchSignedUrls();
    return () => {
      isMounted = false;
      setSignedUrls({});
    };
  }, [selectedUser]);

  // ─── ACTIONS ──────────────────────────────────────────────────────────────
  const refreshAll = useCallback(() => {
    fetchUsers();
    fetchStats();
  }, [fetchUsers, fetchStats]);

  const selectUser = useCallback((user: KycProfile) => {
    setSelectedUser(user);
  }, []);

  const closeDialog = useCallback(() => {
    setSelectedUser(null);
  }, []);

  const approveUser = useCallback(async () => {
    if (!selectedUser) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_kyc_status', {
        p_user_id: selectedUser.id,
        p_status: 'approved',
      });
      if (error) throw error;
      if (data?.affected === 0) throw new Error('No rows updated — check permissions');
      toast.success(`${selectedUser.full_name} verified successfully.`);
      setSelectedUser(null);
      fetchUsers();
      fetchStats();
    } catch (e) {
      if (import.meta.env.DEV) console.error("approveUser error:", e);
      toast.error("Failed to approve user. Please try again.");
    } finally { setIsProcessing(false); }
  }, [selectedUser, fetchUsers, fetchStats]);

  const rejectUser = useCallback(async (reason: string) => {
    if (!selectedUser || !reason) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_kyc_status', {
        p_user_id: selectedUser.id,
        p_status: 'rejected',
        p_rejection_reason: reason,
      });
      if (error) throw error;
      if (data?.affected === 0) throw new Error('No rows updated — check permissions');
      toast.success(`Identity rejected.`);
      setSelectedUser(null);
      fetchUsers();
      fetchStats();
    } catch (e) {
      if (import.meta.env.DEV) console.error("rejectUser error:", e);
      toast.error("Failed to reject user. Please try again.");
    } finally { setIsProcessing(false); }
  }, [selectedUser, fetchUsers, fetchStats]);

  // ─── DERIVED DATA ─────────────────────────────────────────────────────────
  const trendMax = useMemo(() => Math.max(...trendData.map(t => t.count), 1), [trendData]);

  return {
    users,
    isLoading,
    stats,
    trendData,
    trendMax,
    selectedUser,
    signedUrls,
    isProcessing,
    refreshAll,
    selectUser,
    closeDialog,
    approveUser,
    rejectUser,
  };
}
