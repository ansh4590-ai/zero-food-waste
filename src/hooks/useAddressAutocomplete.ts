import { useState, useEffect, useRef, useCallback } from 'react';

export interface Suggestion {
  id: string;
  primaryText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

// ── Load the Google Maps JS SDK once ─────────────────────────────────────────
let loadPromise: Promise<void> | null = null;

function loadMapsSDK(): Promise<void> {
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
  if (!key) {
    console.warn('[useAddressAutocomplete] No VITE_GOOGLE_MAPS_API_KEY set');
    return Promise.reject(new Error('No API key'));
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    // Use the callback approach to avoid "google is not defined" race
    const cbName = '__gmapsInit__';
    (window as any)[cbName] = () => {
      delete (window as any)[cbName];
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=${cbName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps SDK'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const cacheRef      = useRef<Map<string, Suggestion[]>>(new Map());
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocomplete  = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoder      = useRef<google.maps.Geocoder | null>(null);
  const sessionToken  = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Initialise SDK services once
  const initServices = useCallback(async () => {
    if (autocomplete.current) return;
    await loadMapsSDK();
    autocomplete.current = new google.maps.places.AutocompleteService();
    geocoder.current     = new google.maps.Geocoder();
    sessionToken.current = new google.maps.places.AutocompleteSessionToken();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      setSuggestions([]);
      setError(null);
      return;
    }

    // Cache hit — instant
    const cacheKey = trimmed.toLowerCase();
    if (cacheRef.current.has(cacheKey)) {
      setSuggestions(cacheRef.current.get(cacheKey)!);
      return;
    }

    // Debounce 350ms
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        await initServices();

        // Step 1 — predictions
        const response = await autocomplete.current!.getPlacePredictions({
          input: trimmed,
          componentRestrictions: { country: 'in' },
          sessionToken: sessionToken.current!,
        });

        const predictions = response?.predictions ?? [];
        if (predictions.length === 0) {
          setSuggestions([]);
          setIsLoading(false);
          return;
        }

        // Step 2 — geocode each to get lat/lng
        const resolved = await Promise.all(
          predictions.slice(0, 5).map(async (p) => {
            try {
              const geo = await geocoder.current!.geocode({ placeId: p.place_id });
              const loc = geo.results?.[0]?.geometry?.location;
              return {
                id: p.place_id,
                primaryText: p.structured_formatting?.main_text ?? p.description,
                secondaryText: p.structured_formatting?.secondary_text ?? '',
                lat: loc?.lat() ?? 0,
                lng: loc?.lng() ?? 0,
              } as Suggestion;
            } catch {
              return null;
            }
          })
        );

        const valid = resolved.filter(
          (s): s is Suggestion => s !== null && (s.lat !== 0 || s.lng !== 0)
        );

        cacheRef.current.set(cacheKey, valid);
        setSuggestions(valid);

        // Refresh session token after a selection cycle
        sessionToken.current = new google.maps.places.AutocompleteSessionToken();
      } catch (err) {
        console.error('[useAddressAutocomplete]', err);
        setError('Could not load suggestions');
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, initServices]);

  return { suggestions, isLoading, error, setSuggestions };
}
