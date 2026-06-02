import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, ShieldCheck, Lock, AlertTriangle } from "lucide-react";

interface OTPModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  volunteerId: string;
  otpType: "pickup" | "delivery";
  /** Called on successful verification with the new status */
  onVerified: (newStatus: string) => void;
  /** Optional: if true, shows photo upload after OTP success */
  showPhotoPrompt?: boolean;
  onPhotoCapture?: (base64: string) => void;
}

export function OTPModal({
  open, onOpenChange, taskId, volunteerId, otpType, onVerified,
  showPhotoPrompt, onPhotoCapture,
}: OTPModalProps) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setDigits(["", "", "", ""]);
      setError(null);
      setIsLocked(false);
      setRemaining(null);
      setVerified(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [open]);

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    setError(null);

    // Auto-advance to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && digits.every(d => d)) {
      handleVerify();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length === 4) {
      setDigits(pasted.split(""));
      inputRefs.current[3]?.focus();
    }
  };

  const handleVerify = async () => {
    const otp = digits.join("");
    if (otp.length !== 4) { setError("Enter all 4 digits"); return; }

    setIsVerifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          volunteer_id: volunteerId,
          otp_type: otpType,
          otp_value: otp,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setVerified(true);
        onVerified(data.new_status);
      } else if (data.locked) {
        setIsLocked(true);
        setError(data.error);
      } else {
        setError(data.error || "Incorrect OTP");
        setRemaining(data.remaining ?? null);
        setDigits(["", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const label = otpType === "pickup" ? "Pickup" : "Delivery";
  const accentColor = otpType === "pickup" ? "amber" : "emerald";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-sm bg-[#0f1111] text-white border-x-0 border-b-0 border-t sm:border border-white/10 rounded-t-3xl rounded-b-none sm:rounded-2xl shadow-2xl p-0 overflow-hidden !mt-auto !mb-0 !bottom-0 !top-auto !translate-y-0 fixed sm:static">
        {/* Header */}
        <div className={`bg-gradient-to-r ${otpType === 'pickup' ? 'from-amber-600 to-amber-500' : 'from-emerald-600 to-emerald-500'} px-6 py-4`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/70 font-semibold">OTP Verification</p>
              <DialogTitle className="text-lg font-bold text-white m-0">
                Confirm {label}
              </DialogTitle>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <DialogDescription className="text-white/50 text-sm text-center">
            {isLocked
              ? "This task has been locked due to too many incorrect attempts."
              : verified
              ? `${label} verified successfully!`
              : `Enter the 4-digit OTP shown to the ${otpType === 'pickup' ? 'donor' : 'receiver'}.`
            }
          </DialogDescription>

          {isLocked ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Lock className="w-12 h-12 text-red-400" />
              <p className="text-red-400 text-sm font-semibold text-center">{error}</p>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-white/60 hover:bg-white/5">
                Close
              </Button>
            </div>
          ) : verified ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className={`w-16 h-16 rounded-full bg-${accentColor}-500/20 flex items-center justify-center`}>
                <ShieldCheck className={`w-8 h-8 text-${accentColor}-400`} />
              </div>
              <p className={`text-${accentColor}-400 font-bold text-lg`}>Verified ✓</p>
              {showPhotoPrompt && (
                <div className="w-full space-y-2 mt-2">
                  <p className="text-white/40 text-xs text-center">Take a photo as proof (optional)</p>
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => onPhotoCapture?.(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Button variant="outline" className="w-full border-white/10 text-white/60 hover:bg-white/5" asChild>
                      <span>📷 Capture Photo</span>
                    </Button>
                  </label>
                </div>
              )}
              <Button
                onClick={() => onOpenChange(false)}
                className={`mt-2 bg-${accentColor}-500 hover:bg-${accentColor}-400 text-black font-bold px-8`}
              >
                Continue
              </Button>
            </div>
          ) : (
            <>
              {/* OTP Digit Inputs */}
              <div className="flex justify-center gap-3" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className={`w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 bg-white/5 outline-none transition-all ${
                      error
                        ? "border-red-500/50 text-red-400"
                        : digit
                        ? `border-${accentColor}-500/50 text-white`
                        : "border-white/15 text-white/60"
                    } focus:border-${accentColor}-400 focus:ring-2 focus:ring-${accentColor}-400/20`}
                  />
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center justify-center gap-2 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}

              {remaining !== null && remaining >= 0 && (
                <p className="text-white/30 text-xs text-center">
                  {remaining} attempt{remaining !== 1 ? 's' : ''} remaining
                </p>
              )}

              {/* Verify button */}
              <Button
                onClick={handleVerify}
                disabled={isVerifying || digits.some(d => !d)}
                className={`w-full h-12 font-bold text-sm ${
                  otpType === 'pickup'
                    ? 'bg-amber-500 hover:bg-amber-400 text-black'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                }`}
              >
                {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : `Verify ${label} OTP`}
              </Button>

              <p className="text-[10px] text-white/25 text-center">
                Ask the {otpType === 'pickup' ? 'donor' : 'receiver'} for their 4-digit code
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
