import { useState, useEffect, useRef } from 'react';

export interface Suggestion {
  id: string;
  primaryText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In-memory cache for API responses to prevent redundant network calls
  const cacheRef = useRef<Map<string, Suggestion[]>>(new Map());

  useEffect(() => {
    const trimmedQuery = query.trim();
    
    // 1. Minimum Query Length Rule
    if (trimmedQuery.length < 3) {
      setSuggestions([]);
      setError(null);
      return;
    }

    // 2. Check Cache
    const cacheKey = trimmedQuery.toLowerCase();
    if (cacheRef.current.has(cacheKey)) {
      setSuggestions(cacheRef.current.get(cacheKey) || []);
      setError(null);
      return;
    }

    // 3. Setup Debounce & AbortController
    setIsLoading(true);
    setError(null);
    const abortController = new AbortController();

    const fetchTimer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedQuery)}&limit=5`,
          { signal: abortController.signal }
        );

        if (!res.ok) {
          throw new Error('Failed to fetch address suggestions');
        }

        const data = await res.json();
        
        // 4. Format GeoJSON response
        const formattedSuggestions: Suggestion[] = (data.features || []).map((f: any) => {
          const props = f.properties;
          
          // Construct primary text (name of the place, or street)
          const primaryText = props.name || props.street || props.city || "Unknown Location";
          
          // Construct secondary text (city, state, country, postcode)
          const secondaryParts = [];
          if (props.city && props.city !== primaryText) secondaryParts.push(props.city);
          if (props.state) secondaryParts.push(props.state);
          if (props.country) secondaryParts.push(props.country);
          if (props.postcode) secondaryParts.push(props.postcode);
          
          const secondaryText = secondaryParts.join(', ');

          return {
            id: `${props.osm_id}-${Math.random()}`,
            primaryText,
            secondaryText,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          };
        });

        // Update Cache
        cacheRef.current.set(cacheKey, formattedSuggestions);
        
        setSuggestions(formattedSuggestions);
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message || 'An error occurred');
          setSuggestions([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, 400); // 400ms debounce

    // Cleanup function runs on unmount or before the next effect runs
    return () => {
      clearTimeout(fetchTimer);
      abortController.abort();
    };
  }, [query]);

  return { suggestions, isLoading, error, setSuggestions };
}
