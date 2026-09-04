import { useState, useEffect, useRef } from 'react';

export interface Suggestion {
  id: string;
  primaryText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

// ── Lightweight types for the classic Places API response ─────────────────────
interface ClassicPrediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const cacheRef     = useRef<Map<string, Suggestion[]>>(new Map());
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

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

    // Debounce — wait 350ms after user stops typing
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      // Cancel previous in-flight request
      if (controllerRef.current) controllerRef.current.abort();
      controllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        // ── Step 1: Get predictions from our server-side proxy ──────────────
        const autoRes = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`,
          { signal: controllerRef.current.signal }
        );

        if (!autoRes.ok) throw new Error(`Proxy error: ${autoRes.status}`);

        const autoData = await autoRes.json() as { predictions?: ClassicPrediction[]; status?: string };
        const predictions = autoData.predictions ?? [];

        if (predictions.length === 0) {
          setSuggestions([]);
          setIsLoading(false);
          return;
        }

        // ── Step 2: Geocode each place_id to get lat/lng ────────────────────
        const resolved = await Promise.all(
          predictions.slice(0, 5).map(async (p) => {
            try {
              const geoRes = await fetch(
                `/api/places/geocode?place_id=${encodeURIComponent(p.place_id)}`,
                { signal: controllerRef.current?.signal }
              );
              const geoData = await geoRes.json() as { location?: { lat: number; lng: number } };
              return {
                id: p.place_id,
                primaryText: p.structured_formatting.main_text,
                secondaryText: p.structured_formatting.secondary_text ?? '',
                lat: geoData.location?.lat ?? 0,
                lng: geoData.location?.lng ?? 0,
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
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useAddressAutocomplete]', err);
        setError('Could not load suggestions');
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return { suggestions, isLoading, error, setSuggestions };
}
