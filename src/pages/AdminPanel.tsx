import { useState, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// ─── Custom hooks (all state + fetch + effects live here now) ────────────────
import { useKycData } from "../hooks/useKycData";
import { useFleetData } from "../hooks/useFleetData";

// ─── Eagerly loaded components (small, always needed) ────────────────────────
import AdminHeader from "../components/admin/AdminHeader";
import KycStatsCards from "../components/admin/KycStatsCards";
import KycTrendChart from "../components/admin/KycTrendChart";
import VerificationQueue from "../components/admin/VerificationQueue";
import ReviewDialog from "../components/admin/ReviewDialog";
import FleetStatsCards from "../components/admin/FleetStatsCards";

// ─── Lazy-loaded components (heavy: Recharts + Leaflet bundles) ──────────────
const FleetCharts = lazy(() => import("../components/admin/FleetCharts"));
const FleetSidebar = lazy(() => import("../components/admin/FleetSidebar"));
const FleetMap = lazy(() => import("../components/admin/FleetMap"));

/** Shared loading spinner for lazy-loaded fleet components. */
function FleetLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'verification' | 'fleet'>('verification');

  // ─── Data hooks (activated by tab) ──────────────────────────────────────────
  const kyc = useKycData(activeTab === 'verification');
  const fleet = useFleetData(activeTab === 'fleet');

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-64px)] flex flex-col">
      <AdminHeader activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*  TAB: SMART KYC VERIFICATION                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'verification' && (
        <div className="flex-1 overflow-y-auto space-y-6">
          <KycStatsCards stats={kyc.stats} />
          <KycTrendChart trendData={kyc.trendData} trendMax={kyc.trendMax} />
          <VerificationQueue
            users={kyc.users}
            isLoading={kyc.isLoading}
            onRefresh={kyc.refreshAll}
            onSelectUser={kyc.selectUser}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*  TAB: FLEET OPERATIONS                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'fleet' && (
        <div className="flex-1 flex flex-col gap-4">
          <FleetStatsCards intelStats={fleet.intelStats} qrStats={fleet.qrStats} />
          <Suspense fallback={<FleetLoadingFallback />}>
            <FleetCharts dailyRescueTrend={fleet.dailyRescueTrend} categoryBreakdown={fleet.categoryBreakdown} />
          </Suspense>
          <div className="flex-1 bg-[#171a1a] rounded-xl overflow-hidden shadow-xl border border-border relative">
            <Suspense fallback={<FleetLoadingFallback />}>
              <FleetSidebar fleetTasks={fleet.fleetTasks} />
              <FleetMap fleetTasks={fleet.fleetTasks} />
            </Suspense>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*  KYC REVIEW MODAL                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <ReviewDialog
        user={kyc.selectedUser}
        signedUrls={kyc.signedUrls}
        isProcessing={kyc.isProcessing}
        onClose={kyc.closeDialog}
        onApprove={kyc.approveUser}
        onReject={kyc.rejectUser}
      />
    </div>
  );
}
