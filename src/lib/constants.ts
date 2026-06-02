/**
 * Canonical Status Constants
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all status values across the application.
 * NEVER hardcode status strings elsewhere — always import from here.
 *
 * volunteer_tasks lifecycle:  open → pending_acceptance → assigned → picked_up → delivered | cancelled
 * food_requests lifecycle:    pending → assigned → picked_up → delivered | cancelled | rejected
 * food_listings lifecycle:    active → reserved → completed | expired | cancelled
 */

// ─── VOLUNTEER TASK STATUSES ────────────────────────────────────────────────
export const VOLUNTEER_STATUS = {
  OPEN:               "open",
  PENDING_ACCEPTANCE: "pending_acceptance",
  ASSIGNED:           "assigned",
  PICKED_UP:          "picked_up",
  DELIVERED:          "delivered",
  CANCELLED:          "cancelled",
} as const;

export type VolunteerStatus = typeof VOLUNTEER_STATUS[keyof typeof VOLUNTEER_STATUS];

/** Statuses where the volunteer is actively working a task */
export const VOLUNTEER_ACTIVE_STATUSES: VolunteerStatus[] = [
  VOLUNTEER_STATUS.ASSIGNED,
  VOLUNTEER_STATUS.PICKED_UP,
];

/** Statuses where the task is complete (terminal) */
export const VOLUNTEER_TERMINAL_STATUSES: VolunteerStatus[] = [
  VOLUNTEER_STATUS.DELIVERED,
  VOLUNTEER_STATUS.CANCELLED,
];

// ─── FOOD REQUEST STATUSES ──────────────────────────────────────────────────
export const REQUEST_STATUS = {
  PENDING:   "pending",
  ACCEPTED:  "accepted",
  ASSIGNED:  "assigned",
  PICKED_UP: "picked_up",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REJECTED:  "rejected",
} as const;

export type RequestStatus = typeof REQUEST_STATUS[keyof typeof REQUEST_STATUS];

// ─── FOOD LISTING STATUSES ──────────────────────────────────────────────────
export const LISTING_STATUS = {
  ACTIVE:    "active",
  RESERVED:  "reserved",    // Set by trigger when first receiver requests
  COMPLETED: "completed",   // Set by RPC when delivery is verified
  EXPIRED:   "expired",
  CANCELLED: "cancelled",
} as const;

export type ListingStatus = typeof LISTING_STATUS[keyof typeof LISTING_STATUS];

/** food_listings statuses considered "successfully delivered" */
export const LISTING_DELIVERED_STATUSES: ListingStatus[] = [
  LISTING_STATUS.COMPLETED,
];

/** food_listings statuses considered "currently active" */
export const LISTING_ACTIVE_STATUSES: ListingStatus[] = [
  LISTING_STATUS.ACTIVE,
  LISTING_STATUS.RESERVED,
];

export const FOOD_CATEGORIES = [
  { label: "Cooked Meals", value: "cooked_meal" },
  { label: "Fresh Produce", value: "raw_produce" },
  { label: "Bakery", value: "bakery" },
  { label: "Packaged Food", value: "packaged_food" },
  { label: "Beverages", value: "beverages" },
  { label: "Other", value: "other" },
];

// ─── API CONFIGURATION ─────────────────────────────────────────────────────
/** Base URL for backend API calls. Falls back to relative `/api` for same-origin dev. */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// ─── GEOLOCATION / ROUTING CONFIGURATION ────────────────────────────────────
export const GEO_CONFIG = {
  /** How often to re-fetch OSRM routes while a task is active (ms) */
  ROUTE_REFRESH_INTERVAL_MS: 30_000,
  /** Minimum movement before we write GPS position to DB (meters) */
  GPS_DEBOUNCE_METERS: 50,
  /** Consolidated countdown / UI refresh tick interval (ms) */
  COUNTDOWN_TICK_INTERVAL_MS: 30_000,
  /** Max age of cached GPS position for watchPosition (ms) */
  MAX_WATCH_AGE_MS: 10_000,
  /** Timeout for GPS watchPosition requests (ms) */
  WATCH_TIMEOUT_MS: 5_000,
} as const;

// ─── SUPABASE RPC FUNCTION NAMES ────────────────────────────────────────────
/** Centralized RPC names to avoid typo bugs and simplify refactoring. */
export const RPC = {
  GET_MY_VOLUNTEER_TASKS: "get_my_volunteer_tasks",
  CLAIM_TASK:             "claim_volunteer_task",
  HANDLE_ASSIGNMENT:      "handle_task_assignment",
  ABORT_TASK:             "abort_volunteer_task",
} as const;

// ─── SUPABASE TABLE NAMES ───────────────────────────────────────────────────
export const TABLES = {
  PROFILES:        "profiles",
  FOOD_REQUESTS:   "food_requests",
  FOOD_LISTINGS:   "food_listings",
  VOLUNTEER_TASKS: "volunteer_tasks",
} as const;

// ─── ROUTABLE VOLUNTEER STATUSES ────────────────────────────────────────────
/** Task statuses that imply a destination for OSRM routing. */
export const ROUTABLE_STATUSES: VolunteerStatus[] = [
  VOLUNTEER_STATUS.OPEN,
  VOLUNTEER_STATUS.PENDING_ACCEPTANCE,
  VOLUNTEER_STATUS.ASSIGNED,
  VOLUNTEER_STATUS.PICKED_UP,
];

/** Non-terminal statuses to fetch from DB for the volunteer's active manifest. */
export const MY_TASK_STATUSES: VolunteerStatus[] = [
  VOLUNTEER_STATUS.OPEN,
  VOLUNTEER_STATUS.PENDING_ACCEPTANCE,
  VOLUNTEER_STATUS.ASSIGNED,
  VOLUNTEER_STATUS.PICKED_UP,
];
