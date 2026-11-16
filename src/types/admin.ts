// =============================================================================
// Admin Panel Types
// =============================================================================
// Strict interfaces for all data shapes used in the Admin Panel.
// These replace every `any` that was previously used in AdminPanel.tsx.
// =============================================================================

// ─── KYC / Verification ─────────────────────────────────────────────────────

/** Document storage paths stored in profiles.documents JSONB column. */
export interface ProfileDocuments {
  aadhaar?: string | null;
  selfie?: string | null;
  pan?: string | null;
}

/** OCR-extracted data stored in profiles.extracted_data JSONB column. */
export interface ExtractedData {
  name?: string | null;
  aadhaar?: string | null;
}

/**
 * A profile row as selected by the admin KYC queue query.
 * Columns match the explicit `.select(...)` in fetchUsers().
 */
export interface KycProfile {
  id: string;
  full_name: string | null;
  role: string | null;
  phone: string | null;
  created_at: string | null;
  verification_status: 'pending' | 'approved' | 'rejected' | null;
  verification_rejection_reason: string | null;
  documents: ProfileDocuments | null;
  is_verified: boolean | null;
  kyc_submitted_at: string | null;
  location_lat: number | null;
  location_lng: number | null;
  kyc_score: number | null;
  face_match_score: number | null;
  kyc_auto_status: 'approved' | 'rejected' | 'manual_review' | null;
  document_verified: boolean | null;
  extracted_data?: ExtractedData | null;
}

/** Aggregated KYC statistics for the analytics cards. */
export interface KycStats {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  autoApproved: number;
  avgScore: number;
}

/** A single point in the 7-day KYC submission trend chart. */
export interface TrendPoint {
  date: string;
  count: number;
}

/** Signed URLs for document preview in the review dialog. */
export interface SignedUrls {
  aadhaar?: string;
  selfie?: string;
}

// ─── Fleet / Operations ─────────────────────────────────────────────────────

/** Volunteer profile fragment nested in the fleet task query. */
export interface FleetVolunteer {
  full_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
}

/** Food listing fragment nested via food_requests in fleet tasks. */
export interface FleetFoodListing {
  title?: string | null;
  location_name?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
}

/** Food request fragment nested in fleet tasks. */
export interface FleetFoodRequest {
  id: string;
  status: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  food_listings: FleetFoodListing | FleetFoodListing[] | null;
}

/**
 * A volunteer_tasks row as returned by the fleet query.
 *
 * Supabase foreign-key joins can return either a single object or an array
 * depending on the relationship cardinality. The component code already
 * guards for both cases with `Array.isArray()` checks.
 */
export interface FleetTask {
  id: string;
  status: string;
  completed_at: string | null;
  volunteer: FleetVolunteer | FleetVolunteer[] | null;
  food_requests: FleetFoodRequest | FleetFoodRequest[] | null;
}

// ─── Fleet Analytics ────────────────────────────────────────────────────────

/** Food intelligence stats derived from food_listings data. */
export interface IntelStats {
  urgentSaved: number;
  avgFreshness: number;
  expiredPrevented: number;
}

/** QR verification analytics from volunteer_tasks. */
export interface QrStats {
  qrVerified: number;
}

/** A single point in the daily rescue trend bar chart. */
export interface DailyRescuePoint {
  day: string;
  count: number;
}

/** A category breakdown point for the pie chart. */
export interface CategoryBreakdownPoint {
  name: string;
  value: number;
}
