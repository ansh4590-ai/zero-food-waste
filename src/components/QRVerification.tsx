import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import {
  QrCode, Camera, Loader2, CheckCircle2, XCircle,
  ShieldCheck, AlertTriangle, RefreshCw
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../lib/supabase";

/** Returns the current user's JWT or null if not logged in */
async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Minimal type for the dynamically imported Html5Qrcode scanner
interface Html5QrcodeScanner {
  start(
    cameraIdOrConfig: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number }; aspectRatio: number },
    onSuccess: (decodedText: string) => void,
    onFailure: () => void,
  ): Promise<any>;
  stop(): Promise<void>;
  clear(): void;
  pause(shouldPauseVideo?: boolean): void;
  resume(): void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QR CODE DISPLAY CARD — shown to Donor (pickup) and Receiver (delivery)
// ═══════════════════════════════════════════════════════════════════════════════

interface QRCodeCardProps {
  taskId: string;
  type: "pickup" | "delivery";
  /** Pre-fetched token, or null to trigger generation */
  token?: string | null;
  expiresAt?: string | null;
  onRegenerate?: () => void;
  compact?: boolean;
}

export function QRCodeCard({
  taskId, type, token: externalToken, expiresAt: externalExpiry,
  onRegenerate, compact = false,
}: QRCodeCardProps) {
  const [token, setToken] = useState<string | null>(externalToken ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(externalExpiry ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(600);

  // Stale request protection: request ID & abort controller refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  // Sync external token
  useEffect(() => {
    if (externalToken) {
      setToken(externalToken);
      setError(null);
    }
    if (externalExpiry) setExpiresAt(externalExpiry);
  }, [externalToken, externalExpiry]);

  // Reset attempt state and abort any active in-flight request if taskId or type changes
  useEffect(() => {
    if (!externalToken) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setToken(null);
      setExpiresAt(null);
      setError(null);
      setHasAttempted(false);
      setIsGenerating(false);
    }
  }, [taskId, type, externalToken]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Generate token if not provided
  const generateToken = useCallback(async () => {
    // Abort prior in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentRequestId = ++requestIdRef.current;

    setIsGenerating(true);
    setError(null);
    try {
      const authToken = await getAuthToken();
      if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return;
      if (!authToken) {
        setError("Sign in required to view QR code.");
        return;
      }
      const res = await fetch(`/api/tasks/${taskId}/generate-qr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({ type }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return;

      if (res.ok && data?.success) {
        setToken(data.qrValue);
        setExpiresAt(data.expiresAt);
        setError(null);
      } else {
        setError(data?.error || `Failed to generate ${type} QR code.`);
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError" || controller.signal.aborted) {
        return; // Stale or cancelled request
      }
      if (currentRequestId === requestIdRef.current) {
        setError("Network error while generating QR code.");
      }
    } finally {
      if (currentRequestId === requestIdRef.current && !controller.signal.aborted) {
        setIsGenerating(false);
        setHasAttempted(true);
      }
    }
  }, [taskId, type]);

  useEffect(() => {
    if (!token && !isGenerating && !hasAttempted && !error) {
      generateToken();
    }
  }, [token, isGenerating, hasAttempted, error, generateToken]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const isExpired = secondsLeft <= 0 && token !== null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = Math.min(secondsLeft / 600, 1);

  const handleRegenerate = () => {
    setToken(null);
    setExpiresAt(null);
    setError(null);
    setHasAttempted(false);
    setSecondsLeft(600);
    if (onRegenerate) onRegenerate();
    generateToken();
  };

  const label = type === "pickup" ? "Pickup" : "Delivery";

  if (compact) {
    return (
      <div className={`rounded-xl border p-4 space-y-3 ${
        type === "pickup"
          ? "bg-amber-500/5 border-amber-500/20"
          : "bg-emerald-500/5 border-emerald-500/20"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className={`w-4 h-4 ${type === "pickup" ? "text-amber-500" : "text-emerald-500"}`} />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label} QR</span>
          </div>
          {!isExpired && token && (
            <span className={`text-xs font-mono font-semibold ${secondsLeft < 120 ? "text-red-400" : "text-muted-foreground"}`}>
              {minutes}:{seconds.toString().padStart(2, "0")}
            </span>
          )}
        </div>
        {isGenerating ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center space-y-2 py-2">
            <p className="text-xs text-red-400 font-medium">{error}</p>
            <Button size="sm" variant="outline" onClick={handleRegenerate} className="text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : isExpired ? (
          <div className="text-center space-y-2">
            <p className="text-xs text-red-400">QR expired</p>
            <Button size="sm" variant="outline" onClick={handleRegenerate} className="text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
            </Button>
          </div>
        ) : token ? (
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-xl shadow-md border">
              <QRCodeSVG value={token} size={150} level="M" />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Scan with volunteer camera to verify {label.toLowerCase()}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden border shadow-xl ${
      type === "pickup"
        ? "bg-gradient-to-b from-amber-950/30 to-[#0f1111] border-amber-500/20"
        : "bg-gradient-to-b from-emerald-950/30 to-[#0f1111] border-emerald-500/20"
    }`}>
      {/* Header */}
      <div className={`px-5 py-3 flex items-center justify-between ${
        type === "pickup" ? "bg-amber-500/10" : "bg-emerald-500/10"
      }`}>
        <div className="flex items-center gap-2">
          <ShieldCheck className={`w-4 h-4 ${type === "pickup" ? "text-amber-500" : "text-emerald-500"}`} />
          <span className="text-xs font-bold uppercase tracking-widest text-white/70">{label} Verification</span>
        </div>
        {!isExpired && token && (
          <div className="flex items-center gap-2">
            {/* Countdown ring */}
            <svg width="28" height="28" viewBox="0 0 28 28" className="rotate-[-90deg]">
              <circle cx="14" cy="14" r="12" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
              <circle
                cx="14" cy="14" r="12" fill="none"
                stroke={secondsLeft < 120 ? "#ef4444" : type === "pickup" ? "#f59e0b" : "#10b981"}
                strokeWidth="2"
                strokeDasharray={`${progress * 75.4} 75.4`}
                strokeLinecap="round"
              />
            </svg>
            <span className={`text-sm font-mono font-bold ${secondsLeft < 120 ? "text-red-400 animate-pulse" : "text-white/80"}`}>
              {minutes}:{seconds.toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-6 flex flex-col items-center gap-4">
        {isGenerating ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
            <p className="text-sm text-white/40">Generating secure QR code…</p>
          </div>
        ) : error ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <XCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-400 font-semibold text-center max-w-xs">{error}</p>
            <Button onClick={handleRegenerate} size="sm" className={`${
              type === "pickup" ? "bg-amber-500 hover:bg-amber-400" : "bg-emerald-500 hover:bg-emerald-400"
            } text-black font-bold`}>
              <RefreshCw className="w-4 h-4 mr-2" /> Try Again
            </Button>
          </div>
        ) : isExpired ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <XCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-400 font-semibold">QR code expired</p>
            <Button onClick={handleRegenerate} size="sm" className={`${
              type === "pickup" ? "bg-amber-500 hover:bg-amber-400" : "bg-emerald-500 hover:bg-emerald-400"
            } text-black font-bold`}>
              <RefreshCw className="w-4 h-4 mr-2" /> Generate New QR
            </Button>
          </div>
        ) : token ? (
          <>
            <div className="bg-white p-4 rounded-2xl shadow-xl">
              <QRCodeSVG
                value={token}
                size={220}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f1111"
              />
            </div>

            <div className="flex justify-center w-full">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                className="border-white/10 text-white/60 hover:bg-white/5 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Regenerate QR
              </Button>
            </div>

            <div className={`flex items-start gap-2 text-[11px] px-3 py-2 rounded-lg border ${
              type === "pickup"
                ? "text-amber-400/70 bg-amber-500/5 border-amber-500/10"
                : "text-emerald-400/70 bg-emerald-500/5 border-emerald-500/10"
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Show this QR code <strong>only when the volunteer arrives</strong> to scan with their camera.</span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QR SCANNER MODAL — used by Volunteers to scan Donor/Receiver QR codes
// ═══════════════════════════════════════════════════════════════════════════════

interface QRScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scanType: "pickup" | "delivery";
  volunteerId: string;
  /** Called on successful QR verification with the new status */
  onVerified: (newStatus: string) => void;
}

export function QRScannerModal({
  open, onOpenChange, scanType, volunteerId, onVerified,
}: QRScannerModalProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryCount, setCameraRetryCount] = useState(0);
  const html5QrRef = useRef<Html5QrcodeScanner | null>(null);
  const hasScannedRef = useRef(false);
  const lastScannedRef = useRef("");

  // Keep latest callbacks and props in refs to keep verifyToken reference completely stable
  const volunteerIdRef = useRef(volunteerId);
  volunteerIdRef.current = volunteerId;
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const label = scanType === "pickup" ? "Pickup" : "Delivery";

  // Reset on open
  useEffect(() => {
    if (open) {
      setError(null);
      setVerified(false);
      setCameraError(null);
      setCameraRetryCount(0);
      isVerifyingRef.current = false;
      setIsVerifying(false);
      hasScannedRef.current = false;
      lastScannedRef.current = "";
    }
  }, [open]);

  // Stable verifyToken callback — uses refs to prevent duplicate calls and avoid re-renders
  const verifyToken = useCallback(async (token: string) => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setIsVerifying(true);
    setError(null);
    try {
      if (html5QrRef.current) {
        html5QrRef.current.pause(true); // Stop scanning while verifying
      }

      const authToken = await getAuthToken();
      if (!authToken) {
        setError("Not authenticated. Please log in again.");
        hasScannedRef.current = false;
        if (html5QrRef.current) {
          setTimeout(() => {
            if (html5QrRef.current) html5QrRef.current.resume();
          }, 2000);
        }
        return;
      }
      const res = await fetch("/api/tasks/verify-qr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token, volunteerId: volunteerIdRef.current }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setVerified(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        // Server returns new_status (snake_case) — support both for safety
        onVerifiedRef.current(data.new_status ?? data.newStatus);
        // Auto-close modal after brief success display
        setTimeout(() => {
          onOpenChangeRef.current(false);
        }, 1500);
      } else {
        setError(data?.error || "Verification failed. Please scan again.");
        hasScannedRef.current = false; // Allow retry
        if (html5QrRef.current) {
          setTimeout(() => {
            if (html5QrRef.current) html5QrRef.current.resume();
          }, 2000); // Wait 2s before scanning again to prevent spam
        }
      }
    } catch {
      setError("Network error. Please scan again.");
      hasScannedRef.current = false;
      if (html5QrRef.current) {
        setTimeout(() => {
          if (html5QrRef.current) html5QrRef.current.resume();
        }, 2000);
      }
    } finally {
      isVerifyingRef.current = false;
      setIsVerifying(false);
    }
  }, []);

  // Initialize camera scanner — stable lifecycle, only restarts on open or explicit retry
  useEffect(() => {
    if (!open || verified) return;

    let scanner: Html5QrcodeScanner | null = null;
    let isMounted = true;

    const initScanner = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        // Wait for DOM element
        await new Promise(r => setTimeout(r, 400));
        if (!isMounted) return;

        const el = document.getElementById("qr-reader");
        if (!el) {
          if (isMounted) {
            setCameraError("Camera scanner viewport not found. Please click Retry.");
          }
          return;
        }

        scanner = new Html5Qrcode("qr-reader");
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          async (decodedText: string) => {
            if (hasScannedRef.current) return;
            if (decodedText === lastScannedRef.current) return;
            lastScannedRef.current = decodedText;
            hasScannedRef.current = true;

            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(200);
            }

            await verifyToken(decodedText);
            try { await scanner?.stop(); } catch {}
          },
          () => { /* ignore scan frame failures */ }
        );

        // Torch support for low-light environments if supported
        try {
          const track = (scanner as unknown as { getRunningTrack?: () => MediaStreamTrack | null })?.getRunningTrack?.();
          if (track) {
            track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
          }
        } catch {}
      } catch (err: unknown) {
        if (import.meta.env.DEV) console.warn("Camera init error:", err);
        if (isMounted) {
          const rawMsg = (err as Error)?.message || "";
          let userMsg = "Camera not available. Physical camera scanning is required.";
          if (rawMsg.includes("Permission") || rawMsg.includes("NotAllowedError") || rawMsg.includes("PermissionDeniedError")) {
            userMsg = "Camera permission denied. Please allow camera access in your browser to scan the physical QR code.";
          } else if (rawMsg.includes("NotFoundError") || rawMsg.includes("DevicesNotFoundError")) {
            userMsg = "No camera found on this device. A camera is required for physical QR verification.";
          } else if (rawMsg) {
            userMsg = rawMsg;
          }
          setCameraError(userMsg);
        }
      }
    };

    initScanner();

    return () => {
      isMounted = false;
      if (scanner) {
        try { scanner.stop().catch(() => {}); } catch {}
        try { scanner.clear(); } catch {}
      }
      html5QrRef.current = null;
    };
  }, [open, verified, cameraRetryCount, verifyToken]);

  const handleRetryCamera = () => {
    setCameraError(null);
    setError(null);
    hasScannedRef.current = false;
    lastScannedRef.current = "";
    setCameraRetryCount(prev => prev + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md bg-[#0f1111] text-white border border-white/10 rounded-2xl shadow-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className={`bg-gradient-to-r ${
          scanType === "pickup" ? "from-amber-600 to-amber-500" : "from-emerald-600 to-emerald-500"
        } px-6 py-4`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/70 font-semibold">Physical QR Scanner</p>
              <h3 className="text-lg font-bold text-white">Scan {label} QR</h3>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {verified ? (
            /* ─── Success State ─── */
            <div className="flex flex-col items-center gap-3 py-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                scanType === "pickup" ? "bg-amber-500/20" : "bg-emerald-500/20"
              }`}>
                <CheckCircle2 className={`w-8 h-8 ${scanType === "pickup" ? "text-amber-400" : "text-emerald-400"}`} />
              </div>
              <p className={`font-bold text-lg ${scanType === "pickup" ? "text-amber-400" : "text-emerald-400"}`}>
                {label} Verified ✓
              </p>
              <p className="text-sm text-white/40 text-center">
                {scanType === "pickup" ? "Food picked up. Heading to delivery." : "Delivery confirmed. Route complete!"}
              </p>
              <Button
                onClick={() => onOpenChange(false)}
                className={`mt-2 font-bold px-8 ${
                  scanType === "pickup"
                    ? "bg-amber-500 hover:bg-amber-400 text-black"
                    : "bg-emerald-500 hover:bg-emerald-400 text-black"
                }`}
              >
                Continue
              </Button>
            </div>
          ) : cameraError ? (
            /* ─── Camera Error State (No manual entry fallback) ─── */
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <Camera className="w-8 h-8 text-red-400" />
              </div>
              <p className="font-bold text-lg text-red-400">Camera Access Required</p>
              <p className="text-sm text-white/60 max-w-xs">
                {cameraError}
              </p>
              <Button
                onClick={handleRetryCamera}
                className="mt-2 font-bold px-6 bg-white/10 hover:bg-white/20 text-white border border-white/20"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Retry Camera
              </Button>
            </div>
          ) : (
            /* ─── Camera Scanner (Physical QR Only) ─── */
            <>
              <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-h-[300px]">
                <div id="qr-reader" className="w-full h-full" />
                {/* Scan overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-[200px] h-[200px] border-2 border-white/30 rounded-2xl relative">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-lg" />
                      {/* Animated scan line */}
                      <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-white/80 to-transparent animate-bounce" style={{ top: "50%" }} />
                    </div>
                  </div>
                </div>
                {isVerifying && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  </div>
                )}
              </div>

              <p className="text-xs text-white/40 text-center">
                Point your camera directly at the physical QR code shown by the {scanType === "pickup" ? "donor" : "receiver"}.
              </p>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
