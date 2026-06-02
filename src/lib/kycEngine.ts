// =============================================================================
// Smart KYC Engine — AI-Lite Document Verification & Scoring
// =============================================================================
// Provides automated scoring based on document presence, face-match simulation,
// and produces an auto-decision that can be overridden by an admin.
//
// Scoring breakdown:
//   - Aadhaar document present:  +40 points
//   - Selfie present:            +40 points
//   - Face match score > 60%:    +20 points
//   - PAN card (bonus):          +5  points (not required)
//
// Decision matrix:
//   score >= 80 AND face >= 70  →  auto-approved
//   face < 40                   →  auto-rejected
//   otherwise                   →  manual_review
// =============================================================================

export interface KycResult {
  kyc_score: number;
  face_match_score: number;
  auto_status: 'approved' | 'rejected' | 'manual_review';
  extracted_data?: {
    aadhaar?: string | null;
    name?: string | null;
  };
}

/**
 * Run the AI-lite KYC check against uploaded document paths.
 *
 * In production, replace the face_match_score with a real
 * face-comparison API (e.g., AWS Rekognition, Azure Face API).
 */
export const runKycCheck = async (documents: {
  aadhaar?: string | null;
  selfie?: string | null;
  pan?: string | null;
}): Promise<KycResult> => {
  const response = await fetch('/api/kyc-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aadhaar_path: documents.aadhaar,
      selfie_path: documents.selfie,
      pan_path: documents.pan
    })
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`KYC processing failed: ${errorDetails}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "KYC verification unsuccessful");
  }

  return {
    kyc_score: data.kyc_score,
    face_match_score: data.face_match_score,
    auto_status: data.auto_status,
    extracted_data: data.extracted_data,
  };
};

/**
 * Get a human-readable label for a KYC auto-status.
 */
export const getAutoStatusLabel = (status: string): string => {
  switch (status) {
    case 'approved':      return '🤖 Auto Approved';
    case 'rejected':      return '❌ Auto Rejected';
    case 'manual_review': return '⏳ Manual Review';
    default:              return '⏳ Pending';
  }
};

/**
 * Get the risk level based on the KYC score.
 */
export const getKycRiskLevel = (score: number): { label: string; color: string } => {
  if (score >= 80) return { label: 'Low Risk',    color: '#10b981' };
  if (score >= 50) return { label: 'Medium Risk', color: '#f59e0b' };
  return                   { label: 'High Risk',   color: '#ef4444' };
};
