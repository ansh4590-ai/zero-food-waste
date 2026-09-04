import { useState, useEffect, useRef } from 'react';

export interface Suggestion {
  id: string;
  primaryText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const cacheRef      = useRef<Map<string, Suggestion[]>>(new Map());
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // Use Photon by Komoot (Free OpenStreetMap Geocoder)
        // No API keys, no billing, no CORS issues.
        const url = new URL('https://photon.komoot.io/api/');
        url.searchParams.set('q', trimmed);
        url.searchParams.set('limit', '5');
        // Restrict to India to improve relevance (optional, but helpful for this app)
        // Note: Photon doesn't strictly enforce country filters well for all queries,
        // but passing lat/lon bias or just searching generally works fine.

        const res = await fetch(url.toString(), {
          signal: controllerRef.current.signal,
        });

        if (!res.ok) throw new Error(`Photon error: ${res.status}`);

        const data = await res.json();
        const features = data.features || [];

        const results = features.map((f: any, idx: number) => {
          const props = f.properties;
          const coords = f.geometry.coordinates; // [lng, lat]
          
          // Build a readable address
          const primaryText = props.name || props.street || props.city || 'Unknown place';
          
          const secondaryParts = [];
          if (props.name && props.street) secondaryParts.push(props.street);
          if (props.city && props.city !== primaryText) secondaryParts.push(props.city);
          if (props.state) secondaryParts.push(props.state);
          if (props.postcode) secondaryParts.push(props.postcode);

          return {
            id: `photon-${idx}-${Date.now()}`,
            primaryText,
            secondaryText: secondaryParts.join(', '),
            lat: coords[1],
            lng: coords[0],
          } as Suggestion;
        });

        // Filter out places with no coordinates just in case
        const valid = results.filter((s: Suggestion) => s.lat !== 0 && s.lng !== 0);

        cacheRef.current.set(cacheKey, valid);
        setSuggestions(valid);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useAddressAutocomplete (Photon)]', err);
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
