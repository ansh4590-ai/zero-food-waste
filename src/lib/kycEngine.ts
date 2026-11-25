// =============================================================================
// Smart KYC Types & Utilities
// =============================================================================
// KYC scoring and decisioning is performed server-side exclusively via
// the trusted /api/kyc-verify endpoint (Google Cloud Vision OCR + AWS Rekognition).
// The frontend never calculates or self-approves KYC scores.
// =============================================================================

export interface KycResult {
  kyc_score: number | null;
  face_match_score: number | null;
  auto_status: 'approved' | 'rejected' | 'manual_review' | 'pending';
  extracted_data?: {
    aadhaar?: string | null;
    name?: string | null;
  };
}

/**
 * Get a human-readable label for a KYC auto-status.
 */
export const getAutoStatusLabel = (status: string): string => {
  switch (status) {
    case 'approved':      return 'Historical automated match';
    case 'rejected':      return 'Historical automated flag';
    case 'manual_review': return '⏳ Manual Review';
    default:              return '⏳ Pending';
  }
};

/**
 * Get the risk level based on the KYC score.
 */
export const getKycRiskLevel = (score: number): { label: string; color: string } => {
  if (score >= 80) return { label: 'Low Risk',    color: '#10b981' };
  if (score >= 60) return { label: 'Medium Risk', color: '#f59e0b' };
  return { label: 'High Risk',   color: '#ef4444' };
};
