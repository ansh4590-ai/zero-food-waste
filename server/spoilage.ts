export type SpoilageRisk = "low" | "medium" | "high" | "unknown";

export interface SpoilageAssessment {
  spoilage_risk: SpoilageRisk;
  estimated_safe_hours: number | null;
  recommendation: string;
  method: "heuristic_rule_based";
}

export type SpoilageResponse =
  | { status: 400; body: { error: string } }
  | { status: 200; body: SpoilageAssessment };

const SUPPORTED_FOOD_TYPES = new Set(["cooked_meal", "raw_produce", "bakery", "packaged_food", "beverages"]);
const SUPPORTED_STORAGE_TYPES = new Set(["ambient", "refrigerated"]);
const ISO_WITH_TZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;

const RISK_RANK: Record<"low" | "medium" | "high", number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function raiseRisk(current: "low" | "medium" | "high", candidate: "low" | "medium" | "high"): "low" | "medium" | "high" {
  return RISK_RANK[candidate] > RISK_RANK[current] ? candidate : current;
}

export function evaluateSpoilageRisk(rawBody: unknown, nowMs: number = Date.now()): SpoilageResponse {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { status: 400, body: { error: "Request body must be a JSON object." } };
  }

  const { food_type, preparation_time, current_temperature_celsius, travel_distance_km, storage_type } =
    rawBody as Record<string, unknown>;

  if (
    typeof food_type !== "string" ||
    !food_type.trim() ||
    typeof storage_type !== "string" ||
    !storage_type.trim() ||
    typeof preparation_time !== "string" ||
    !preparation_time.trim()
  ) {
    return {
      status: 400,
      body: { error: "food_type, storage_type, and preparation_time are required non-empty strings." },
    };
  }

  if (!ISO_WITH_TZ_PATTERN.test(preparation_time)) {
    return {
      status: 400,
      body: { error: "preparation_time must be an ISO-8601 timestamp with timezone (e.g., Z or +05:30)." },
    };
  }

  const prepDate = new Date(preparation_time);
  if (Number.isNaN(prepDate.getTime()) || prepDate.getTime() > nowMs + ALLOWED_CLOCK_SKEW_MS) {
    return {
      status: 400,
      body: { error: "preparation_time must be a valid timestamp not more than 5 minutes in the future." },
    };
  }

  if (current_temperature_celsius !== undefined && current_temperature_celsius !== null) {
    if (typeof current_temperature_celsius !== "number" || !Number.isFinite(current_temperature_celsius)) {
      return { status: 400, body: { error: "current_temperature_celsius must be a finite number." } };
    }
  }

  if (travel_distance_km !== undefined && travel_distance_km !== null) {
    if (typeof travel_distance_km !== "number" || !Number.isFinite(travel_distance_km) || travel_distance_km < 0) {
      return { status: 400, body: { error: "travel_distance_km must be a non-negative finite number." } };
    }
  }

  if (!SUPPORTED_FOOD_TYPES.has(food_type) || !SUPPORTED_STORAGE_TYPES.has(storage_type)) {
    return {
      status: 200,
      body: {
        spoilage_risk: "unknown",
        estimated_safe_hours: null,
        recommendation: "Unsupported food or storage type for automated spoilage assessment.",
        method: "heuristic_rule_based",
      },
    };
  }

  if (current_temperature_celsius === undefined || current_temperature_celsius === null) {
    return {
      status: 200,
      body: {
        spoilage_risk: "unknown",
        estimated_safe_hours: null,
        recommendation: "Current temperature is required to assess spoilage risk.",
        method: "heuristic_rule_based",
      },
    };
  }

  const elapsedHours = Math.max(0, (nowMs - prepDate.getTime()) / (1000 * 60 * 60));

  // Each rule that returns a positive estimated_safe_hours explicitly states the inputs
  // establishing its assumptions. Without those inputs, return unknown and null.
  if (storage_type === "ambient") {
    if (current_temperature_celsius > 25 && food_type === "cooked_meal") {
      let risk: "low" | "medium" | "high" = "high";
      let recommendation = "Immediate refrigeration required. High risk of bacterial growth.";
      if (typeof travel_distance_km === "number" && travel_distance_km > 20) {
        risk = raiseRisk(risk, "medium");
        recommendation += " Use insulated bags for long travel.";
      }
      return {
        status: 200,
        body: {
          spoilage_risk: risk,
          estimated_safe_hours: 0,
          recommendation,
          method: "heuristic_rule_based",
        },
      };
    }

    // Preparation time and a single ambient temperature reading do not establish how long
    // food was held at that temperature, so do not claim a positive safe window.
    return {
      status: 200,
      body: {
        spoilage_risk: "unknown",
        estimated_safe_hours: null,
        recommendation: "Ambient storage history cannot be verified from a single temperature reading.",
        method: "heuristic_rule_based",
      },
    };
  }

  // Refrigerated rule: requires verified temperature <= 4°C (FDA refrigeration threshold) + preparation_time.
  if (current_temperature_celsius > 4) {
    return {
      status: 200,
      body: {
        spoilage_risk: "unknown",
        estimated_safe_hours: null,
        recommendation: "Refrigerated storage requires a verified temperature at or below 4°C.",
        method: "heuristic_rule_based",
      },
    };
  }

  const baseSafeHours = food_type === "cooked_meal" ? 48 : 72;
  const remainingSafeHours = Math.max(0, Math.round((baseSafeHours - elapsedHours) * 10) / 10);
  let risk: "low" | "medium" | "high" = "low";
  let recommendation = "Safe to transport.";

  if (remainingSafeHours <= 0) {
    risk = raiseRisk(risk, "high");
    recommendation = "Estimated safe window has elapsed since preparation. Do not distribute without inspection.";
  }

  return {
    status: 200,
    body: {
      spoilage_risk: risk,
      estimated_safe_hours: remainingSafeHours,
      recommendation,
      method: "heuristic_rule_based",
    },
  };
}
