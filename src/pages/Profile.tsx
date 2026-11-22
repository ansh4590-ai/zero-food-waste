import { useState, useEffect, useCallback } from "react";
import { User, MapPin, Phone, Save, Loader2, CheckCircle2, Navigation, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Link } from "react-router-dom";
// ── Nominatim reverse geocoding (OpenStreetMap, free, no API key) ───────────
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          "Accept-Language": "en",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.display_name as string) ?? null;
  } catch {
    return null;
  }
}

interface ProfileData {
  full_name: string;
  phone: string;
  role: string;
  location_lat: number | null;
  location_lng: number | null;
  location_text: string | null;
  verification_status: string | null;
}

export default function Profile() {
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<ProfileData>({
    full_name: "",
    phone: "",
    role: "donor",
    location_lat: null,
    location_lng: null,
    location_text: null,
    verification_status: null,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingGPS, setIsLoadingGPS] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // ── Fetch current profile ────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, role, location_lat, location_lng, location_text, verification_status")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("[Profile] Supabase error:", error);
        throw error;
      }
      if (data) {
        setProfile({
          full_name: data.full_name ?? "",
          phone: data.phone ?? "",
          role: data.role ?? "donor",
          location_lat: data.location_lat ?? null,
          location_lng: data.location_lng ?? null,
          location_text: data.location_text ?? null,
          verification_status: data.verification_status ?? null,
        });
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to load profile.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // ── GPS + Reverse Geocoding ──────────────────────────────────────────────────
  const handleUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("GPS is not supported by your browser.");
      return;
    }
    setIsLoadingGPS(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // Update coords immediately so the user sees them
        setProfile(prev => ({ ...prev, location_lat: latitude, location_lng: longitude }));

        // Reverse geocode in the background
        try {
          const address = await reverseGeocode(latitude, longitude);
          if (address) {
            setProfile(prev => ({ ...prev, location_text: address }));
            toast.success("📍 Location detected!", { description: address });
          } else {
            toast.success("📍 GPS captured!", {
              description: `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (address lookup unavailable)`,
            });
          }
        } catch {
          toast.success("📍 GPS captured!", {
            description: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          });
        } finally {
          setIsLoadingGPS(false);
        }
      },
      (err) => {
        setIsLoadingGPS(false);
        if (err.code === 1) {
          toast.error("Location permission denied. Please allow browser access.");
        } else {
          toast.error("Could not get your location. Try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // ── When lat/lng are typed manually, clear the stale address ────────────────
  const handleLatChange = (val: string) => {
    const v = parseFloat(val);
    setProfile(p => ({ ...p, location_lat: isNaN(v) ? null : v, location_text: null }));
  };
  const handleLngChange = (val: string) => {
    const v = parseFloat(val);
    setProfile(p => ({ ...p, location_lng: isNaN(v) ? null : v, location_text: null }));
  };

  // ── Reverse geocode manually entered coordinates ─────────────────────────────
  const handleLookupAddress = async () => {
    if (!profile.location_lat || !profile.location_lng) {
      toast.error("Enter both latitude and longitude first.");
      return;
    }
    setIsLoadingGPS(true);
    const address = await reverseGeocode(profile.location_lat, profile.location_lng);
    setIsLoadingGPS(false);
    if (address) {
      setProfile(p => ({ ...p, location_text: address }));
      toast.success("Address resolved!", { description: address });
    } else {
      toast.error("Could not resolve address. Check your coordinates.");
    }
  };

  // ── Save Profile ─────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSaving) return;

    setIsSaving(true);
    setSaved(false);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name.trim() || null,
          phone: profile.phone.trim() || null,
          location_lat: profile.location_lat,
          location_lng: profile.location_lng,
          location_text: profile.location_text ?? null,
        })
        .eq("id", user.id);

      if (error) throw error;

      setSaved(true);
      toast.success("Profile updated!", {
        description: profile.location_text
          ? `Location: ${profile.location_text.split(",").slice(0, 2).join(",")}`
          : "Profile saved.",
      });
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const roleLabel: Record<string, string> = {
    donor: "Donor",
    receiver: "Receiver / NGO",
    volunteer: "Volunteer",
    admin: "Administrator",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep your details accurate for reliable dispatch matching and notifications.
        </p>
      </div>

      {/* Role badge */}
      <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-semibold text-primary">
        <User className="w-4 h-4" />
        {roleLabel[profile.role] ?? profile.role}
        {profile.verification_status === "approved" && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-1" />
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ── Personal Info ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Personal Information
            </CardTitle>
            <CardDescription>Your name and contact details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                placeholder="e.g. Priya Sharma"
                value={profile.full_name}
                onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                value={user?.email ?? ""}
                disabled
                className="bg-muted/50 text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">Email is managed via your login credentials.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">
                <Phone className="w-3.5 h-3.5 inline mr-1" />
                Phone Number
              </Label>
              <Input
                id="phone"
                placeholder="e.g. +91 98765 43210"
                value={profile.phone}
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── GPS Location ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Pickup Location (GPS)
            </CardTitle>
            <CardDescription>
              {profile.role === "donor"
                ? "Your location is used for volunteer dispatch routing. We'll convert coordinates to a readable address automatically."
                : "Your location helps volunteers find the closest available tasks."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* ── Location status badge ── */}
            {profile.location_lat && profile.location_lng ? (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Location set</span>
                  {profile.location_text ? (
                    <p className="text-foreground dark:text-zinc-200 text-sm mt-0.5 leading-snug">
                      <MapPin className="w-3.5 h-3.5 inline mr-1 text-primary" />
                      {profile.location_text}
                    </p>
                  ) : (
                    <p className="text-muted-foreground font-mono text-xs mt-0.5">
                      {profile.location_lat.toFixed(5)}, {profile.location_lng.toFixed(5)}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">No location set</span>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Without GPS coordinates, auto-dispatch matching won't work accurately.
                  </p>
                </div>
              </div>
            )}

            {/* ── GPS Button ── */}
            <Button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLoadingGPS}
              className="w-full h-11 gap-2 font-semibold bg-card dark:bg-zinc-800 text-foreground border border-border hover:bg-muted dark:hover:bg-zinc-700 transition-colors"
            >
              {isLoadingGPS ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Detecting &amp; resolving address…</>
              ) : (
                <><Navigation className="w-4 h-4 text-primary" /> Use My Current Location</>
              )}
            </Button>

            {/* ── Manual lat/lng ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lat" className="text-xs text-muted-foreground uppercase tracking-wide">Latitude</Label>
                <Input
                  id="lat"
                  type="number"
                  step="any"
                  placeholder="e.g. 28.6139"
                  value={profile.location_lat ?? ""}
                  onChange={e => handleLatChange(e.target.value)}
                  className="font-mono text-sm bg-card dark:bg-zinc-800 text-foreground dark:text-zinc-100 border-border dark:border-zinc-600 placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lng" className="text-xs text-muted-foreground uppercase tracking-wide">Longitude</Label>
                <Input
                  id="lng"
                  type="number"
                  step="any"
                  placeholder="e.g. 77.2090"
                  value={profile.location_lng ?? ""}
                  onChange={e => handleLngChange(e.target.value)}
                  className="font-mono text-sm bg-card dark:bg-zinc-800 text-foreground dark:text-zinc-100 border-border dark:border-zinc-600 placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* ── Lookup address from manual coords ── */}
            {profile.location_lat && profile.location_lng && !profile.location_text && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLookupAddress}
                disabled={isLoadingGPS}
                className="w-full text-primary hover:text-primary/80 hover:bg-primary/5 font-medium"
              >
                <MapPin className="w-3.5 h-3.5 mr-1.5" />
                Resolve address from these coordinates
              </Button>
            )}

            <p className="text-xs text-muted-foreground">
              Or enter coordinates manually — find them on{" "}
              <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="underline text-primary hover:text-primary/80">
                Google Maps
              </a>{" "}
              (right-click → copy coordinates).
            </p>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          type="submit"
          size="lg"
          disabled={isSaving}
          className={`w-full h-12 font-bold text-base transition-all ${
            saved ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
          }`}
        >
          {isSaving ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving…</>
          ) : saved ? (
            <><CheckCircle2 className="w-4 h-4 mr-2" /> Saved!</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Profile</>
          )}
        </Button>
      </form>
    </div>
  );
}
