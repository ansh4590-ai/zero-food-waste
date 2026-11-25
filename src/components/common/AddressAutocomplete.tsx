import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Loader2, Search } from 'lucide-react';
import { Input } from '../ui/input';
import { useAddressAutocomplete, Suggestion } from '../../hooks/useAddressAutocomplete';

interface AddressAutocompleteProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (val: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function AddressAutocomplete({
  id,
  name,
  value,
  onChange,
  onSelect,
  placeholder = "Enter full address or pincode...",
  className = "",
  required = false
}: AddressAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { suggestions, isLoading, error, setSuggestions } = useAddressAutocomplete(value);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (suggestion: Suggestion) => {
    // Update the input text to the full address
    const fullAddress = suggestion.secondaryText 
      ? `${suggestion.primaryText}, ${suggestion.secondaryText}`
      : suggestion.primaryText;
      
    onChange(fullAddress);
    onSelect(suggestion);
    setIsOpen(false);
    // Clear suggestions so it doesn't immediately pop open again if typing resumes 
    // unless they type more characters
    setSuggestions([]); 
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className={`pl-10 pr-10 ${className}`}
          required={required}
          autoComplete="off"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (value.trim().length >= 3) && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground rounded-md shadow-lg border border-border overflow-hidden">
          {isLoading && suggestions.length === 0 ? (
            <div className="p-4 text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
              <Search className="h-4 w-4 animate-pulse" /> Searching...
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-center text-red-500">
              {error}
            </div>
          ) : suggestions.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto py-1 overscroll-contain">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  onClick={() => handleSelect(suggestion)}
                  className="px-4 py-2.5 hover:bg-muted cursor-pointer flex flex-col transition-colors border-b border-border/50 last:border-0"
                >
                  <span className="text-sm font-medium leading-none mb-1">
                    {suggestion.primaryText}
                  </span>
                  {suggestion.secondaryText && (
                    <span className="text-xs text-muted-foreground truncate">
                      {suggestion.secondaryText}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : !isLoading ? (
            <div className="p-4 text-sm text-center text-muted-foreground">
              No results found for "{value}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
