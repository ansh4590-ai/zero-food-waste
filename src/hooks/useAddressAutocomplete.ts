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
        // Photon by Komoot — Free OpenStreetMap Geocoder
        // No API keys, no billing, OpenStreetMap data.
        const url = new URL('https://photon.komoot.io/api/');
        url.searchParams.set('q', trimmed);
        url.searchParams.set('limit', '5');

        const res = await fetch(url.toString(), {
          signal: controllerRef.current.signal,
        });

        if (!res.ok) throw new Error(`Photon error: ${res.status}`);

        const data = await res.json();
        const features = data.features || [];

        const mapped: Suggestion[] = features.map((f: any, idx: number) => {
          const props = f.properties || {};
          const coords = f.geometry?.coordinates || [0, 0];

          // Build primary and secondary labels
          const name = props.name || props.street || props.city || 'Location';
          const secondaryParts = [
            props.district,
            props.city,
            props.state,
            props.country,
          ].filter(Boolean);

          return {
            id: `${props.osm_id || idx}-${coords[0]}-${coords[1]}`,
            primaryText: name,
            secondaryText: secondaryParts.join(', '),
            lat: coords[1],
            lng: coords[0],
          };
        });

        cacheRef.current.set(cacheKey, mapped);
        setSuggestions(mapped);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useAddressAutocomplete (Photon/OSM)]', err);
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
