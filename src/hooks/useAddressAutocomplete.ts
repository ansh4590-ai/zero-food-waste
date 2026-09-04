import { useState, useEffect, useRef } from 'react';

export interface Suggestion {
  id: string;
  primaryText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

// ── Types for the new Places REST API ─────────────────────────────────────────
interface PlacesAutocompletePrediction {
  placePrediction: {
    placeId: string;
    text: { text: string };
    structuredFormat: {
      mainText: { text: string };
      secondaryText?: { text: string };
    };
  };
}

interface PlacesAutocompleteResponse {
  suggestions?: PlacesAutocompletePrediction[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, Suggestion[]>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

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

    debounceRef.current = setTimeout(async () => {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        setError('Maps API key not configured');
        return;
      }

      // Cancel any in-flight request
      if (controllerRef.current) controllerRef.current.abort();
      controllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        // Step 1: Get autocomplete predictions via new Places REST API
        const autoRes = await fetch(
          'https://places.googleapis.com/v1/places:autocomplete',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
            },
            body: JSON.stringify({
              input: trimmed,
              includedRegionCodes: ['in'],
              languageCode: 'en',
            }),
            signal: controllerRef.current.signal,
          }
        );

        if (!autoRes.ok) {
          throw new Error(`Places API error: ${autoRes.status}`);
        }

        const autoData: PlacesAutocompleteResponse = await autoRes.json();
        const predictions = autoData.suggestions ?? [];

        if (predictions.length === 0) {
          setSuggestions([]);
          setIsLoading(false);
          return;
        }

        // Step 2: Geocode top 5 placeIds to get lat/lng
        const resolved = await Promise.all(
          predictions.slice(0, 5).map(async (item) => {
            const { placeId, structuredFormat } = item.placePrediction;
            try {
              const geoRes = await fetch(
                `https://places.googleapis.com/v1/places/${placeId}?fields=location`,
                {
                  headers: { 'X-Goog-Api-Key': apiKey },
                  signal: controllerRef.current?.signal,
                }
              );
              const geoData = await geoRes.json();
              const lat = geoData.location?.latitude ?? 0;
              const lng = geoData.location?.longitude ?? 0;
              return {
                id: placeId,
                primaryText: structuredFormat.mainText.text,
                secondaryText: structuredFormat.secondaryText?.text ?? '',
                lat,
                lng,
              } as Suggestion;
            } catch {
              return null;
            }
          })
        );

        const valid = resolved.filter((s): s is Suggestion => s !== null && (s.lat !== 0 || s.lng !== 0));
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
