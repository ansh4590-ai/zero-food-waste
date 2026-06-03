import { useState, useEffect, useCallback, Fragment, useRef, useMemo } from "react";
import { useRealtimeHealth } from "../hooks/useRealtimeHealth";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  MapPin, Navigation, CheckCircle2, RefreshCw, ShieldCheck,
  Route, Loader2, Clock, WifiOff, Package, Truck, Flag, AlertTriangle
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { Link } from "react-router-dom";
import { calculateHaversineDistance, formatDistance } from "../lib/distance";
import { fetchOSRMRoute, OSRMRouteResult, formatETA } from "../lib/osrm";
import { computePriorityScore, sortMultiTaskSequence, MultiTaskContext } from "../lib/dispatch";
import { GEO_CONFIG, API_BASE, RPC, TABLES, VOLUNTEER_STATUS, ROUTABLE_STATUSES, MY_TASK_STATUSES } from "../lib/constants";
import { getPickupWindowStatus, formatPickupCountdown } from "../lib/utils";
import { TaskAssignmentModal } from "../components/TaskAssignmentModal";
import { OTPModal } from "../components/OTPModal";
import { QRScannerModal } from "../components/QRVerification";
import { ProgressTimeline, VOLUNTEER_TIMELINE_STAGES } from "../components/ProgressTimeline";
import { NeonBadge } from "../components/ui/NeonBadge";
import { AnimatedContainer } from "../components/ui/AnimatedContainer";

// ─── LEAFLET SETUP ────────────────────────────────────────────────────────────
if (typeof L !== "undefined" && L.Icon?.Default) {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
}

const createDivIcon = (color: string, isPulsing = false) => {
  if (typeof L === "undefined") return undefined;
  return L.divIcon({
    className: "custom-pin",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;background:${color};border-radius:50%;border:2.5px solid #0f1111;box-shadow:0 4px 14px rgba(0,0,0,0.6);">
              <div style="width:9px;height:9px;background:#fff;border-radius:50%;${isPulsing ? "animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;" : ""}"></div>
            </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

const liveGPSIcon = typeof L !== "undefined"
  ? L.divIcon({
    className: "live-gps-dot",
    html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 0 15px rgba(59,130,246,0.8);position:relative;">
                <div style="position:absolute;top:-5px;left:-5px;right:-5px;bottom:-5px;border-radius:50%;border:1.5px solid #3b82f6;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
              </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
  : undefined;

// ─── MAP CONTROLLER ───────────────────────────────────────────────────────────
function DynamicMapController({
  tasks, activeTaskId, livePos, osrmGeometry,
}: {
  tasks: VolunteerTask[];
  activeTaskId: string | null;
  livePos: { lat: number; lng: number };
  osrmGeometry?: OSRMRouteResult["geometry"];
}) {
  const map = useMap();
  useEffect(() => {
    if (!tasks.length) { map.setView([livePos.lat, livePos.lng], 12); return; }
    if (activeTaskId) {
      const active = tasks.find(t => t.id === activeTaskId);
      if (active) {
        let coords: [number, number][] =
          osrmGeometry?.length
            ? osrmGeometry.map(p => [p.lat, p.lng])
            : [[livePos.lat, livePos.lng], [active.pickupLat, active.pickupLng], ...(active.dropoffLat != null && active.dropoffLng != null ? [[active.dropoffLat, active.dropoffLng] as [number, number]] : [])];
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true, duration: 1 });
        return;
      }
    }
    const pts = tasks.flatMap(t => [[t.pickupLat, t.pickupLng], [t.dropoffLat, t.dropoffLng]] as [number, number][]);
    const bounds = L.latLngBounds([[livePos.lat, livePos.lng], ...pts]);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12, animate: true });
  }, [tasks, activeTaskId, map, livePos.lat, livePos.lng, osrmGeometry]);
  return null;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface VolunteerTask {
  id: string;
  requestId: string;
  name: string;
  quantity: string;
  type: string;
  status: string;
  expiryTime: string | null;
  createdAt: string;

  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  pickupWindow: string;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;

  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;

  volunteerLat: number;
  volunteerLng: number;

  distanceKm?: number;
  priorityScore?: number;
  hasCoords: boolean; // false if receiver/pickup coords are missing

  // AI Fields
  dbPriorityScore?: number | null;
  estimatedSafeHours?: number | null;
  spoilageRisk?: string | null;
}

interface JoinedTaskRow {
  id: string;
  request_id: string;
  status: string;
  created_at?: string;
  food_requests?: {
    id: string;
    listing_id: string;
    drop_lat: number | null;
    drop_lng: number | null;
    receiver?: { location_text: string } | null;
    food_listings?: {
      id: string;
      pickup_lat: number | null;
      pickup_lng: number | null;
      title: string | null;
      pickup_window: string | null;
      pickup_window_start?: string | null;
      pickup_window_end?: string | null;
      quantity_description: string | null;
      location_name: string | null;
      expiry_time: string | null;
      priority_score: number | null;
      estimated_safe_hours: number | null;
      spoilage_risk: string | null;
    } | null;
  } | null;
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function getRiskColor(risk: string | null | undefined) {
  if (!risk) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  const str = risk.toLowerCase();
  if (str === "high" || str === "critical") return "bg-red-500/20 text-red-500 border-red-500/30";
  if (str === "medium") return "bg-amber-500/20 text-amber-500 border-amber-500/30";
  return "bg-emerald-500/20 text-emerald-500 border-emerald-500/30";
}

function getSafeExpirationInfo(expiryTime: string | null) {
  if (!expiryTime) return null;

  const expiresMs = new Date(expiryTime).getTime();
  const now = Date.now();

  if (now > expiresMs) {
    return {
      expired: true,
      text: "Expired",
      msRemaining: 0
    };
  }

  const diffH = (expiresMs - now) / 3600000;

  return {
    expired: false,
    diffH,
    text: `Expires in ${Math.floor(diffH)}h ${Math.floor((diffH % 1) * 60)}m`,
    msRemaining: expiresMs - now
  };
}

// ─── STATUS CONFIG (matches real volunteer_status enum) ─────────────────────
const TASK_STAGES: Record<string, { label: string; color: string; icon: React.ReactNode; step: number }> = {
  [VOLUNTEER_STATUS.OPEN]:               { label: "Open", color: "#6b7280", icon: <Package className="w-3.5 h-3.5" />, step: 0 },
  [VOLUNTEER_STATUS.PENDING_ACCEPTANCE]: { label: "Action Required", color: "#ef4444", icon: <ShieldCheck className="w-3.5 h-3.5" />, step: 0 },
  [VOLUNTEER_STATUS.ASSIGNED]:           { label: "Heading to Pickup", color: "#f59e0b", icon: <Navigation className="w-3.5 h-3.5" />, step: 1 },
  [VOLUNTEER_STATUS.PICKED_UP]:          { label: "Out for Delivery", color: "#3b82f6", icon: <Truck className="w-3.5 h-3.5" />, step: 2 },
  [VOLUNTEER_STATUS.DELIVERED]:          { label: "Completed", color: "#10b981", icon: <CheckCircle2 className="w-3.5 h-3.5" />, step: 3 },
  [VOLUNTEER_STATUS.CANCELLED]:          { label: "Cancelled", color: "#6b7280", icon: <Package className="w-3.5 h-3.5" />, step: 0 },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Volunteer() {
  const { user } = useAuthStore();
  const [openTasks, setOpenTasks] = useState<VolunteerTask[]>([]);
  const [myTasks, setMyTasks] = useState<VolunteerTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string>("loading");
  const [taskToComplete, setTaskToComplete] = useState<VolunteerTask | null>(null);
  const [useHardwareGPS, setUseHardwareGPS] = useState(false);
  const [livePos, setLivePos] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navSteps, setNavSteps] = useState<Array<{ instruction: string; distance: string; isActive: boolean }>>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // Abort state
  const [abortModal, setAbortModal] = useState<{ open: boolean; taskId: string }>({ open: false, taskId: '' });
  const [abortReason, setAbortReason] = useState("");
  const [isAborting, setIsAborting] = useState(false);

  // OTP state
  const [otpModal, setOtpModal] = useState<{ open: boolean; taskId: string; type: 'pickup' | 'delivery' }>({ open: false, taskId: '', type: 'pickup' });
  // QR scanner state
  const [qrScan, setQrScan] = useState<{ open: boolean; type: 'pickup' | 'delivery'; taskId: string }>({ open: false, type: 'pickup', taskId: '' });
  // Live countdown timer (consolidated)
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick(c => c + 1), GEO_CONFIG.COUNTDOWN_TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isRouteFetching, setIsRouteFetching] = useState(false);

  // OSRM route state
  const [routeOne, setRouteOne] = useState<OSRMRouteResult | null>(null); // primary segment
  const [routeTwo, setRouteTwo] = useState<OSRMRouteResult | null>(null); // secondary segment
  const [dynamicETA, setDynamicETA] = useState<string | null>(null);
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null);

  const routeSimIndex = useRef(0);

  const routeRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // GPS debounce: only update route if volunteer moved ≥50m
  const lastGPSPos = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // ─── LOAD PROFILE LOCATION ON MOUNT (replaces hardcoded DEFAULT_CENTER) ───
  useEffect(() => {
    if (!user || !isValidSupabaseId(user.id)) return;
    (async () => {
      const { data: profile } = await supabase
        .from(TABLES.PROFILES)
        .select("location_lat, location_lng")
        .eq("id", user.id)
        .single();
      if (profile?.location_lat && profile?.location_lng) {
        const pos = { lat: profile.location_lat, lng: profile.location_lng };
        setLivePos(pos);
        lastGPSPos.current = pos;
        livePosRef.current = pos;
      }
      setProfileLoaded(true);
    })();
  }, [user]);

  // ─── NETWORK DETECTION ──────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ─── HARDWARE GPS with debounce ─────────────────────────────────────────
  const livePosRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  useEffect(() => { livePosRef.current = livePos; }, [livePos]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let isMounted = true;
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        if (!isMounted) return;
        setUseHardwareGPS(true);
        const { latitude: lat, longitude: lng } = pos.coords;

        // Only update state/DB if volunteer moved
        const movedKm = calculateHaversineDistance(
          lastGPSPos.current.lat, lastGPSPos.current.lng, lat, lng
        );
        if (movedKm * 1000 < GEO_CONFIG.GPS_DEBOUNCE_METERS) return;

        lastGPSPos.current = { lat, lng };
        setLivePos({ lat, lng });
        if (user && isValidSupabaseId(user.id)) {
          supabase.from(TABLES.PROFILES)
            .update({ location_lat: lat, location_lng: lng })
            .eq("id", user.id)
            .then();
        }
      },
      () => { if (isMounted) setUseHardwareGPS(false); },
      { enableHighAccuracy: true, maximumAge: GEO_CONFIG.MAX_WATCH_AGE_MS, timeout: GEO_CONFIG.WATCH_TIMEOUT_MS }
    );
    return () => { isMounted = false; navigator.geolocation.clearWatch(watchId); };
  }, [user]);

  // ─── DATA TRANSFORMERS ──────────────────────────────────────────────────────
  const transformOpenRow = (row: Record<string, unknown>): VolunteerTask | null => {
    const listing = Array.isArray(row.food_listings) ? row.food_listings[0] : row.food_listings;
    if (!listing) return null;

    if (!listing.pickup_lat || !listing.pickup_lng) {
      console.error("❌ Missing pickup location", row);
      return null;
    }

    const pickupLat = listing.pickup_lat;
    const pickupLng = listing.pickup_lng;
    const dropoffLat = (row.drop_lat as number) ?? null;
    const dropoffLng = (row.drop_lng as number) ?? null;
    const receiverLocation = (row.receiver as any)?.location_text || "Location unavailable";
    const hasCoords = !!(pickupLat && pickupLng && dropoffLat && dropoffLng);

    return {
      id: row.id as string,
      requestId: row.id as string,
      name: listing.title ?? "Food Donation",
      quantity: listing.quantity_description ?? "–",
      type: "pickup",
      status: row.status as string,
      expiryTime: listing.expiry_time ?? null,
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
      pickupAddress: listing.location_name ?? "Pickup Location",
      pickupLat,
      pickupLng,
      pickupWindow: listing.pickup_window ?? "Flexible",
      pickupWindowStart: listing.pickup_window_start,
      pickupWindowEnd: listing.pickup_window_end,
      dropoffAddress: receiverLocation,
      dropoffLat,
      dropoffLng,
      volunteerLat: livePosRef.current.lat,
      volunteerLng: livePosRef.current.lng,
      hasCoords,
      dbPriorityScore: listing.priority_score,
      estimatedSafeHours: listing.estimated_safe_hours,
      spoilageRisk: listing.spoilage_risk,
    };
  };

  // ─── FETCH TASKS ────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!user || !isValidSupabaseId(user.id)) return;
    try {
      const { data: profile } = await supabase
        .from(TABLES.PROFILES)
        .select("verification_status, location_lat, location_lng")
        .eq("id", user.id)
        .single();

      if (profile) {
        setVerificationStatus(profile.verification_status ?? "unset");
        if (!useHardwareGPS && profile.location_lat && profile.location_lng) {
          setLivePos({ lat: profile.location_lat, lng: profile.location_lng });
        }
      }

      const { data: myTasksRaw, error: myError } = await supabase
        .from(TABLES.VOLUNTEER_TASKS)
        .select(`
          id, request_id, status, created_at,
          food_requests (
            id, listing_id, drop_lat, drop_lng,
            receiver:profiles!food_requests_receiver_id_fkey(location_text),
            food_listings (
              id, pickup_lat, pickup_lng, title, pickup_window, pickup_window_start, pickup_window_end, quantity_description, location_name, expiry_time, priority_score, estimated_safe_hours, spoilage_risk
            )
          )
        `)
        .eq("volunteer_id", user.id)
        .in("status", MY_TASK_STATUSES as unknown as string[]);

      if (myError && import.meta.env.DEV) console.error("Supabase error [myTasksRaw]:", myError);

      const myRequestIds = new Set(
        (myTasksRaw ?? []).map((row: Record<string, unknown>) => row.request_id as string | undefined).filter(Boolean)
      );

      const OPEN_REQUEST_STATUSES = ["pending"] as const;
      const { data: openData, error: openError } = await supabase
        .from(TABLES.FOOD_REQUESTS)
        .select(`
            id, status, volunteer_id, drop_lat, drop_lng, created_at,
            receiver:profiles!food_requests_receiver_id_fkey(location_text),
            food_listings!inner ( id, pickup_lat, pickup_lng, title, pickup_window, pickup_window_start, pickup_window_end, quantity_description, location_name, expiry_time, priority_score, estimated_safe_hours, spoilage_risk )
          `)
        .in("status", OPEN_REQUEST_STATUSES as unknown as string[])
        .is("volunteer_id", null)
        .gt("food_listings.expiry_time", new Date().toISOString());

      if (openError && import.meta.env.DEV) console.error("Supabase error [openData]:", openError);

      let mappedOpen = openData
        ? (openData.map(transformOpenRow).filter(Boolean) as VolunteerTask[])
          .filter(task => {
            if (myRequestIds.has(task.requestId)) return false;
            if (!task.expiryTime) return true;
            return new Date(task.expiryTime).getTime() > Date.now();
          })
          .map(task => ({
            ...task,
            distanceKm: calculateHaversineDistance(livePosRef.current.lat, livePosRef.current.lng, task.pickupLat, task.pickupLng),
            priorityScore: task.dbPriorityScore ?? computePriorityScore(
              { pickupLat: task.pickupLat, pickupLng: task.pickupLng, status: task.status, pickupWindow: task.pickupWindow, expiryTime: task.expiryTime, createdAt: task.createdAt },
              livePosRef.current.lat, livePosRef.current.lng
            ),
          }))
        : [];

      mappedOpen = mappedOpen.filter(
        (task, index, self) => index === self.findIndex(t => t.requestId === task.requestId)
      );
      mappedOpen = mappedOpen.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
      setOpenTasks(mappedOpen);

      let finalTasks: VolunteerTask[] = [];

      for (const row of (myTasksRaw as unknown as JoinedTaskRow[]) || []) {
        const request = Array.isArray(row.food_requests) ? row.food_requests[0] : row.food_requests;
        if (!request) continue;

        const listing = Array.isArray(request.food_listings) ? request.food_listings[0] : request.food_listings;
        if (!listing || !listing.pickup_lat || !listing.pickup_lng) continue;

        const pickupLat = listing.pickup_lat;
        const pickupLng = listing.pickup_lng;
        const dropoffLat = request.drop_lat ?? null;
        const dropoffLng = request.drop_lng ?? null;
        const receiverLocation = Array.isArray(request.receiver) ? request.receiver[0]?.location_text : request.receiver?.location_text || "Location unavailable";

        finalTasks.push({
          id: row.id,
          requestId: request.id,
          name: listing.title ?? "Food Donation",
          quantity: listing.quantity_description ?? "–",
          type: "pickup",
          status: row.status,
          expiryTime: listing.expiry_time ?? null,
          createdAt: row.created_at ?? new Date().toISOString(),
          pickupAddress: listing.location_name ?? "Pickup Location",
          pickupLat,
          pickupLng,
          pickupWindow: listing.pickup_window ?? "Flexible",
          pickupWindowStart: listing.pickup_window_start,
          pickupWindowEnd: listing.pickup_window_end,
          dropoffAddress: receiverLocation,
          dropoffLat,
          dropoffLng,
          volunteerLat: livePosRef.current.lat,
          volunteerLng: livePosRef.current.lng,
          hasCoords: !!(listing.pickup_lat && listing.pickup_lng),
          dbPriorityScore: listing.priority_score,
          estimatedSafeHours: listing.estimated_safe_hours,
          spoilageRisk: listing.spoilage_risk
        });
      }

      setMyTasks(finalTasks);
      if (finalTasks.length === 1) {
        setActiveTaskId(prev => prev || finalTasks[0].id);
      }
    } catch (err) {
      console.error("fetchTasks error:", err);
    }
  }, [user, useHardwareGPS]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Upgrade 3: Auto-refetch on tab focus / network restore
  useRealtimeHealth(fetchTasks);

  // ─── REALTIME SUBSCRIPTIONS ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !isValidSupabaseId(user.id)) return;
    let debounceTimer: NodeJS.Timeout;
    const refresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchTasks();
      }, 300);
    };
    const channel = supabase
      .channel("volunteer-logistics-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.VOLUNTEER_TASKS }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.FOOD_REQUESTS }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.FOOD_LISTINGS }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchTasks]);

  // ─── OSRM DUAL-SEGMENT & MULTI-TASK ROUTING ────────────────────────────────
  const stableTasks = useMemo(() => myTasks, [myTasks]);

  const calculateRoutes = useCallback(async (forceRefresh = false) => {
    if (isOffline) return;

    // Route only tasks where the volunteer is actively moving.
    const validTasks = stableTasks.filter(t => (ROUTABLE_STATUSES as readonly string[]).includes(t.status));

    if (!validTasks.length) {
      setRouteOne(null); setRouteTwo(null); setDynamicETA(null); setCurrentInstruction(null); return;
    }

    setIsRouteFetching(true);
    try {
      if (validTasks.length === 1) {
        const targetTask = validTasks[0];
        if (targetTask.status === "picked_up") {
          if (targetTask.dropoffLat == null || targetTask.dropoffLng == null) {
            setRouteOne(null); setRouteTwo(null); setDynamicETA(null); setCurrentInstruction(null); return;
          }
          const r2 = await fetchOSRMRoute(
            [{ lat: livePosRef.current.lat, lng: livePosRef.current.lng }, { lat: targetTask.dropoffLat, lng: targetTask.dropoffLng }],
            { useCache: !forceRefresh }
          );
          setRouteOne(r2); // promote to primary rendering
          setRouteTwo(null);
          if (r2) setDynamicETA(formatETA(r2.durationSeconds));
          routeSimIndex.current = 0;
        } else {
          const [r1, r2] = await Promise.all([
            fetchOSRMRoute([{ lat: livePosRef.current.lat, lng: livePosRef.current.lng }, { lat: targetTask.pickupLat, lng: targetTask.pickupLng }], { useCache: !forceRefresh }),
            (targetTask.dropoffLat != null && targetTask.dropoffLng != null) ? fetchOSRMRoute([{ lat: targetTask.pickupLat, lng: targetTask.pickupLng }, { lat: targetTask.dropoffLat, lng: targetTask.dropoffLng }], { useCache: !forceRefresh }) : Promise.resolve(null),
          ]);
          setRouteOne(r1);
          setRouteTwo(r2);
          if (r1 && r2) setDynamicETA(formatETA(r1.durationSeconds + r2.durationSeconds));
          else if (r1) setDynamicETA(formatETA(r1.durationSeconds));
          else if (r2) setDynamicETA(formatETA(r2.durationSeconds));
          routeSimIndex.current = 0;
        }
      } else {
        // Multi-task handling via greedy nearest neighbor sequence
        const validSeqTasks = validTasks.filter(t => t.dropoffLat != null && t.dropoffLng != null);
        if (!validSeqTasks.length) { setRouteOne(null); setRouteTwo(null); setDynamicETA(null); return; }
        const sequence = sortMultiTaskSequence(validSeqTasks as MultiTaskContext[], livePosRef.current.lat, livePosRef.current.lng);
        const points = sequence.map(s => s.nextNodeRole === 'pickup'
          ? { lat: s.task.pickupLat, lng: s.task.pickupLng }
          : { lat: s.task.dropoffLat!, lng: s.task.dropoffLng! }
        );
        const seqRoute = await fetchOSRMRoute([livePosRef.current, ...points], { useCache: !forceRefresh });
        setRouteOne(seqRoute);
        setRouteTwo(null);
        if (seqRoute) setDynamicETA(formatETA(seqRoute.durationSeconds));
        routeSimIndex.current = 0;
      }
    } finally {
      setIsRouteFetching(false);
    }
  }, [stableTasks, isOffline]);

  // Re-calculate when active task or its status changes
  const activeTaskStatus = myTasks.find(t => t.id === activeTaskId)?.status;
  useEffect(() => {
    calculateRoutes();
  }, [activeTaskId, activeTaskStatus, calculateRoutes]);

  // Periodic re-calculation every 30 seconds while a task is active
  useEffect(() => {
    if (routeRefreshTimer.current) clearInterval(routeRefreshTimer.current);
    if (activeTaskId) {
      routeRefreshTimer.current = setInterval(() => {
        calculateRoutes(true); // bypass cache for periodic refresh
      }, GEO_CONFIG.ROUTE_REFRESH_INTERVAL_MS);
    }
    return () => { if (routeRefreshTimer.current) clearInterval(routeRefreshTimer.current); };
  }, [activeTaskId, calculateRoutes]);

  // ─── GPS SIMULATION & TURN-BY-TURN along OSRM polyline ────────────────────────
  useEffect(() => {
    const trackRoute = routeOne || routeTwo;
    if (!trackRoute?.geometry?.length) return;

    // Simulate GPS movement if hardware toggle disabled
    const interval = !useHardwareGPS ? setInterval(() => {
      if (routeSimIndex.current < trackRoute.geometry.length - 1) {
        routeSimIndex.current += 1;
        const newPos = trackRoute.geometry[routeSimIndex.current];
        setLivePos(newPos);
        const ratio = 1 - routeSimIndex.current / trackRoute.geometry.length;
        const remaining = trackRoute.durationSeconds * ratio;
        const totalRemaining = routeOne && routeTwo ? remaining + routeTwo.durationSeconds : remaining;
        setDynamicETA(formatETA(totalRemaining));
      }
    }, 1200) : undefined;

    // Extract ALL turn-by-turn steps for navigation panel
    const allSteps: Array<{ instruction: string; distance: string; isActive: boolean }> = [];
    const legs = [...(routeOne?.legs || []), ...(routeTwo?.legs || [])];
    legs.forEach(leg => {
      if (!leg.steps) return;
      leg.steps.forEach((s: any, i: number) => {
        if (!s.maneuver) return;
        const type = s.maneuver.type || '';
        const modifier = s.maneuver.modifier || '';
        const name = s.name || '';
        if (type === 'arrive' && i === leg.steps.length - 1) {
          allSteps.push({ instruction: `Arrive at ${name || 'destination'}`, distance: '', isActive: false });
          return;
        }
        if (type === 'depart') {
          allSteps.push({ instruction: `Head ${modifier || 'forward'}${name ? ' on ' + name : ''}`, distance: formatDistance(s.distance || 0), isActive: false });
          return;
        }
        let verb = type.replace(/-/g, ' ');
        verb = verb.charAt(0).toUpperCase() + verb.slice(1);
        if (modifier) verb += ` ${modifier}`;
        allSteps.push({ instruction: `${verb}${name ? ' onto ' + name : ''}`, distance: formatDistance(s.distance || 0), isActive: false });
      });
    });
    if (allSteps.length > 0) {
      allSteps[0].isActive = true;
      setCurrentInstruction(allSteps[0].instruction);
    }
    setNavSteps(allSteps);
    setCurrentStepIdx(0);

    return () => { if (interval) clearInterval(interval); };
  }, [routeOne, routeTwo, useHardwareGPS]);

  // ─── IN-MAP NAVIGATION HANDLER ───────────────────────────────────────────────
  const handleNavigateInMap = useCallback((task: VolunteerTask) => {
    setActiveTaskId(task.id);
    setIsNavigating(true);
    calculateRoutes(true);
    toast.success('Navigation started', {
      description: 'Route displayed on map with turn-by-turn directions.',
      style: { background: '#171a1a', color: '#f5f3ef', border: '1px solid #3b82f6' },
      duration: 3000,
    });
  }, [calculateRoutes]);

  // ─── ACTIONS ────────────────────────────────────────────────────────────────

  /** Generate pickup OTP when task is claimed/accepted, so donor can see it */
  const generateOTPForTask = async (taskId: string, otpType: 'pickup' | 'delivery') => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/generate-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp_type: otpType }),
      });
      const data = await res.json();
      if (data.success && data.otp) {
        // The OTP is shown to donor/receiver via notification or their UI
        // For now we just log it — the donor-side will display it
        if (import.meta.env.DEV) console.log(`[OTP] ${otpType} OTP for task ${taskId} generated.`);
      }
    } catch (err) {
      console.error("generateOTPForTask error:", err);
      toast.error("Failed to generate OTP.");
    }
  };

  const handleAssignment = async (task: VolunteerTask, action: "accept" | "decline") => {
    if (loadingTaskId) return;
    setLoadingTaskId(task.id);
    try {
      const { data, error } = await supabase.rpc(RPC.HANDLE_ASSIGNMENT, {
        p_task_id: task.id,
        p_volunteer_id: user?.id,
        p_action: action,
      });
      if (error || !data?.success) throw error || new Error(data?.error);

      toast.success(action === "accept" ? "Assignment Accepted!" : "Assignment Declined.");
      if (action === "accept") {
        // Pre-generate pickup QR for the donor to display
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          toast.error("Session expired. Please log in again.");
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/tasks/${task.id}/generate-qr`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ type: 'pickup' }),
          });
          if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || "QR generation failed");
          }
        } catch (err: unknown) {
          console.error("Failed to generate pickup QR:", err);
        }
      }
      fetchTasks();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Network error. Please try again.");
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleClaimTask = async (task: VolunteerTask) => {
    if (loadingTaskId) return;
    if (isOffline) { toast.error("You are offline. Reconnect to claim tasks."); return; }
    if (!user || !isValidSupabaseId(user.id)) { toast.error("Please log in to claim tasks."); return; }
    
    // Strict window check for claiming
    const windowStatus = getPickupWindowStatus(task.pickupWindowStart, task.pickupWindowEnd);
    if (windowStatus === 'upcoming') {
      toast.error("Pickup window has not opened yet. Please wait until the start time.");
      return;
    }
    if (windowStatus === 'expired') {
      toast.error("Pickup window has closed. You can no longer claim this task.");
      return;
    }

    if (!task.hasCoords) {
      toast.warning("This task has incomplete location data. It may affect routing accuracy.", {
        description: "Proceeding with approximate coordinates.",
      });
    }

    // Optimistic removal
    const prevTasks = [...openTasks];
    setOpenTasks(prev => prev.filter(t => t.id !== task.id));
    setLoadingTaskId(task.id);
    try {
      const { data, error } = await supabase.rpc(RPC.CLAIM_TASK, {
        p_request_id: task.requestId,
        p_volunteer_id: user.id,
      });

      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error ?? "Could not claim this task.");
        return;
      }

      // Generate pickup OTP + QR token
      // We need the volunteer_task ID — refetch to get it
      const { data: newTask } = await supabase
        .from(TABLES.VOLUNTEER_TASKS)
        .select('id')
        .eq('request_id', task.requestId)
        .eq('volunteer_id', user.id)
        .single();
      if (newTask) {
        // Pre-generate pickup QR token for donor to display
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          toast.error("Session expired. Please log in again.");
          setOpenTasks(prevTasks); // restore since we couldn't generate QR
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/tasks/${newTask.id}/generate-qr`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ type: 'pickup' }),
          });
          if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || "QR generation failed");
          }
        } catch (err: unknown) {
          console.error("Failed to generate pickup QR:", err);
        }
      }

      toast.success("Route Dispatched!", {
        description: "OSRM is calculating your optimal path. QR code sent to donor.",
        style: { background: "#171a1a", color: "#f5f3ef", border: "1px solid #10b981" },
      });
      await fetchTasks();
    } catch (err: unknown) {
      setOpenTasks(prevTasks); // restore
      toast.error((err as Error)?.message || "Network error. Please try again.");
    } finally {
      setLoadingTaskId(null);
    }
  };

  // ─── OTP-DRIVEN STATUS ADVANCE ──────────────────────────────────────────────
  // Instead of directly advancing status, we open the OTP modal.
  // The OTP RPC atomically advances the status upon successful verification.

  const checkGracePeriod = (task: VolunteerTask) => {
    const windowStatus = getPickupWindowStatus(task.pickupWindowStart, task.pickupWindowEnd);
    if (windowStatus === 'expired') {
       toast.error("Pickup window has expired (including the 15m grace period). Action blocked.");
       return false;
    }
    return true;
  };

  const handleOpenPickupOTP = (task: VolunteerTask) => {
    if (isOffline) { toast.error("You are offline. Cannot verify OTP."); return; }
    if (!checkGracePeriod(task)) return;
    setOtpModal({ open: true, taskId: task.id, type: 'pickup' });
  };

  const handleOpenDeliveryOTP = (task: VolunteerTask) => {
    if (isOffline) { toast.error("You are offline. Cannot verify OTP."); return; }
    setOtpModal({ open: true, taskId: task.id, type: 'delivery' });
  };

  // ─── QR-DRIVEN VERIFICATION ────────────────────────────────────────────────
  const handleOpenPickupQR = (task: VolunteerTask) => {
    if (isOffline) { toast.error("You are offline."); return; }
    if (!checkGracePeriod(task)) return;
    setQrScan({ open: true, type: 'pickup', taskId: task.id });
    // Store active task for verification context
    setActiveTaskId(task.id);
  };

  const handleOpenDeliveryQR = (task: VolunteerTask) => {
    if (isOffline) { toast.error("You are offline."); return; }
    setQrScan({ open: true, type: 'delivery', taskId: task.id });
    setActiveTaskId(task.id);
  };

  const handleQRVerified = async (newStatus: string) => {
    if (newStatus === 'picked_up') {
      toast.success("Pickup Confirmed via QR! 📱", {
        description: "Rerouting to delivery address. Delivery QR sent to receiver.",
        style: { background: "#171a1a", color: "#f5f3ef", border: "1px solid #3b82f6" },
      });
      // Generate delivery QR for the receiver
      const targetTaskId = qrScan.taskId || activeTaskId;
      if (targetTaskId) {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          toast.error("Session expired. Please log in again.");
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/tasks/${targetTaskId}/generate-qr`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ type: 'delivery' }),
          });
          if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || "QR generation failed");
          }
        } catch (err: unknown) {
          console.error(err); 
          toast.error("Failed to generate delivery QR");
        }
      }
    } else if (newStatus === 'delivered') {
      toast.success("Delivery Verified via QR! ✅", {
        description: "Thank you for making a difference today.",
        style: { background: "#171a1a", color: "#f5f3ef", border: "1px solid #10b981" },
      });
      setActiveTaskId(null);
      setTaskToComplete(null);
    }
    await fetchTasks();
  };

  const handleOTPVerified = async (newStatus: string) => {
    if (newStatus === 'picked_up') {
      toast.success("Pickup Confirmed via OTP! 🔐", {
        description: "Rerouting to delivery address.",
        style: { background: "#171a1a", color: "#f5f3ef", border: "1px solid #3b82f6" },
      });
      // Generate delivery QR now
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/tasks/${otpModal.taskId}/generate-qr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ type: 'delivery' }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "QR generation failed");
        }
      } catch (err: unknown) {
        console.error("Failed to generate delivery QR:", err);
      }
    } else if (newStatus === 'delivered') {
      toast.success("Delivery Verified via OTP! ✅", {
        description: "Thank you for making a difference today.",
        style: { background: "#171a1a", color: "#f5f3ef", border: "1px solid #10b981" },
      });
      setActiveTaskId(null);
      setTaskToComplete(null);
    }
    await fetchTasks();
  };

  const handleProofPhoto = async (base64: string) => {
    if (!user) return;
    try {
      await fetch(`${API_BASE}/tasks/${otpModal.taskId}/upload-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          proof_type: otpModal.type,
          volunteer_id: user.id,
        }),
      });
      toast.success("Proof photo uploaded!");
    } catch (err) {
      console.error("handleProofPhoto error:", err);
      toast.error("Action failed.");
    }
  };

  const handleDropTask = async (taskId: string) => {
    if (loadingTaskId || !user) return;
    setLoadingTaskId(taskId);
    try {
      const { error } = await supabase.rpc(RPC.HANDLE_ASSIGNMENT, {
        p_task_id: taskId,
        p_volunteer_id: user.id,
        p_action: "decline"
      });
      if (error) throw error;

      setMyTasks(prev => prev.filter(t => t.id !== taskId));
      if (activeTaskId === taskId) { setActiveTaskId(null); setRouteOne(null); setRouteTwo(null); setDynamicETA(null); }
      toast("Task removed from your manifest and returned to the pool.");
      await fetchTasks();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to drop task.");
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleAbortTask = async () => {
    if (!abortReason.trim() || abortReason.trim().length < 5) {
      toast.error("Please provide a reason (min 5 chars) for cancelling.");
      return;
    }

    if (!user?.id) {
      toast.error("User not authenticated");
      return;
    }

    if (isAborting) return;

    setIsAborting(true);
    try {
      const { data, error } = await supabase.rpc(RPC.ABORT_TASK, {
        p_task_id: abortModal.taskId,
        p_volunteer_id: user.id,
        p_reason: abortReason,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);

      toast.success("Task aborted successfully", {
        description: "The food request is returned to the pool.",
        style: { background: "#171a1a", color: "#f5f3ef", border: "1px solid #ef4444" }
      });

      setMyTasks(prev => prev.filter(t => t.id !== abortModal.taskId));
      if (activeTaskId === abortModal.taskId) {
        setActiveTaskId(null); setRouteOne(null); setRouteTwo(null); setDynamicETA(null);
      }
      setAbortModal({ open: false, taskId: '' });
      setAbortReason("");
      await fetchTasks();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to abort task");
    } finally {
      setIsAborting(false);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  const activeTask = myTasks.find(t => t.id === activeTaskId);
  // Instantly filter out tasks that have passed their strict expiry_time
  const liveOpenTasks = openTasks.filter(task => {
    if (!task.expiryTime) return true;
    return new Date(task.expiryTime).getTime() > Date.now();
  });

  const combinedTasks = [...liveOpenTasks, ...myTasks];

  // Auto-clear routes when active task reaches terminal state (delivered or cancelled)
  useEffect(() => {
    const s = activeTask?.status;
    if (!activeTask || s === "delivered" || s === "cancelled") {
      setRouteOne(null);
      setRouteTwo(null);
      setDynamicETA(null);
      setCurrentInstruction(null);
    }
  }, [activeTask?.status]);


  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0f1111] font-sans overflow-hidden text-white">
      <style>{`
          .custom-popup .leaflet-popup-content-wrapper { background: transparent !important; padding: 0 !important; box-shadow: none !important; border-radius: 12px; overflow: hidden; }
          .custom-popup .leaflet-popup-tip-container { display: none !important; }
          @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        `}</style>

      {/* KYC Banner */}
      {verificationStatus !== "approved" && verificationStatus !== "loading" && (
        <div className="neon-card neon-border-red mx-0 rounded-none border-x-0 border-t-0 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm font-medium text-white/90">Aadhaar KYC required to access live dispatches.</p>
          </div>
          <Button asChild size="sm" className="bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 h-8">
            <Link to="/verify">Complete KYC</Link>
          </Button>
        </div>
      )}

      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-amber-500/10 border-b border-amber-500/25 px-6 py-2 flex justify-center text-sm font-semibold text-amber-400 items-center gap-2 glow-pulse">
          <WifiOff className="w-4 h-4" /> Offline — Live dispatch suspended.
        </div>
      )}

      {/* Main Layout */}
      <div className={`flex-1 grid grid-cols-1 grid-rows-[1fr_45vw] sm:grid-rows-[1fr_40vh] lg:grid-rows-1 lg:grid-cols-[460px_1fr] overflow-hidden ${verificationStatus !== "approved" ? "opacity-40 grayscale-[80%] pointer-events-none" : ""}`}>

        {/* ── LEFT PANEL ── */}
        <div className="flex flex-col h-full overflow-hidden bg-[#0a0c0c] border-r border-white/5 z-10 shadow-2xl">

          {/* Header */}
          <div className="p-5 shrink-0 flex items-center justify-between border-b border-white/5">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Dispatch Hub</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${useHardwareGPS ? "bg-blue-400" : "bg-emerald-400"} animate-pulse`} />
                {useHardwareGPS ? "Hardware GPS Active" : "Network Simulator"}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => fetchTasks()} className="text-white/40 hover:text-white hover:bg-white/5">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-8">

            {/* Active Routes */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">My Active Routes</h3>
                <NeonBadge variant="blue" dot pulse>
                  {myTasks.length} Active
                </NeonBadge>
              </div>

              {myTasks.length === 0 ? (
                <div className="p-8 border border-white/8 border-dashed rounded-2xl text-center">
                  <Route className="w-8 h-8 text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/50">No assignments yet</p>
                  <p className="text-xs text-white/30 mt-1">Claim a broadcast below to begin routing.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myTasks.map((task, idx) => {
                    const stage = TASK_STAGES[task.status] ?? TASK_STAGES.assigned;
                    const isActive = activeTaskId === task.id;
                    const isWorking = loadingTaskId === task.id;
                    const progress = (stage.step / 3) * 100;

                    return (
                      <AnimatedContainer
                        key={task.id}
                        animation="fade-in-up"
                        delay={([0, 100, 200, 300, 400, 500] as const)[Math.min(idx, 5)]}
                      >
                      <div
                        onClick={() => setActiveTaskId(task.id)}
                        className={`relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-300 ${
                          isActive
                            ? "bg-[#1c2020] border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.15)] z-10"
                            : "bg-[#171a1a] border-white/8 hover:border-[rgba(59,130,246,0.3)] hover:shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                        }`}
                      >
                        {isActive && <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />}
                        <div className="p-4 pl-5">
                          {/* Stage + ETA */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: stage.color }}>{stage.icon}</span>
                              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: stage.color }}>
                                {stage.label}{idx > 0 ? ` (Stop ${idx + 1})` : ""}
                              </span>
                            </div>
                            {isActive && dynamicETA && (
                              <Badge className="text-blue-400 border-blue-500/30 bg-blue-500/10 text-[10px] flex gap-1">
                                <Clock className="w-3 h-3" /> ETA {dynamicETA}
                                {routeOne?.isFallback || routeTwo?.isFallback ? " *" : ""}
                              </Badge>
                            )}
                            {isActive && isRouteFetching && !dynamicETA && (
                              <span className="text-[10px] text-white/30 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Routing…
                              </span>
                            )}
                          </div>

                          {/* Task name */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <h4 className="text-base font-semibold text-white truncate pr-2">{task.name}</h4>
                            {task.spoilageRisk && (
                              <Badge variant="outline" className={`shrink-0 text-[10px] border ${getRiskColor(task.spoilageRisk)}`}>
                                Risk: {task.spoilageRisk}
                              </Badge>
                            )}
                          </div>

                          {/* Pickup / Dropoff */}
                          <div className="space-y-1 mb-3">
                            {task.pickupWindowStart && task.pickupWindowEnd && (
                              <div className="flex items-start gap-2">
                                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                                <p className={`text-xs leading-snug font-medium ${
                                  getPickupWindowStatus(task.pickupWindowStart, task.pickupWindowEnd) === 'expired' ? 'text-red-400' : 'text-blue-400'
                                }`}>
                                  {formatPickupCountdown(task.pickupWindowStart, task.pickupWindowEnd)}
                                </p>
                              </div>
                            )}
                            <div className="flex items-start gap-2">
                              <MapPin className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${task.status !== "picked_up" ? "text-amber-400" : "text-white/20"}`} />
                              <p className={`text-xs leading-snug ${task.status !== "picked_up" ? "text-white/80" : "text-white/25 line-through"}`}>
                                <span className="font-semibold">Pickup:</span> {task.pickupAddress}
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <MapPin className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${task.status === "picked_up" ? "text-emerald-400" : "text-white/20"}`} />
                              <p className={`text-xs leading-snug ${task.status === "picked_up" ? "text-white/80" : "text-white/40"}`}>
                                <span className="font-semibold">Drop:</span> {task.dropoffAddress}
                              </p>
                            </div>
                          </div>

                          {/* Progress Timeline */}
                          {isActive && (
                            <div className="mb-3">
                              <ProgressTimeline
                                stages={VOLUNTEER_TIMELINE_STAGES.slice(0, 5)}
                                currentStageKey={task.status}
                                direction="horizontal"
                              />
                            </div>
                          )}

                          {/* Progress bar (compact when not active) */}
                          {!isActive && (
                            <div className="h-1 bg-white/8 rounded-full overflow-hidden mb-3">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${progress}%`, background: stage.color }}
                              />
                            </div>
                          )}

                          {/* Safety countdown for active tasks */}
                          {isActive && task.estimatedSafeHours && (() => {
                            const expInfo = getSafeExpirationInfo(task.expiryTime);
                            if (!expInfo) return null;
                            return (
                              <div className={`text-[10px] font-semibold flex items-center gap-1.5 mb-3 px-2 py-1 rounded-lg border ${expInfo.expired ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                (expInfo.diffH ?? 99) < 2 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                  'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                }`}>
                                <Clock className="w-3 h-3" />
                                {expInfo.expired ? '⚠ Food safety window expired' : `Safe for: ${expInfo.text}`}
                              </div>
                            );
                          })()}

                          {/* Action buttons */}
                          <div className="flex items-center gap-2">
                            {task.status === "pending_acceptance" && (
                              <div className="flex gap-2 w-full">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); handleAssignment(task, "decline"); }}
                                  className="h-8 flex-1 text-xs border-red-500/20 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                  disabled={isWorking}
                                >
                                  Decline
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); handleAssignment(task, "accept"); }}
                                  className="h-8 flex-1 text-xs font-bold bg-blue-500 text-white hover:bg-blue-400"
                                  disabled={isWorking || isOffline}
                                >
                                  {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Accept Dispatch"}
                                </Button>
                              </div>
                            )}
                            {task.status === "assigned" && (
                              <div className="grid grid-cols-[auto_1fr] gap-2 w-full">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); handleNavigateInMap(task); }}
                                  className={`h-8 px-3 text-xs border-blue-500/30 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 bg-transparent flex items-center justify-center gap-1.5 ${isNavigating && activeTaskId === task.id ? 'bg-blue-500/15 border-blue-500/50' : ''}`}
                                  disabled={isWorking}
                                  title="Navigate to Pickup"
                                >
                                  <Navigation className="w-3.5 h-3.5" /> Navigate
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); handleOpenPickupQR(task); }}
                                  className="h-8 px-4 text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 w-full"
                                  disabled={isWorking || isOffline}
                                >
                                  {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📱 Scan Pickup QR"}
                                </Button>
                              </div>
                            )}
                            {task.status === "picked_up" && (
                              <div className="grid grid-cols-[auto_1fr] gap-2 w-full">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); handleNavigateInMap(task); }}
                                  className={`h-8 px-3 text-xs border-blue-500/30 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 bg-transparent flex items-center justify-center gap-1.5 ${isNavigating && activeTaskId === task.id ? 'bg-blue-500/15 border-blue-500/50' : ''}`}
                                  disabled={isWorking}
                                  title="Navigate to Dropoff"
                                >
                                  <Navigation className="w-3.5 h-3.5" /> Navigate
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); handleOpenDeliveryQR(task); }}
                                  className="h-8 text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 w-full flex gap-1.5"
                                  disabled={isWorking || isOffline}
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> 📱 Scan Delivery QR
                                </Button>
                              </div>
                            )}

                            {/* Abort button for assigned/picked_up tasks */}
                            {(task.status === "assigned" || task.status === "picked_up") && (
                              <div className="mt-2 flex w-full">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); setAbortModal({ open: true, taskId: task.id }); setAbortReason(''); }}
                                  className="w-full h-7 text-[10px] uppercase tracking-wider text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                  disabled={isWorking || isOffline}
                                >
                                  Abort Task
                                </Button>
                              </div>
                            )}

                            {task.status === "delivered" && (
                              <span className="text-xs text-emerald-400 flex items-center gap-1.5 w-full justify-center font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Delivery Completed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      </AnimatedContainer>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Priority Broadcast Pool */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">Priority Broadcasts</h3>
                <NeonBadge variant="gray">
                  {liveOpenTasks.length} Open
                </NeonBadge>
              </div>

              {liveOpenTasks.length === 0 ? (
                <p className="text-sm text-white/25 text-center py-8">No active dispatches. Check back soon.</p>
              ) : (
                <div className="space-y-3">
                  {liveOpenTasks.map((task, i) => {
                    const isWorking = loadingTaskId === task.id;
                    const isSelected = activeTaskId === task.id;
                    const expInfo = getSafeExpirationInfo(task.expiryTime);
                    const isUrgent = expInfo ? (expInfo.diffH ?? 0) < 4 : false;

                    return (
                      <div
                        key={task.id}
                        onClick={() => { if (!isSelected) setActiveTaskId(task.id); }}
                        className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
                          isSelected
                            ? "bg-[#1a1d1d] border-white/20 shadow-[0_0_16px_rgba(0,229,153,0.08)]"
                            : "bg-[#141616] border-white/5 hover:border-white/12"
                        } ${
                          isUrgent && !isSelected
                            ? "border-red-500/50 animate-pulse bg-red-500/[0.03] shadow-[0_0_12px_rgba(239,68,68,0.1)]"
                            : ""
                        }`}
                      >
                        {isUrgent && (
                          <div className="absolute top-0 right-0 w-2 h-2 m-2 rounded-full bg-red-500 animate-ping"></div>
                        )}
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-sm font-semibold text-white flex gap-2 items-center">
                            {task.name}
                          </h4>
                          <div className="flex gap-1 shrink-0">
                            {task.dbPriorityScore != null && (
                              <Badge className={`text-[10px] bg-white/5 text-white/50 border-white/10`}>
                                Score: {task.dbPriorityScore}
                              </Badge>
                            )}
                            {task.spoilageRisk === 'high' && (
                              <Badge className={`text-[10px] bg-red-500/10 text-red-500 border-red-500/20 shadow-sm shadow-red-500/10`}>
                                High Risk
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-white/50 space-y-1 mb-3">
                          {task.pickupWindowStart && task.pickupWindowEnd && (
                            <p className={`flex items-center gap-1.5 font-medium ${
                              getPickupWindowStatus(task.pickupWindowStart, task.pickupWindowEnd) === 'expired' ? 'text-red-400' : 'text-blue-400'
                            }`}>
                              <Clock className="w-3.5 h-3.5" /> 
                              {formatPickupCountdown(task.pickupWindowStart, task.pickupWindowEnd)}
                            </p>
                          )}
                          <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-orange-400" /> {task.pickupAddress}</p>
                          <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-blue-400" /> {task.dropoffAddress}</p>
                          <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5">
                            {expInfo ? (
                              <p className={`flex items-center gap-1.5 ${isUrgent ? 'text-red-400 font-medium' : ''}`}>
                                <Clock className="w-3.5 h-3.5" />
                                {expInfo.text}
                              </p>
                            ) : <span />}
                            <p className="flex items-center gap-1.5 font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                              <Navigation className="w-3 h-3" />
                              {(task.distanceKm || calculateHaversineDistance(livePos.lat, livePos.lng, task.pickupLat, task.pickupLng)).toFixed(1)} km away
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleClaimTask(task); }}
                          className={`w-full text-xs font-bold transition-all ${isUrgent ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black'}`}
                          disabled={isWorking || isOffline}
                        >
                          {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Claim Task"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── RIGHT MAP ── */}
        <div className="relative h-full w-full bg-[#0a0c0c] z-0 pb-[88px] sm:pb-0">
          {/* ETA overlay */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[400] pointer-events-auto px-4 w-full max-w-sm">
            <div className="glass-panel px-5 py-3 shadow-2xl border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                    isNavigating
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : activeTask
                        ? 'bg-blue-500/15 border-blue-500/30'
                        : 'bg-white/5 border-white/10'
                  }`}>
                    <Route className={`w-4 h-4 ${
                      isNavigating ? 'text-blue-400 animate-pulse' : activeTask ? 'text-blue-400' : 'text-white/30'
                    }`} />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-white/35 font-bold tracking-widest">
                      {isNavigating ? 'NAVIGATING' : useHardwareGPS ? 'Live GPS' : activeTask ? 'OSRM Telemetry' : 'Idle'}
                    </p>
                    <p className="text-sm font-semibold text-white leading-tight">
                      {isRouteFetching
                        ? 'Routing...'
                        : activeTask
                          ? dynamicETA ? `ETA: ${dynamicETA}` : 'Calculating...'
                          : 'Awaiting Orders'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(routeOne?.isFallback || routeTwo?.isFallback) && (
                    <span className="text-[8px] text-amber-400/60 font-bold">~EST</span>
                  )}
                  {isNavigating && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsNavigating(false)}
                      className="h-6 px-2 text-[10px] text-white/40 hover:text-white hover:bg-white/10"
                    >
                      Exit Nav
                    </Button>
                  )}
                </div>
              </div>

              {/* Current instruction - always visible when navigating */}
              {currentInstruction && (
                <div className="mt-2.5 pt-2.5 border-t border-white/8">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                      <Navigation className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white font-semibold truncate">{currentInstruction}</p>
                      {navSteps[currentStepIdx + 1] && (
                        <p className="text-[10px] text-white/30 truncate mt-0.5">
                          Then: {navSteps[currentStepIdx + 1].instruction}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Expanded step list when navigating */}
            {isNavigating && navSteps.length > 0 && (
              <div className="mt-2 glass-panel border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                {navSteps.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 ${i === currentStepIdx ? 'bg-blue-500/10' : ''
                      }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i < currentStepIdx ? 'bg-emerald-500/20 text-emerald-400' :
                      i === currentStepIdx ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40' :
                        'bg-white/5 text-white/25'
                      }`}>
                      {i < currentStepIdx ? '✓' : i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${i === currentStepIdx ? 'text-white font-medium' : 'text-white/50'}`}>
                        {step.instruction}
                      </p>
                    </div>
                    {step.distance && (
                      <span className="text-[10px] text-white/30 shrink-0 font-mono">{step.distance}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <MapContainer
            center={[livePos.lat || 20.5937, livePos.lng || 78.9629]}
            zoom={livePos.lat ? 12 : 5}
            style={{ height: "100%", width: "100%", zIndex: 0, background: "#0a0c0c" }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <DynamicMapController
              tasks={combinedTasks}
              activeTaskId={activeTaskId}
              livePos={livePos}
              osrmGeometry={routeOne?.geometry ?? routeTwo?.geometry}
            />

            {/* Volunteer live position */}
            <Marker position={[livePos.lat, livePos.lng]} icon={liveGPSIcon} zIndexOffset={200} />

            {/* Task markers + routes */}
            {combinedTasks.map(task => {
              const isActive = activeTaskId === task.id;
              const isPickedUp = task.status === "picked_up";
              const stage = TASK_STAGES[task.status] ?? TASK_STAGES.assigned;

              return (
                <Fragment key={task.id}>
                  {/* Pickup marker — hidden after picked up */}
                  {!isPickedUp && task.status !== "delivered" && (
                    <Marker
                      position={[task.pickupLat, task.pickupLng]}
                      icon={createDivIcon("#f59e0b", isActive)}
                      eventHandlers={{ click: () => setActiveTaskId(task.id) }}
                      zIndexOffset={isActive ? 100 : 0}
                    >
                      <Popup className="custom-popup">
                        <div className="p-4 bg-[#171a1a] text-white border border-white/10 rounded-xl w-max max-w-[240px] md:min-w-[220px]">
                          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 mb-2 text-[9px]">PICKUP</Badge>
                          <strong className="block text-sm mb-1">{task.name}</strong>
                          <span className="text-xs text-white/40">{task.pickupAddress}</span>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Dropoff marker */}
                  {task.dropoffLat != null && task.dropoffLng != null && (
                    <Marker
                      position={[task.dropoffLat, task.dropoffLng]}
                      icon={createDivIcon("#10b981", isActive && isPickedUp)}
                      eventHandlers={{ click: () => setActiveTaskId(task.id) }}
                      zIndexOffset={isActive ? 100 : 0}
                    >
                      <Popup className="custom-popup">
                        <div className="p-4 bg-[#171a1a] text-white border border-white/10 rounded-xl w-max max-w-[240px] md:min-w-[220px]">
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 mb-2 text-[9px]">DROPOFF</Badge>
                          <strong className="block text-sm mb-1">{task.name}</strong>
                          <span className="text-xs text-white/40 flex items-center gap-1" style={{ color: stage.color }}>
                            {stage.icon} {stage.label}
                          </span>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* OSRM Segment 1 — volunteer to donor (amber) */}
                  {isActive && routeOne && (
                    <Polyline
                      positions={routeOne.geometry.map(p => [p.lat, p.lng])}
                      color="#f59e0b"
                      weight={5}
                      opacity={0.85}
                      dashArray={routeOne.isFallback ? "8, 6" : undefined}
                    />
                  )}

                  {/* OSRM Segment 2 — donor to receiver (green) */}
                  {isActive && routeTwo && (
                    <Polyline
                      positions={routeTwo.geometry.map(p => [p.lat, p.lng])}
                      color="#10b981"
                      weight={5}
                      opacity={0.85}
                      dashArray={routeTwo.isFallback ? "8, 6" : undefined}
                    />
                  )}

                  {/* Ghost line for unselected tasks */}
                  {!isActive && task.status === "open" && task.dropoffLat != null && task.dropoffLng != null && (
                    <Polyline
                      positions={[[livePos.lat, livePos.lng], [task.pickupLat, task.pickupLng], [task.dropoffLat, task.dropoffLng]]}
                      color="rgba(255,255,255,0.07)"
                      weight={2}
                      dashArray="4, 10"
                    />
                  )}
                </Fragment>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Delivery Confirmation Dialog — now launches QR scan */}
      <Dialog open={!!taskToComplete} onOpenChange={open => !open && setTaskToComplete(null)}>
        <DialogContent className="sm:max-w-sm bg-[#171a1a] text-white border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Confirm Delivery</DialogTitle>
            <DialogDescription className="text-white/50 text-sm">
              Scan the receiver's QR code to verify delivery.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center gap-4 bg-[#0f1111] rounded-xl border border-white/5">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-white/70 text-sm text-center px-4">
              By confirming, the rider manifest will be closed and the receiver will be notified.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="border-white/10 text-white/60 hover:bg-white/5" onClick={() => setTaskToComplete(null)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8"
                onClick={() => {
                  if (taskToComplete) {
                    handleOpenDeliveryQR(taskToComplete);
                    setTaskToComplete(null);
                  }
                }}
              >
                Scan Delivery QR
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* OTP Verification Modal — kept for fallback, hidden from primary flow */}
      {/* <OTPModal
          open={otpModal.open}
          onOpenChange={open => setOtpModal(prev => ({ ...prev, open }))}
          taskId={otpModal.taskId}
          volunteerId={user?.id ?? ''}
          otpType={otpModal.type}
          onVerified={handleOTPVerified}
          showPhotoPrompt={true}
          onPhotoCapture={handleProofPhoto}
        /> */}

      {/* QR Scanner Modal */}
      <QRScannerModal
        open={qrScan.open}
        onOpenChange={open => setQrScan(prev => ({ ...prev, open }))}
        scanType={qrScan.type}
        volunteerId={user?.id ?? ''}
        onVerified={handleQRVerified}
        onFallbackOTP={() => {
          // Fallback: open OTP modal for the specific task captured when QR was opened
          if (qrScan.taskId) {
            setOtpModal({ open: true, taskId: qrScan.taskId, type: qrScan.type });
          }
        }}
      />

      {/* Abort Confirmation Dialog */}
      <Dialog open={abortModal.open} onOpenChange={open => !open && !isAborting && setAbortModal({ open: false, taskId: '' })}>
        <DialogContent className="sm:max-w-md bg-[#171a1a] text-white border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Abort Task
            </DialogTitle>
            <DialogDescription className="text-white/50 text-sm">
              Are you sure you want to cancel this dispatch? This will immediately return the food request to the broadcast pool.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-3">
            <label className="text-xs font-semibold text-white/70">Reason for Cancellation</label>
            <textarea
              className="w-full bg-[#0a0c0c] border border-white/10 rounded-xl p-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/50 resize-none"
              rows={3}
              placeholder="E.g., Vehicle broke down, donor location closed..."
              value={abortReason}
              onChange={(e) => setAbortReason(e.target.value)}
              disabled={isAborting}
            />
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <Button variant="outline" className="border-white/10 text-white/60 hover:bg-white/5" onClick={() => setAbortModal({ open: false, taskId: '' })} disabled={isAborting}>
              Keep Task
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white font-bold"
              onClick={handleAbortTask}
              disabled={isAborting || !abortReason.trim()}
            >
              {isAborting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Abort"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-Assignment Modal — surfaces when backend auto-dispatches to this volunteer */}
      <TaskAssignmentModal
        volunteerLat={livePos.lat}
        volunteerLng={livePos.lng}
        onAccepted={() => {
          fetchTasks();
          calculateRoutes(true);
        }}
      />
    </div>
  );
}
