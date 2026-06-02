import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import {
  QrCode, Camera, Keyboard, Loader2, CheckCircle2, XCircle,
  ShieldCheck, AlertTriangle, Copy, RefreshCw
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

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
  const [secondsLeft, setSecondsLeft] = useState<number>(600);
  const [copied, setCopied] = useState(false);

  // Sync external token
  useEffect(() => {
    if (externalToken) setToken(externalToken);
    if (externalExpiry) setExpiresAt(externalExpiry);
  }, [externalToken, externalExpiry]);

  // Generate token if not provided
  const generateToken = useCallback(async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/generate-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.qrValue);
        setExpiresAt(data.expiresAt);
      }
    } catch {
      // silent
    } finally {
      setIsGenerating(false);
    }
  }, [taskId, type]);

  useEffect(() => {
    if (!token && !isGenerating) generateToken();
  }, [token, isGenerating, generateToken]);

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

  const handleCopy = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    setToken(null);
    setExpiresAt(null);
    setSecondsLeft(600);
    if (onRegenerate) onRegenerate();
    generateToken();
  };

  const accentColor = type === "pickup" ? "amber" : "emerald";
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
            <Button size="sm" variant="ghost" onClick={handleCopy} className="text-[10px] text-muted-foreground">
              {copied ? <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? "Copied!" : "Copy backup code"}
            </Button>
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

            <div className="flex items-center gap-2 w-full">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="flex-1 border-white/10 text-white/60 hover:bg-white/5 text-xs"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? "Copied!" : "Copy Backup Code"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                className="border-white/10 text-white/60 hover:bg-white/5 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className={`flex items-start gap-2 text-[11px] px-3 py-2 rounded-lg border ${
              type === "pickup"
                ? "text-amber-400/70 bg-amber-500/5 border-amber-500/10"
                : "text-emerald-400/70 bg-emerald-500/5 border-emerald-500/10"
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Show this QR code <strong>only when the volunteer arrives</strong>. Do not share it in advance.</span>
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
  /** Fallback: open the OTP modal instead */
  onFallbackOTP?: () => void;
}

export function QRScannerModal({
  open, onOpenChange, scanType, volunteerId, onVerified, onFallbackOTP,
}: QRScannerModalProps) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<any>(null);
  const hasScannedRef = useRef(false);
  const lastScannedRef = useRef("");

  const label = scanType === "pickup" ? "Pickup" : "Delivery";

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode("camera");
      setManualCode("");
      setError(null);
      setVerified(false);
      setCameraError(null);
      hasScannedRef.current = false;
      lastScannedRef.current = "";
    }
  }, [open]);

  // Initialize camera scanner
  useEffect(() => {
    if (!open || mode !== "camera" || verified) return;

    let scanner: any = null;
    let isMounted = true;

    const initScanner = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        
        // Wait for DOM element
        await new Promise(r => setTimeout(r, 500));
        if (!isMounted) return;
        
        const el = document.getElementById("qr-reader");
        if (!el) {
          setCameraError("Scanner element not found.");
          setMode("manual");
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
            try { await scanner.stop(); } catch {}
          },
          () => { /* ignore scan failures */ }
        );

        // Torch support for dark rooms
        try {
          const track = (scanner as any).getRunningTrack?.();
          if (track) {
            track.applyConstraints({ advanced: [{ torch: true }] as any });
          }
        } catch {}
      } catch (err: any) {
        if (import.meta.env.DEV) console.warn("Camera init error:", err);
        // Gracefully fall back to manual mode — don't crash
        if (isMounted) {
          setCameraError(err?.message || "Camera not available. Use manual entry.");
          setMode("manual");
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
  }, [open, mode, verified]);

  const verifyToken = async (token: string) => {
    if (isVerifying) return;
    setIsVerifying(true);
    setError(null);
    try {
      if (html5QrRef.current && mode === "camera") {
        html5QrRef.current.pause(true); // Stop scanning while verifying
      }
      
      const res = await fetch("/api/tasks/verify-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, volunteerId }),
      });
      const data = await res.json();

      if (data.success) {
        setVerified(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        onVerified(data.newStatus);
        // Auto-close modal after brief success display
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        setError(data.error || "Verification failed. Please try again.");
        hasScannedRef.current = false; // Allow retry
        if (html5QrRef.current && mode === "camera") {
          setTimeout(() => {
            if (html5QrRef.current) html5QrRef.current.resume();
          }, 2000); // Wait 2s before scanning again to prevent spam
        }
      }
    } catch {
      setError("Network error. Please try again.");
      hasScannedRef.current = false;
      if (html5QrRef.current && mode === "camera") {
        setTimeout(() => {
          if (html5QrRef.current) html5QrRef.current.resume();
        }, 2000);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManualSubmit = () => {
    const trimmed = manualCode.trim();
    if (!trimmed) { setError("Please enter the backup code."); return; }
    verifyToken(trimmed.toUpperCase());
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
              <p className="text-[10px] uppercase tracking-widest text-white/70 font-semibold">QR Verification</p>
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
              <p className="text-sm text-white/40">
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
          ) : mode === "camera" ? (
            /* ─── Camera Scanner ─── */
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
                Point your camera at the {scanType === "pickup" ? "donor's" : "receiver's"} QR code
              </p>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("manual")}
                  className="flex-1 border-white/10 text-white/60 hover:bg-white/5 text-xs"
                >
                  <Keyboard className="w-3.5 h-3.5 mr-1.5" /> Enter Code Manually
                </Button>
                {onFallbackOTP && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { onOpenChange(false); onFallbackOTP(); }}
                    className="border-white/10 text-white/60 hover:bg-white/5 text-xs"
                  >
                    Use OTP
                  </Button>
                )}
              </div>
            </>
          ) : (
            /* ─── Manual Code Entry ─── */
            <>
              <p className="text-sm text-white/50 text-center">
                Enter the backup code shown on the {scanType === "pickup" ? "donor's" : "receiver's"} screen.
              </p>

              <input
                type="text"
                value={manualCode}
                onChange={e => { setManualCode(e.target.value); setError(null); }}
                placeholder="Paste backup code here…"
                className="w-full h-12 bg-white/5 border border-white/15 rounded-xl px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono"
                onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
              />

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handleManualSubmit}
                disabled={isVerifying || !manualCode.trim()}
                className={`w-full h-12 font-bold ${
                  scanType === "pickup"
                    ? "bg-amber-500 hover:bg-amber-400 text-black"
                    : "bg-emerald-500 hover:bg-emerald-400 text-black"
                }`}
              >
                {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : `Verify ${label}`}
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setMode("camera"); setError(null); }}
                  className="flex-1 border-white/10 text-white/60 hover:bg-white/5 text-xs"
                >
                  <Camera className="w-3.5 h-3.5 mr-1.5" /> Back to Camera
                </Button>
                {onFallbackOTP && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { onOpenChange(false); onFallbackOTP(); }}
                    className="border-white/10 text-white/60 hover:bg-white/5 text-xs"
                  >
                    Use OTP
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
