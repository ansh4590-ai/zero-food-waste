// =============================================================================
// Leaflet Icon Setup & Factories
// =============================================================================
// Moved from AdminPanel.tsx top-level scope. Sets up default Leaflet icons
// and provides factory functions for custom map pins.
// =============================================================================

import L from "leaflet";

// ─── Fix default Leaflet icon paths (broken by bundlers) ─────────────────────
if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
  delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
}

// ─── Custom Agent Pin (blue dot with white center) ───────────────────────────
export const createAgentIcon = (): L.DivIcon | undefined =>
  typeof L !== 'undefined'
    ? L.divIcon({
        className: "custom-agent-pin",
        html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#3b82f6;border-radius:50%;border:2px solid #0f1111;box-shadow:0 6px 12px rgba(0,0,0,0.5);">
          <div style="width:10px;height:10px;background:#fff;border-radius:50%;"></div>
         </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })
    : undefined;

// ─── Custom Target Pin (small colored dot) ───────────────────────────────────
export const createTargetIcon = (color: string): L.DivIcon | undefined =>
  typeof L !== 'undefined'
    ? L.divIcon({
        className: "custom-target-pin",
        html: `<div style="width:16px;height:16px;background:${color};border-radius:50%;border:2px solid #0f1111;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
    : undefined;
