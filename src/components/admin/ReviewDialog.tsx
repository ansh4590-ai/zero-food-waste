import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { UserCheck, FileText, Eye, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { getAutoStatusLabel, getKycRiskLevel } from "../../lib/kycEngine";
import { getFaceMatchColor, getAutoStatusBadgeClasses } from "../../lib/adminUtils";
import type { KycProfile, SignedUrls } from "../../types/admin";

interface ReviewDialogProps {
  user: KycProfile | null;
  signedUrls: SignedUrls;
  isProcessing: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

export default function ReviewDialog({
  user,
  signedUrls,
  isProcessing,
  onClose,
  onApprove,
  onReject,
}: ReviewDialogProps) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleClose = () => {
    setRejectMode(false);
    setRejectionReason("");
    onClose();
  };

  const handleReject = () => {
    if (!rejectionReason) return;
    onReject(rejectionReason);
    setRejectMode(false);
    setRejectionReason("");
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserCheck className="h-6 w-6 text-primary" /> Review Identity: {user?.full_name}
          </DialogTitle>
          <DialogDescription>
            AI-scored profile — admin override available below.
          </DialogDescription>
        </DialogHeader>

        {!rejectMode ? (
          <div className="py-4 space-y-6">
            {/* ─── AI Scores Panel ─── */}
            {user?.kyc_score != null && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-xl border border-border">
                <div className="text-center">
                  <span className="text-2xl font-bold" style={{ color: getKycRiskLevel(user.kyc_score).color }}>
                    {user.kyc_score}
                  </span>
                  <p className="text-[10px] text-muted-foreground uppercase mt-0.5">KYC Score</p>
                </div>
                <div className="text-center">
                  <span className={`text-2xl font-bold ${getFaceMatchColor(user.face_match_score ?? 0)}`}>
                    {user.face_match_score?.toFixed(1) ?? '—'}%
                  </span>
                  <p className="text-[10px] text-muted-foreground uppercase mt-0.5">Face Match</p>
                </div>
                <div className="text-center">
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full inline-block ${getAutoStatusBadgeClasses(user.kyc_auto_status)}`}>
                    {getAutoStatusLabel(user.kyc_auto_status ?? 'pending')}
                  </span>
                  <p className="text-[10px] text-muted-foreground uppercase mt-1.5">AI Decision</p>
                </div>
              </div>
            )}

            {/* ─── OCR Extracted Data ─── */}
            <div className="grid grid-cols-1 gap-6">
              {user?.extracted_data && (
                <div className="bg-muted/30 p-4 rounded-xl border border-border">
                  <h4 className="font-semibold text-sm mb-2">OCR Extracted Data</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs">Name on Card</span>
                      <span className="font-medium text-foreground">{user.extracted_data?.name || "Not found"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Aadhaar Number</span>
                      <span className="font-medium text-foreground">{user.extracted_data?.aadhaar || "Not found"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Document Images ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Aadhaar Card</h4>
                <div className="aspect-[4/3] bg-gray-100 dark:bg-muted rounded-xl border flex items-center justify-center overflow-hidden">
                  {signedUrls.aadhaar
                    ? <img src={signedUrls.aadhaar} alt="Aadhaar" className="object-contain w-full h-full" />
                    : user?.documents?.aadhaar ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <span className="text-sm text-gray-400">No Image</span>}
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2"><Eye className="h-4 w-4" /> Live Selfie</h4>
                <div className="aspect-[4/3] bg-gray-100 dark:bg-muted rounded-xl border flex items-center justify-center overflow-hidden">
                  {signedUrls.selfie
                    ? <img src={signedUrls.selfie} alt="Selfie" className="object-contain w-full h-full" />
                    : user?.documents?.selfie ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <span className="text-sm text-gray-400">No Image</span>}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 space-y-4">
            <Label>Rejection Reason</Label>
            <Input placeholder="Reason for rejection (visible to user)" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          {!rejectMode ? (
            <div className="flex justify-between w-full">
              <Button variant="ghost" onClick={handleClose}>Close</Button>
              <div className="flex gap-2">
                 <Button variant="destructive" onClick={() => setRejectMode(true)}>Reject</Button>
                 <Button onClick={onApprove} className="bg-green-600 hover:bg-green-700 text-white" disabled={isProcessing}>
                   {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve'}
                 </Button>
              </div>
            </div>
          ) : (
             <div className="flex justify-between w-full">
               <Button variant="ghost" onClick={() => setRejectMode(false)}>Back</Button>
               <Button variant="destructive" onClick={handleReject} disabled={isProcessing || !rejectionReason}>
                 {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Rejection'}
               </Button>
             </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
