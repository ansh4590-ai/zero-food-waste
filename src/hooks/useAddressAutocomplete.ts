import { useState, useEffect, useRef, useCallback } from 'react';

export interface Suggestion {
  id: string;
  primaryText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

// Extend window to include Google Maps types
declare global {
  interface Window {
    google: typeof google;
    initGoogleMapsAutocomplete?: () => void;
  }
}

// ── Load the Google Maps JS SDK once (idempotent) ─────────────────────────────
let googleMapsLoaded = false;
let googleMapsLoading = false;
const googleMapsCallbacks: Array<() => void> = [];

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded) { resolve(); return; }
    googleMapsCallbacks.push(resolve);
    if (googleMapsLoading) return;

    googleMapsLoading = true;
    window.initGoogleMapsAutocomplete = () => {
      googleMapsLoaded = true;
      googleMapsCallbacks.forEach(cb => cb());
      googleMapsCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMapsAutocomplete`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const cacheRef = useRef<Map<string, Suggestion[]>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise services once the SDK is ready
  const initServices = useCallback(() => {
    if (!serviceRef.current && window.google?.maps?.places) {
      serviceRef.current = new window.google.maps.places.AutocompleteService();
    }
    if (!geocoderRef.current && window.google?.maps) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
  }, []);

  // Ensure SDK is loaded on mount
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('VITE_GOOGLE_MAPS_API_KEY is not set — address autocomplete disabled.');
      return;
    }
    loadGoogleMaps(apiKey).then(initServices);
  }, [initServices]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      setSuggestions([]);
      setError(null);
      return;
    }

    // Cache hit
    const cacheKey = trimmed.toLowerCase();
    if (cacheRef.current.has(cacheKey)) {
      setSuggestions(cacheRef.current.get(cacheKey)!);
      return;
    }

    // Debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      initServices();
      const service = serviceRef.current;
      const geocoder = geocoderRef.current;

      if (!service || !geocoder) {
        // SDK not loaded yet — silently skip
        return;
      }

      setIsLoading(true);
      setError(null);

      service.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: 'in' }, // Restrict to India
          types: ['geocode', 'establishment'],
        },
        async (predictions, status) => {
          if (
            status !== window.google.maps.places.PlacesServiceStatus.OK ||
            !predictions?.length
          ) {
            setSuggestions([]);
            setIsLoading(false);
            if (status !== window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              setError('Could not fetch suggestions');
            }
            return;
          }

          // Geocode each prediction to get lat/lng
          try {
            const resolved = await Promise.all(
              predictions.slice(0, 5).map(async (p) => {
                return new Promise<Suggestion>((res) => {
                  geocoder.geocode({ placeId: p.place_id }, (results, gStatus) => {
                    const loc = results?.[0]?.geometry?.location;
                    res({
                      id: p.place_id,
                      primaryText: p.structured_formatting.main_text,
                      secondaryText: p.structured_formatting.secondary_text || '',
                      lat: loc ? loc.lat() : 0,
                      lng: loc ? loc.lng() : 0,
                    });
                  });
                });
              })
            );

            const valid = resolved.filter(s => s.lat !== 0 || s.lng !== 0);
            cacheRef.current.set(cacheKey, valid);
            setSuggestions(valid);
          } catch {
            setError('Failed to resolve locations');
          } finally {
            setIsLoading(false);
          }
        }
      );
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, initServices]);

  return { suggestions, isLoading, error, setSuggestions };
}
