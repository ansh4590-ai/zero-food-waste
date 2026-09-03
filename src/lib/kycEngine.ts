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
 * Run the AI-lite KYC check against uploaded document storage paths.
 *
 * Scoring is performed locally in the browser — no external API required.
 * In production, replace face_match_score with a real face-comparison
 * service (e.g., AWS Rekognition, Azure Face API).
 */
export const runKycCheck = async (documents: {
  aadhaar?: string | null;
  selfie?: string | null;
  pan?: string | null;
}): Promise<KycResult> => {
  // ── Simulate async processing delay (UX feel) ────────────────────────────
  await new Promise(resolve => setTimeout(resolve, 1200));

  // ── Document presence scoring ────────────────────────────────────────────
  let score = 0;
  if (documents.aadhaar) score += 40;
  if (documents.selfie)  score += 40;
  if (documents.pan)     score += 5;

  // ── Simulated face-match score (seeded by path hash for consistency) ─────
  // In production: replace with a real face-comparison API call.
  const seed = (documents.aadhaar || '') + (documents.selfie || '');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0; // 32-bit int
  }
  // Map hash to 45–98 range so most valid submissions pass
  const faceMatch = 45 + Math.abs(hash % 54);

  if (faceMatch > 60) score += 20;

  // ── Auto-decision matrix ─────────────────────────────────────────────────
  let auto_status: KycResult['auto_status'];
  if (score >= 80 && faceMatch >= 70) {
    auto_status = 'approved';
  } else if (faceMatch < 40) {
    auto_status = 'rejected';
  } else {
    auto_status = 'manual_review';
  }

  return {
    kyc_score: Math.min(score, 100),
    face_match_score: faceMatch,
    auto_status,
    extracted_data: {
      name: null,   // Populated by real OCR in production
      aadhaar: null,
    },
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
