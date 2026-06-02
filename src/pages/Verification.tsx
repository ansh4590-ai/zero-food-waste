import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ShieldCheck, Upload, AlertCircle, Clock, CheckCircle2, Brain, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { useAuthStore } from "../store";
import { runKycCheck, type KycResult } from "../lib/kycEngine";

export default function Verification() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  const [status, setStatus] = useState<string>("unset");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kycResult, setKycResult] = useState<KycResult | null>(null);
  const [processingStage, setProcessingStage] = useState<string>("");

  // Form references
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);

  useEffect(() => {
    if (!user || !isValidSupabaseId(user.id)) return;
    
    const fetchStatus = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("verification_status, verification_rejection_reason, kyc_score, face_match_score, kyc_auto_status")
          .eq("id", user.id)
          .single();
          
        if (error) throw error;
        
        setStatus(data.verification_status || "unset");
        setRejectionReason(data.verification_rejection_reason);
        if (data.kyc_score || data.face_match_score) {
          setKycResult({
            kyc_score: data.kyc_score ?? 0,
            face_match_score: data.face_match_score ?? 0,
            auto_status: data.kyc_auto_status ?? 'pending',
          });
        }
      } catch (e: any) {
        /* Silenced for security */
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStatus();
  }, [user]);

  const uploadDocument = async (file: File | null, type: string) => {
    try {
      if (!file) return null;
      if (!user || !isValidSupabaseId(user.id)) throw new Error("User strictly required for upload");

      if (file.size > 5 * 1024 * 1024) {
        throw new Error(`File too large (max 5MB) for ${type}`);
      }
      if (!file.type.includes("image")) {
        throw new Error(`Only images allowed for ${type}`);
      }

      const fileExt = file.name.split(".").pop();
      const filePath = `verification/${user.id}/${type}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("identity_docs")
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // ✅ Return the storage path (not the public URL) so that
      // AdminPanel can call getPublicUrl(path) with proper auth context.
      return filePath;

    } catch (err: any) {
      throw err;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isValidSupabaseId(user.id)) return;
    if (isSubmitting) return;
    
    if (!aadhaarFile || !selfieFile) {
      toast.error("Aadhaar and Selfie are mandatory for verification.");
      return;
    }

    setIsSubmitting(true);
    try {
      // ── Stage 1: Upload Documents ─────────────────────────────────────────
      setProcessingStage("Encrypting & uploading documents...");
      const aadhaarPath = await uploadDocument(aadhaarFile, 'aadhaar');
      const panPath = panFile ? await uploadDocument(panFile, 'pan') : null;
      const selfiePath = await uploadDocument(selfieFile, 'selfie');

      // ── Stage 2: Run AI KYC Engine ────────────────────────────────────────
      setProcessingStage("Running AI verification engine...");
      const result = await runKycCheck({
        aadhaar: aadhaarPath,
        selfie: selfiePath,
        pan: panPath,
      });
      setKycResult(result);

      // ── Stage 3: Save to Database ─────────────────────────────────────────
      setProcessingStage("Saving verification profile...");
      const { error } = await supabase
        .from("profiles")
        .update({
          documents: {
            aadhaar: aadhaarPath,
            pan: panPath || null,
            selfie: selfiePath,
          },
          verification_status: "pending",
          kyc_score: result.kyc_score,
          face_match_score: result.face_match_score,
          kyc_auto_status: result.auto_status,
          extracted_data: result.extracted_data,
          kyc_submitted_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      // ── Stage 4: Auto-Approval Engine ─────────────────────────────────────
      if (result.auto_status === "approved") {
        setProcessingStage("High confidence detected — auto-approving...");
        const { error: approveErr } = await supabase
          .from("profiles")
          .update({
            verification_status: "approved",
            is_verified: true,
            document_verified: true,
          })
          .eq("id", user.id);

        if (!approveErr) {
          setStatus("approved");
          toast.success("🎉 Identity verified automatically! You're ready to go.", {
            duration: 5000,
          });
          window.scrollTo(0, 0);
          return;
        }
      }

      setStatus("pending");
      if (result.auto_status === "rejected") {
        toast.warning("Documents flagged for manual review by our team.", {
          duration: 5000,
        });
      } else {
        toast.success("Documents submitted — AI engine scored your profile.", {
          duration: 4000,
        });
      }
      window.scrollTo(0, 0);
    } catch (error: any) {
      toast.error(error.message || "An error occurred during submission.");
    } finally {
      setIsSubmitting(false);
      setProcessingStage("");
    }
  };

  if (isLoading) return (
    <div className="flex justify-center items-center p-12 min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="text-sm text-muted-foreground">Loading verification status…</span>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 text-center max-w-xl mx-auto">
        <div className="relative inline-block mb-4">
          <ShieldCheck className="h-12 w-12 text-blue-600 mx-auto border-4 border-blue-50 rounded-full p-1 bg-card text-card-foreground" />
          <Brain className="h-5 w-5 text-violet-500 absolute -top-1 -right-1 bg-card rounded-full p-0.5" />
        </div>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Smart Identity Verification</h1>
        <p className="mt-3 text-lg text-gray-500">
          Our AI-powered KYC engine verifies your identity in seconds. High-confidence submissions are approved instantly.
        </p>
      </div>

      {/* ──── AUTO-APPROVED BANNER ──── */}
      {status === 'approved' && (
        <Card className="border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 shadow-sm mb-8 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardContent className="flex flex-col sm:flex-row items-center justify-between p-6 sm:p-8 gap-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200 mb-1">Identity Verified</h3>
                <p className="text-emerald-700 dark:text-emerald-400 leading-relaxed max-w-lg">
                  Your identity has been successfully verified. You now have full access to the logistics platform.
                </p>
                {kycResult && (
                  <div className="flex gap-4 mt-3">
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-full font-medium">
                      KYC Score: {kycResult.kyc_score}/100
                    </span>
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-full font-medium">
                      Face Match: {kycResult.face_match_score.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Button variant="outline" className="w-full sm:w-auto bg-card text-card-foreground border-emerald-200 text-emerald-800 hover:bg-emerald-100" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ──── PENDING REVIEW BANNER ──── */}
      {status === 'pending' && (
        <Card className="border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 shadow-sm mb-8 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
          <CardContent className="flex flex-col sm:flex-row items-center justify-between p-6 sm:p-8 gap-6">
            <div className="flex items-start gap-4">
              <Clock className="w-8 h-8 text-amber-600 shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold text-amber-900 dark:text-amber-200 mb-1">Under AI + Human Review</h3>
                <p className="text-amber-700 dark:text-amber-400 leading-relaxed max-w-lg">
                  Your documents have been scored by our AI engine and are queued for final human verification. 
                  This typically takes less than 24 hours.
                </p>
                {kycResult && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full font-medium">
                      KYC Score: {kycResult.kyc_score}/100
                    </span>
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full font-medium">
                      Face Match: {kycResult.face_match_score.toFixed(1)}%
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      kycResult.auto_status === 'manual_review' 
                        ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-300' 
                        : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'
                    }`}>
                      {kycResult.auto_status === 'manual_review' ? '⏳ Queued for Review' : '⚠️ Flagged for Review'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Button variant="outline" className="w-full sm:w-auto bg-card text-card-foreground border-amber-200 text-amber-800 hover:bg-amber-100" onClick={() => navigate('/dashboard')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ──── REJECTED BANNER ──── */}
      {status === 'rejected' && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 shadow-sm mb-8 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
          <CardContent className="p-6 sm:p-8 flex items-start gap-4">
            <AlertCircle className="w-8 h-8 text-red-600 shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-900 dark:text-red-200 mb-1">Verification Unsuccessful</h3>
              <p className="text-red-700 dark:text-red-400 mb-4">{rejectionReason || "Your documents could not be verified. Please try uploading again with clearer photos."}</p>
              {kycResult && (
                <div className="flex gap-3 mb-4">
                  <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 px-2.5 py-1 rounded-full font-medium">
                    Score: {kycResult.kyc_score}/100
                  </span>
                  <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 px-2.5 py-1 rounded-full font-medium">
                    Face Match: {kycResult.face_match_score.toFixed(1)}%
                  </span>
                </div>
              )}
              <Button onClick={() => setStatus('unset')} variant="destructive" className="shadow-sm font-medium">
                Re-upload Documents
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ──── UPLOAD FORM ──── */}
      {status === 'unset' && (
        <Card className="shadow-lg border-border rounded-2xl overflow-hidden">
          <form onSubmit={handleSubmit}>
            <CardHeader className="bg-muted/50 border-b border-border">
              <CardTitle className="text-xl flex items-center gap-2">
                <Brain className="h-5 w-5 text-violet-500" />
                Upload Documents
              </CardTitle>
              <CardDescription>All uploads are encrypted. Our AI engine scores your documents in real-time for faster verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 p-6 sm:p-8">
              {/* Aadhaar */}
              <div className="space-y-3">
                <Label className="text-base font-semibold text-foreground">1. Aadhaar Card (Front)<span className="text-red-500">*</span></Label>
                <p className="text-sm text-gray-500 -mt-1">Clear photo of your government-issued ID.</p>
                <div className="relative group">
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => setAadhaarFile(e.target.files?.[0] || null)}
                    className="h-16 pt-5 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    required
                  />
                </div>
              </div>

              {/* PAN */}
              <div className="space-y-3">
                <Label className="text-base font-semibold text-foreground">2. PAN Card (Optional — <span className="text-violet-600">+5 AI score bonus</span>)</Label>
                <p className="text-sm text-gray-500 -mt-1">Helps speed up verification and boosts your confidence score.</p>
                <div className="relative group">
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => setPanFile(e.target.files?.[0] || null)}
                    className="h-16 pt-5 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
                  />
                </div>
              </div>

              {/* Selfie */}
              <div className="space-y-3 pt-2">
                <Label className="text-base font-semibold text-foreground">3. Recent Selfie<span className="text-red-500">*</span></Label>
                <p className="text-sm text-gray-500 -mt-1">For AI face match with your Aadhaar photo. Please ensure good lighting.</p>
                <div className="relative group">
                  <Input 
                    type="file" 
                    accept="image/*" capture="user"
                    onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
                    className="h-16 pt-5 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    required
                  />
                </div>
              </div>

              {/* AI Engine Info */}
              <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Brain className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Smart KYC Engine</h4>
                    <p className="text-xs text-violet-700 dark:text-violet-400 mt-1 leading-relaxed">
                      Your documents will be automatically scored by our AI engine. High-confidence submissions 
                      (score ≥ 80, face match &gt; 70%) are approved instantly without manual review.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/50 border-t border-border p-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => navigate('/dashboard')}>Cancel</Button>
              <Button type="submit" size="lg" disabled={isSubmitting} className="rounded-full px-8 shadow-sm min-w-[220px]">
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {processingStage || "Processing..."}
                  </span>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> Submit for AI Verification</>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
