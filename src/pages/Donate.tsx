import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "../components/ui/card";
import {
  UploadCloud,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  HeartHandshake,
  Check,
  Sparkles,
  Zap,
  X,
  PartyPopper,
  Eye,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useLoadingStore, useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { FOOD_CATEGORIES, OSM_TILE_URL, OSM_TILE_ATTRIBUTION } from "../lib/constants";
import { compressImage } from "../lib/imageCompression";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { AddressAutocomplete } from "../components/common/AddressAutocomplete";
import { DateTimePicker } from "../components/common/DateTimePicker";
import type { Suggestion } from "../hooks/useAddressAutocomplete";

import {
  suggestListingDetails,
  classifyFoodFromText,
  crossValidateClassification,
  type AISuggestion,
  type AIClassification,
} from "../lib/aiService";
import { toast as sonnerToast } from "sonner";

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Helper component to recenter map when coordinates change
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng && isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)) {
      map.setView([lat, lng], 14, { animate: true });
    }
  }, [lat, lng, map]);
  return null;
}

export default function Donate() {
  const { isLoading, setLoading } = useLoadingStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // ─── Step State ───────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  // Snapshot of form values captured when advancing to Review
  const [reviewData, setReviewData] = useState<{
    title: string;
    quantity: string;
    foodType: string;
    expiry: string;
    pickupStart: string;
    pickupEnd: string;
    address: string;
    imagePreview: string | null;
    mapCenter: [number, number];
  } | null>(null);

  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [foodType, setFoodType] = useState("cooked_meal");
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addressInput, setAddressInput] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([20.5937, 78.9629]);
  const [hasLocation, setHasLocation] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [pickupStart, setPickupStart] = useState("");
  const [pickupEnd, setPickupEnd] = useState("");

  // ─── AI Feature State ─────────────────────────────────────────────────────
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(false);
  const [textClassification, setTextClassification] = useState<AIClassification | null>(null);
  const [isTextClassifying, setIsTextClassifying] = useState(false);
  const [crossValidation, setCrossValidation] = useState<string | null>(null);
  const [isCrossValidating, setIsCrossValidating] = useState(false);
  const userInteractedLocationRef = useRef(false);
  const confirmedLocationRef = useRef<{ address: string; lat: number; lng: number } | null>(null);
  const pendingSubmissionRef = useRef<{
    listingId: string;
    draftKey: string;
    fileName: string | null;
    imageUrl: string | null;
    payload: Record<string, unknown> | null;
    hadInFlightAttempt: boolean;
  } | null>(null);

  // Load donor's profile location first, then try browser geolocation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (user && isValidSupabaseId(user.id)) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("location_lat, location_lng")
          .eq("id", user.id)
          .single();
        if (cancelled || userInteractedLocationRef.current) return;
        if (profile?.location_lat != null && profile?.location_lng != null) {
          setMapCenter([profile.location_lat, profile.location_lng]);
          setHasLocation(true);
          return; // profile location found, skip browser geolocation
        }
      }
      // Fallback: try browser geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled || userInteractedLocationRef.current) return;
            setMapCenter([position.coords.latitude, position.coords.longitude]);
            setHasLocation(true);
          },
          () => { /* geolocation denied */ }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleAddressSelect = (suggestion: Suggestion) => {
    userInteractedLocationRef.current = true;
    const fullAddress = suggestion.secondaryText
      ? `${suggestion.primaryText}, ${suggestion.secondaryText}`
      : suggestion.primaryText;
    confirmedLocationRef.current = {
      address: fullAddress,
      lat: suggestion.lat,
      lng: suggestion.lng,
    };
    setMapCenter([suggestion.lat, suggestion.lng]);
    setHasLocation(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side MIME validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid image format. Only JPEG, PNG, and WebP are accepted.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Client-side raw file limit (15MB max before in-browser downscaling)
    const MAX_INPUT_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_INPUT_SIZE) {
      toast.error("Image too large. Please upload an image under 15MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsClassifying(true);
    let compressedFile: File;
    let base64String: string;

    try {
      // Downscale to max 1600px width/height and compress to 0.8 quality JPEG.
      // This shrinks 3-10MB mobile phone photos down to ~150-400KB, staying safely
      // under Vercel's 4.5MB request-body cap and the 3MB /api/classify limit.
      const result = await compressImage(file, 1600, 0.8);
      if (result.file.size > 3 * 1024 * 1024) {
        toast.error("This photo is still too large after compression. Choose a smaller photo.");
        setIsClassifying(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      compressedFile = result.file;
      base64String = result.dataUrl;

      setClassificationResult(null);
      setSelectedFile(compressedFile);
      setImagePreview(base64String);
    } catch (compressionErr: unknown) {
      console.error("[Donate] Image compression failed:", compressionErr);
      toast.error("Failed to process image. Please try another photo.");
      setIsClassifying(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData.session?.access_token || (import.meta.env.DEV ? (window.localStorage.getItem("test_access_token") || "") : "");
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ imageBase64: base64String }),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.is_food === false) {
          toast.error(data.reason || "Image does not appear to contain edible food.");
          setImagePreview(null);
          setSelectedFile(null);
          setIsClassifying(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        setClassificationResult(data);

        if (data.predicted_category) {
          const valid = FOOD_CATEGORIES.find(
            x => x.value === data.predicted_category
          );
          setFoodType(valid ? valid.value : "cooked_meal");
        }
        if (data.title) setTitle(data.title);
        if (data.quantity_description) setQuantity(data.quantity_description);

        toast.success("AI food extraction complete");
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Classification failed");
      }
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to classify image");
    } finally {
      setIsClassifying(false);
    }
  };

  // ─── AI SUGGEST HANDLER (3s cooldown) ───────────────────────────────────────
  const handleAiSuggest = async () => {
    if (!title.trim() || aiCooldown || isAiSuggesting) return;

    setIsAiSuggesting(true);
    setAiSuggestion(null);

    const result = await suggestListingDetails(title, foodType);

    if (result) {
      setAiSuggestion(result);
    } else {
      sonnerToast.info("AI suggestion unavailable right now", {
        description: "You can still fill in the details manually.",
        duration: 3000,
      });
    }

    setIsAiSuggesting(false);

    // 3-second cooldown
    setAiCooldown(true);
    setTimeout(() => setAiCooldown(false), 3000);
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    if (aiSuggestion.title) setTitle(aiSuggestion.title);
    if (aiSuggestion.quantity) setQuantity(aiSuggestion.quantity);
    if (aiSuggestion.category) {
      const valid = FOOD_CATEGORIES.find((c) => c.value === aiSuggestion.category);
      if (valid) setFoodType(valid.value);
    }
    setAiSuggestion(null);
    sonnerToast.success("AI suggestions applied!");
  };

  // ─── TEXT-BASED CLASSIFICATION (button-click only) ─────────────────────────
  const handleTextClassify = async () => {
    if (!title.trim() || isTextClassifying) return;

    setIsTextClassifying(true);
    setTextClassification(null);

    const result = await classifyFoodFromText(title);

    if (result) {
      setTextClassification(result);
      if (result.category) {
        const valid = FOOD_CATEGORIES.find((c) => c.value === result.category);
        if (valid) setFoodType(valid.value);
      }
    } else {
      sonnerToast.info("AI classification unavailable", { duration: 3000 });
    }

    setIsTextClassifying(false);
  };

  // ─── CROSS-VALIDATE after image classification ────────────────────────────
  useEffect(() => {
    if (!classificationResult || isCrossValidating) return;

    const validate = async () => {
      setIsCrossValidating(true);
      const result = await crossValidateClassification(
        classificationResult.predicted_category || foodType,
        classificationResult.title || title,
        classificationResult.quantity_description || quantity
      );
      if (result) setCrossValidation(result);
      setIsCrossValidating(false);
    };

    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classificationResult]);
  const uploadToStorage = async (file: File) => {
    if (!user || !isValidSupabaseId(user.id)) throw new Error("Must be logged in");

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("food_images")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("food_images").getPublicUrl(fileName);

    return { publicUrl, fileName };
  };

  const validateScheduleWindow = (expiryValue: string, startValue: string, endValue: string): string | null => {
    if (!expiryValue) {
      return "Please set an expiry time for the food.";
    }
    const expiryDate = new Date(expiryValue);
    if (Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() <= Date.now()) {
      return "Expiry time must be in the future.";
    }
    if (!startValue || !endValue) {
      return "Please specify both start and end times for the pickup window.";
    }
    const startD = new Date(startValue);
    const endD = new Date(endValue);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
      return "Please provide valid pickup start and end times.";
    }
    if (endD.getTime() <= startD.getTime()) {
      return "Pickup end time must be after the start time.";
    }
    if (endD.getTime() - startD.getTime() < 15 * 60000) {
      return "Pickup window must be at least 15 minutes long.";
    }
    if (startD.getTime() < Date.now() - 5 * 60000) {
      return "Pickup start time cannot be significantly in the past.";
    }
    if (endD.getTime() <= Date.now()) {
      return "Pickup window has already closed.";
    }
    if (endD.getTime() > expiryDate.getTime()) {
      return "Pickup must end by the expiry time.";
    }
    return null;
  };

  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !isValidSupabaseId(user.id)) {
      toast.error("You must be logged in to donate.");
      return;
    }

    if (!selectedFile) {
      toast.error("Please upload a food photo first.");
      return;
    }

    const form = e.currentTarget as HTMLFormElement;
    const address = addressInput.trim();
    const expiryStr = (form.elements.namedItem("expiry") as HTMLInputElement).value;
    const pickupStart = (form.elements.namedItem("pickupStart") as HTMLInputElement).value;
    const pickupEnd = (form.elements.namedItem("pickupEnd") as HTMLInputElement).value;

    if (!title.trim() || title.trim().length < 3) {
      toast.error("Please provide a descriptive title (at least 3 characters).");
      return;
    }
    if (!quantity.trim()) {
      toast.error("Please specify the quantity of food.");
      return;
    }
    if (!address || address.length < 4) {
      toast.error("Please provide a valid pickup address or pincode.");
      return;
    }

    if (!hasLocation || !confirmedLocationRef.current || confirmedLocationRef.current.address.trim() !== address) {
      toast.error("Please select a pickup address from the suggestions.");
      return;
    }

    const scheduleError = validateScheduleWindow(expiryStr, pickupStart, pickupEnd);
    if (scheduleError) {
      toast.error(scheduleError);
      return;
    }

    const confirmedCoords: [number, number] = [
      confirmedLocationRef.current.lat,
      confirmedLocationRef.current.lng,
    ];

    setReviewData({ title, quantity, foodType, expiry: expiryStr, pickupStart, pickupEnd, address, imagePreview, mapCenter: confirmedCoords });
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleConfirmPublish = async () => {
    if (!reviewData || !selectedFile || !user || !isValidSupabaseId(user.id)) return;

    const draftKey = JSON.stringify({
      title: reviewData.title,
      quantity: reviewData.quantity,
      foodType: reviewData.foodType,
      expiry: reviewData.expiry,
      pickupStart: reviewData.pickupStart,
      pickupEnd: reviewData.pickupEnd,
      address: reviewData.address,
      lat: reviewData.mapCenter[0],
      lng: reviewData.mapCenter[1],
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileLastModified: selectedFile.lastModified,
    });

    setLoading(true);
    try {
      // 1. Reconcile any pending submission BEFORE discarding its ID or rejecting as expired.
      const existingPending = pendingSubmissionRef.current;
      if (existingPending) {
        const { data: existingRow, error: lookupError } = await supabase
          .from("food_listings")
          .select("id, image_url, status")
          .eq("id", existingPending.listingId)
          .maybeSingle();

        if (lookupError) {
          toast.error("Could not verify whether your previous submission was saved. Please retry.");
          return;
        }

        if (existingRow) {
          if (
            existingRow.image_url &&
            existingPending.imageUrl &&
            existingRow.image_url !== existingPending.imageUrl &&
            existingPending.fileName
          ) {
            const { error: rmErr } = await supabase.storage.from("food_images").remove([existingPending.fileName]);
            if (rmErr) console.warn("Failed to remove unused upload:", rmErr);
          }
          pendingSubmissionRef.current = null;

          if (existingPending.draftKey === draftKey) {
            setCurrentStep(3);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }

          toast.error(`Your previous donation was already published (status: ${existingRow.status || "active"}). Use 'Donate More' to submit a new listing.`);
          return;
        }

        // Lookup returned no row; if the donor edited the draft:
        if (existingPending.draftKey !== draftKey) {
          if (!existingPending.hadInFlightAttempt) {
            if (existingPending.fileName) {
              const { error: rmErr } = await supabase.storage.from("food_images").remove([existingPending.fileName]);
              if (rmErr) console.warn("Failed to remove superseded upload:", rmErr);
            }
            pendingSubmissionRef.current = null;
          } else if (existingPending.payload) {
            // Validate the original submission's pickup window before resending it.
            const origScheduleError = validateScheduleWindow(
              String(existingPending.payload.expiry_time ?? ""),
              String(existingPending.payload.pickup_window_start ?? ""),
              String(existingPending.payload.pickup_window_end ?? "")
            );
            if (origScheduleError) {
              toast.error(`Cannot resend previous donation: ${origScheduleError}`);
              return;
            }
            // An earlier insert may still be in flight: retry the ORIGINAL listingId and payload
            // rather than generating a second listing ID and risking two published donations.
            const { error: retryErr } = await supabase.from("food_listings").insert(existingPending.payload);
            if (!retryErr) {
              pendingSubmissionRef.current = null;
              toast.error("Your previous donation was already published before your edits. Use 'Donate More' to submit a new listing.");
              return;
            }
            if (retryErr.code === "23505") {
              const { data: confirmedRow, error: confirmErr } = await supabase
                .from("food_listings")
                .select("id, image_url")
                .eq("id", existingPending.listingId)
                .maybeSingle();

              if (confirmErr || !confirmedRow) {
                toast.error("Could not confirm your previous listing status. Please retry.");
                return;
              }
              if (
                confirmedRow.image_url &&
                existingPending.imageUrl &&
                confirmedRow.image_url !== existingPending.imageUrl &&
                existingPending.fileName
              ) {
                const { error: rmErr } = await supabase.storage.from("food_images").remove([existingPending.fileName]);
                if (rmErr) console.warn("Failed to remove redundant upload:", rmErr);
              }
              pendingSubmissionRef.current = null;
              toast.error("Your previous donation was already published before your edits. Use 'Donate More' to submit a new listing.");
              return;
            }
            throw retryErr;
          } else {
            toast.error("Your previous submission outcome is still unresolved. Please retry.");
            return;
          }
        }
      }

      // 2. Validate schedule window before uploading/inserting.
      const scheduleError = validateScheduleWindow(reviewData.expiry, reviewData.pickupStart, reviewData.pickupEnd);
      if (scheduleError) {
        toast.error(scheduleError);
        return;
      }

      // 3. Reuse retained listingId and uploaded path on retry, or upload once for this draft.
      let pending = pendingSubmissionRef.current;
      if (!pending) {
        pending = {
          listingId: crypto.randomUUID(),
          draftKey,
          fileName: null,
          imageUrl: null,
          payload: null,
          hadInFlightAttempt: false,
        };
        pendingSubmissionRef.current = pending;
      }

      if (!pending.fileName || !pending.imageUrl) {
        const uploaded = await uploadToStorage(selectedFile);
        pending.fileName = uploaded.fileName;
        pending.imageUrl = uploaded.publicUrl;
      }

      const { listingId, fileName, imageUrl } = pending;
      const startD = new Date(reviewData.pickupStart);
      const endD = new Date(reviewData.pickupEnd);
      const insertPayload = {
        id: listingId,
        donor_id: user.id,
        title: reviewData.title || `${reviewData.quantity} of ${reviewData.foodType} food`,
        food_category: reviewData.foodType,
        quantity_description: reviewData.quantity,
        image_url: imageUrl,
        expiry_time: new Date(reviewData.expiry).toISOString(),
        pickup_window_start: startD.toISOString(),
        pickup_window_end: endD.toISOString(),
        pickup_window: `${startD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        location_name: reviewData.address,
        pickup_lat: reviewData.mapCenter[0],
        pickup_lng: reviewData.mapCenter[1],
        status: "active",
        estimated_safe_hours: classificationResult?.estimated_safe_hours ?? null,
        spoilage_risk: classificationResult?.spoilage_risk || null,
        ai_confidence_score: classificationResult?.confidence_score ?? null,
        priority_score: classificationResult?.priority_score ?? null,
        detected_items: classificationResult?.detected_items || null,
        freshness_score: classificationResult?.freshness_score ?? null,
        quality_status: classificationResult?.quality_status || null,
      };
      pending.payload = insertPayload;
      const hadPriorInFlight = pending.hadInFlightAttempt;
      pending.hadInFlightAttempt = true;

      const { error } = await supabase.from("food_listings").insert(insertPayload);

      if (error) {
        if (error.code === "23505") {
          const { data: confirmedRow, error: confirmErr } = await supabase
            .from("food_listings")
            .select("id, image_url")
            .eq("id", listingId)
            .maybeSingle();

          if (confirmErr || !confirmedRow) {
            toast.error("Could not confirm listing status. Please retry.");
            return;
          }

          if (confirmedRow.image_url && confirmedRow.image_url !== imageUrl && fileName) {
            const { error: rmErr } = await supabase.storage.from("food_images").remove([fileName]);
            if (rmErr) console.warn("Failed to remove redundant upload:", rmErr);
          }

          pendingSubmissionRef.current = null;
          setCurrentStep(3);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        // Delete the photo only when every attempt that could reference it is known to have failed.
        const isConfirmedDbRejection = typeof error.code === "string" && error.code.length > 0;
        if (isConfirmedDbRejection && !hadPriorInFlight && fileName) {
          const { error: removeError } = await supabase.storage.from("food_images").remove([fileName]);
          if (removeError) {
            console.warn("Failed to clean up listing photo after insert rejection:", removeError);
          } else {
            pending.fileName = null;
            pending.imageUrl = null;
            pending.hadInFlightAttempt = false;
          }
        }
        throw error;
      }

      pendingSubmissionRef.current = null;
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to create listing");
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setCurrentStep(1);
    setReviewData(null);
    setImagePreview(null);
    setClassificationResult(null);
    setFoodType("cooked_meal");
    setTitle("");
    setQuantity("");
    setSelectedFile(null);
    setAddressInput("");
    setHasLocation(false);
    userInteractedLocationRef.current = false;
    confirmedLocationRef.current = null;
    if (!pendingSubmissionRef.current?.hadInFlightAttempt) {
      pendingSubmissionRef.current = null;
    }
    setExpiry("");
    setPickupStart("");
    setPickupEnd("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/20 p-3 rounded-full hidden sm:block">
            <HeartHandshake className="h-8 w-8 text-success" />
          </div>
          <div>
            <h2 data-testid="donate-heading" className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Donate Surplus Food
            </h2>
            <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-xl">
              List your available food to help those in need. Your generosity can make a big difference.
            </p>
          </div>
        </div>

        {/* Safe & Verified Trust Badge */}
        <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl max-w-sm">
          <ShieldCheck className="h-6 w-6 text-success shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">Safe & Verified</h4>
            <p className="text-xs text-muted-foreground mt-0.5">All donations are verified for safety and quality before delivery.</p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-6 bg-card border border-border rounded-xl p-3 sm:px-6 flex items-center justify-between overflow-x-auto gap-4 shadow-sm">
        <div className="flex items-center gap-3 shrink-0">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${currentStep > 1 ? 'bg-emerald-500/20 text-success border-2 border-emerald-500' :
            currentStep === 1 ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-emerald-500/20' :
              'bg-muted border border-border text-muted-foreground'
            }`}>{currentStep > 1 ? <Check className="h-4 w-4" /> : '1'}</div>
          <div>
            <p className={`text-sm font-semibold ${currentStep === 1 ? 'text-foreground' : 'text-muted-foreground'}`}>Food Details</p>
            <p className="text-[11px] text-muted-foreground">Add details about the food</p>
          </div>
        </div>
        <div className={`h-px flex-grow mx-4 hidden sm:block transition-colors ${currentStep >= 2 ? 'bg-emerald-500/50' : 'bg-border'}`}></div>
        <div className={`flex items-center gap-3 shrink-0 transition-opacity ${currentStep >= 2 ? 'opacity-100' : 'opacity-50'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${currentStep > 2 ? 'bg-emerald-500/20 text-success border-2 border-emerald-500' :
            currentStep === 2 ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-emerald-500/20' :
              'bg-muted border border-border text-muted-foreground'
            }`}>{currentStep > 2 ? <Check className="h-4 w-4" /> : '2'}</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Review</p>
            <p className="text-[11px] text-muted-foreground">Review your information</p>
          </div>
        </div>
        <div className={`h-px flex-grow mx-4 hidden sm:block transition-colors ${currentStep >= 3 ? 'bg-emerald-500/50' : 'bg-border'}`}></div>
        <div className={`flex items-center gap-3 shrink-0 transition-opacity ${currentStep >= 3 ? 'opacity-100' : 'opacity-50'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${currentStep === 3 ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-emerald-500/20' :
            'bg-muted border border-border text-muted-foreground'
            }`}>3</div>
          <div>
            <p className={`text-sm font-semibold ${currentStep === 3 ? 'text-foreground' : 'text-muted-foreground'}`}>Submit</p>
            <p className="text-[11px] text-muted-foreground">Publish your listing</p>
          </div>
        </div>
      </div>

      <Card className="border-border shadow-lg bg-card/50 backdrop-blur-sm overflow-hidden">
        <form onSubmit={handleNextStep}>
          {/* ── STEP 1: Food Details ── */}
          {currentStep === 1 && (
            <CardContent className="p-0">
              <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.5fr] divide-y lg:divide-y-0 lg:divide-x divide-border">

                {/* Left Column: Photo Upload & AI Analysis */}
                <div className="p-5 sm:p-6 flex flex-col space-y-5 bg-muted/10 h-full">
                  <div>
                    <label className="block text-lg font-semibold text-foreground mb-3">
                      1. Food Photo <span className="text-destructive">*</span>
                    </label>

                    {!imagePreview ? (
                      <label
                        htmlFor="file-upload"
                        className="flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed border-border rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer group bg-background/50"
                      >
                        <UploadCloud className="h-12 w-12 text-muted-foreground group-hover:text-emerald-500 transition-colors mb-4" />
                        <p className="text-sm font-medium text-foreground mb-1">Drag & drop or click to upload</p>
                        <p className="text-xs text-muted-foreground mb-4">PNG, JPG, GIF up to 10MB</p>
                        <div className="px-4 py-2 rounded-lg bg-background border border-border text-sm font-medium hover:bg-muted transition-colors shadow-sm">
                          Choose File
                        </div>

                        <div className="mt-4 text-xs text-success flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                          <AlertCircle className="h-3.5 w-3.5" />
                          AI will automatically classify the food
                        </div>

                        <input
                          ref={fileInputRef}
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          accept="image/*"
                          onChange={handleImageUpload}
                        />
                      </label>
                    ) : (
                      <div className="space-y-4">
                        <div className="relative h-56 rounded-xl overflow-hidden border border-border group shadow-inner bg-black/20">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setImagePreview(null);
                              setClassificationResult(null);
                              setTitle("");
                              setQuantity("");
                              setSelectedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="absolute top-3 right-3 bg-background/90 text-foreground backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-background shadow-sm border border-border transition-colors z-10"
                          >
                            Change Image
                          </button>
                        </div>

                        <div className="min-h-[140px]">
                          {isClassifying ? (
                            <div className="flex flex-col items-center justify-center text-sm text-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10 p-6 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                              <Loader2 className="animate-spin h-6 w-6 mb-3" />
                              <p className="font-medium">AI is analyzing your image...</p>
                              <p className="text-xs opacity-70 mt-1">Detecting category, shelf life, and safety.</p>
                            </div>
                          ) : classificationResult ? (
                            <div className="flex flex-col text-sm bg-background p-5 rounded-xl border border-border shadow-sm space-y-4">
                              <div className="flex items-start">
                                <CheckCircle2 className="h-5 w-5 mr-3 flex-shrink-0 text-success mt-0.5" />
                                <div>
                                  <p className="font-semibold text-foreground">AI Vision Extraction Complete</p>
                                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                                    Detected: <span className="font-medium text-foreground">{classificationResult.detected_items?.join(", ") || classificationResult.title}</span><br />
                                    {classificationResult.notes && <span className="italic text-muted-foreground mt-1 block">"{classificationResult.notes}"</span>}
                                  </p>
                                </div>
                              </div>

                              {/* Low confidence warning */}
                              {classificationResult.confidence_score && classificationResult.confidence_score < 60 && (
                                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
                                  <AlertTriangle className="h-4 w-4 shrink-0" />
                                  <span className="text-xs font-medium">Low AI confidence ({classificationResult.confidence_score}%). Please double-check suggestions before submitting.</span>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-3 border-t border-primary/10">
                                <div className="bg-background rounded p-2 text-center shadow-sm">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Priority</p>
                                  <p className={`font-bold ${(classificationResult.priority_score ?? 0) >= 80 ? 'text-destructive' :
                                    (classificationResult.priority_score ?? 0) >= 50 ? 'text-warning' : 'text-info'
                                    }`}>{classificationResult.priority_score != null ? `${classificationResult.priority_score}/100` : 'N/A'}</p>
                                </div>
                                <div className="bg-background rounded p-2 text-center shadow-sm">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Freshness</p>
                                  <p className="font-bold text-success">{classificationResult.freshness_score != null ? `${classificationResult.freshness_score}/100` : 'N/A'}</p>
                                </div>
                                <div className="bg-background rounded p-2 text-center shadow-sm">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Quality</p>
                                  <p className={`font-bold capitalize ${classificationResult.quality_status === 'excellent' ? 'text-success' :
                                    classificationResult.quality_status === 'good' ? 'text-info' :
                                      classificationResult.quality_status === 'usable' ? 'text-warning' :
                                        classificationResult.quality_status === 'risky' ? 'text-destructive' : 'text-gray-600'
                                    }`}>{classificationResult.quality_status || 'N/A'}</p>
                                </div>
                                <div className="bg-background rounded p-2 text-center shadow-sm">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Confidence</p>
                                  <p className="font-bold text-violet">{classificationResult.confidence_score != null ? `${classificationResult.confidence_score}%` : 'N/A'}</p>
                                </div>
                              </div>

                              {/* Shelf life + spoilage row */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-background rounded p-2 text-center shadow-sm">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Shelf Life</p>
                                  <p className="font-bold text-foreground flex items-center justify-center gap-1">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    {classificationResult.estimated_safe_hours != null ? `~${classificationResult.estimated_safe_hours}h` : 'N/A'}
                                  </p>
                                </div>
                                <div className="bg-background rounded p-2 text-center shadow-sm">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Spoilage Risk</p>
                                  <p className={`font-bold capitalize ${classificationResult.spoilage_risk === 'critical' ? 'text-destructive' :
                                    classificationResult.spoilage_risk === 'high' ? 'text-destructive' :
                                      classificationResult.spoilage_risk === 'medium' ? 'text-warning' : 'text-success'
                                    }`}>{classificationResult.spoilage_risk || 'N/A'}</p>
                                </div>
                              </div>

                              {/* Food safety advisory disclaimer */}
                              <p className="text-[10px] text-muted-foreground/80 text-center italic mt-1">
                                * Advisory AI estimate only. Not an official food safety inspection or certification.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tips Card */}
                  <div className="bg-background border border-border rounded-xl p-5 mt-auto shadow-sm">
                    <h4 className="flex items-center gap-2 font-semibold text-sm mb-4">
                      <AlertCircle className="h-4 w-4 text-warning" /> Tips for a great photo
                    </h4>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> Use natural lighting</li>
                      <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> Show the quantity clearly</li>
                      <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> Avoid blurred images</li>
                      <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> No people in the photo</li>
                    </ul>
                  </div>

                  {/* Prioritize Safety */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mt-4 flex gap-3 shadow-sm">
                    <ShieldCheck className="h-5 w-5 text-success shrink-0" />
                    <div>
                      <h5 className="text-sm font-semibold text-foreground">We prioritize food safety</h5>
                      <p className="text-xs text-muted-foreground mt-1">Only fresh and safe food reaches those in need.</p>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Details & Logistics */}
                <div className="p-5 sm:p-6 lg:p-8 flex flex-col h-full">
                  <div>
                    <label className="block text-lg font-semibold text-foreground mb-4">
                      2. Details & Logistics
                    </label>

                    <div className="space-y-5">
                      {/* Title */}
                      <div>
                        <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1.5">
                          Post Title <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="title"
                          name="title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g., Paneer Sabji with Roti"
                          className="bg-muted/30 focus-visible:ring-emerald-500/50"
                          required
                        />
                        {/* AI Suggest Button */}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={handleAiSuggest}
                            disabled={!title.trim() || aiCooldown || isAiSuggesting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/10 border border-purple-500/25 text-violet hover:bg-purple-500/20 hover:text-purple-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            {isAiSuggesting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            {isAiSuggesting ? "Thinking..." : aiCooldown ? "Wait..." : "AI Suggest"}
                          </button>
                          {!imagePreview && !isClassifying && (
                            <button
                              type="button"
                              onClick={handleTextClassify}
                              disabled={!title.trim() || isTextClassifying}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 border border-blue-500/25 text-info hover:bg-blue-500/20 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                              {isTextClassifying ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Zap className="w-3 h-3" />
                              )}
                              {isTextClassifying ? "Classifying..." : "Classify from Text"}
                            </button>
                          )}
                        </div>

                        {/* AI Suggestion Card */}
                        {aiSuggestion && (
                          <div className="mt-3 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-violet flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3" /> AI Suggestions
                              </span>
                              <button
                                type="button"
                                onClick={() => setAiSuggestion(null)}
                                className="p-1 hover:bg-purple-500/10 rounded text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div><span className="text-muted-foreground">Title:</span> <span className="text-foreground font-medium">{aiSuggestion.title}</span></div>
                              <div><span className="text-muted-foreground">Qty:</span> <span className="text-foreground font-medium">{aiSuggestion.quantity}</span></div>
                              <div><span className="text-muted-foreground">Safe for:</span> <span className="text-foreground font-medium">~{aiSuggestion.expiryHours}h</span></div>
                              <div><span className="text-muted-foreground">Category:</span> <span className="text-foreground font-medium">{aiSuggestion.category}</span></div>
                            </div>
                            {aiSuggestion.allergens?.length > 0 && (
                              <div className="text-xs text-warning flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Allergens: {aiSuggestion.allergens.join(", ")}
                              </div>
                            )}
                            {aiSuggestion.safetyNotes && (
                              <p className="text-xs text-muted-foreground italic">{aiSuggestion.safetyNotes}</p>
                            )}
                            <button
                              type="button"
                              onClick={applyAiSuggestion}
                              className="w-full mt-1 py-1.5 text-xs font-medium rounded-lg bg-purple-500/15 border border-purple-500/30 text-violet hover:bg-purple-500/25 transition-colors"
                            >
                              Apply Suggestions
                            </button>
                          </div>
                        )}

                        {/* Text Classification Result */}
                        {textClassification && (
                          <div className="mt-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs space-y-1 animate-fade-in">
                            <div className="flex items-center gap-1.5 text-info font-semibold">
                              <Zap className="w-3 h-3" /> AI Text Classification
                            </div>
                            <p className="text-foreground">Category: <span className="font-medium">{textClassification.category}</span> ({textClassification.confidence}% confidence)</p>
                            {textClassification.allergens?.length > 0 && (
                              <p className="text-warning"><AlertTriangle className="w-3 h-3 inline mr-1" />Allergens: {textClassification.allergens.join(", ")}</p>
                            )}
                            {textClassification.notes && <p className="text-muted-foreground">{textClassification.notes}</p>}
                          </div>
                        )}

                        {/* Cross-validation note (after image classification) */}
                        {crossValidation && classificationResult && (
                          <div className="mt-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-xs text-success flex items-start gap-1.5 animate-fade-in">
                            <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{crossValidation}</span>
                          </div>
                        )}
                      </div>

                      {/* Category & Quantity */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="foodType" className="block text-sm font-medium text-foreground mb-1.5">
                            Food Category <span className="text-destructive">*</span>
                          </label>
                          <select
                            id="foodType"
                            name="foodType"
                            value={foodType}
                            onChange={(e) => setFoodType(e.target.value)}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {FOOD_CATEGORIES.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="quantity" className="block text-sm font-medium text-foreground mb-1.5">
                            Quantity Estimation <span className="text-destructive">*</span>
                          </label>
                          <div className="relative">
                            <Input
                              id="quantity"
                              name="quantity"
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              placeholder="e.g., 50 servings or 10 kg"
                              className="bg-muted/30 focus-visible:ring-emerald-500/50"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* Expiry */}
                      <div>
                        <label htmlFor="expiry" className="block text-sm font-medium text-foreground mb-1.5">
                          Expiry / Best Before <span className="text-destructive">*</span>
                        </label>
                        <DateTimePicker
                          id="expiry"
                          name="expiry"
                          value={expiry}
                          onChange={(iso) => setExpiry(iso)}
                          placeholder="Pick expiry date & time"
                          minDate={new Date()}
                          required
                        />
                      </div>

                      {/* Structured Pickup Window */}
                      <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-5 relative overflow-hidden shadow-sm">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Available Pickup Window <span className="text-destructive">*</span>
                        </label>
                        <p className="text-xs text-muted-foreground mb-4">Choose a time window when the food can be picked up.</p>

                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <div className="w-full">
                            <label htmlFor="pickupStart" className="block text-xs font-medium text-muted-foreground mb-1">Pickup Start</label>
                            <DateTimePicker
                              id="pickupStart"
                              name="pickupStart"
                              value={pickupStart}
                              onChange={(iso) => setPickupStart(iso)}
                              placeholder="Start time"
                              minDate={new Date()}
                              required
                            />
                          </div>

                          <ArrowRight className="h-5 w-5 text-success hidden sm:block shrink-0 mt-5" />
                          <div className="sm:hidden text-muted-foreground text-xs my-1 w-full text-center">to</div>

                          <div className="w-full">
                            <label htmlFor="pickupEnd" className="block text-xs font-medium text-muted-foreground mb-1">Pickup End</label>
                            <DateTimePicker
                              id="pickupEnd"
                              name="pickupEnd"
                              value={pickupEnd}
                              onChange={(iso) => setPickupEnd(iso)}
                              placeholder="End time"
                              minDate={new Date()}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="address" className="block text-sm font-medium text-foreground mb-1.5">
                          Pickup Address (Type Pincode or City) <span className="text-destructive">*</span>
                        </label>
                        <div className="mb-3">
                          <AddressAutocomplete
                            id="address"
                            name="address"
                            value={addressInput}
                            onChange={(val) => {
                              userInteractedLocationRef.current = true;
                              setAddressInput(val);
                              if (val !== addressInput) {
                                confirmedLocationRef.current = null;
                                setHasLocation(false);
                                setMapCenter([20.5937, 78.9629]);
                              }
                            }}
                            onSelect={handleAddressSelect}
                            className="bg-muted/30 focus-visible:ring-emerald-500/50"
                            required
                          />
                        </div>

                        <div className="h-[260px] bg-muted/30 rounded-xl border border-border overflow-hidden relative z-0 shadow-inner">
                          <MapContainer center={mapCenter} zoom={4} style={{ height: "100%", width: "100%" }}>
                            <TileLayer
                              url={OSM_TILE_URL}
                              attribution={OSM_TILE_ATTRIBUTION}
                              maxZoom={19}
                            />
                            {hasLocation && <Marker position={mapCenter} />}
                            {hasLocation && <RecenterMap lat={mapCenter[0]} lng={mapCenter[1]} />}
                          </MapContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          )} {/* end step 1 */}

          {/* ── STEP 2: Review ── */}
          {currentStep === 2 && reviewData && (
            <CardContent className="p-6 lg:p-10">
              <div className="max-w-3xl mx-auto space-y-8">
                <div className="flex items-center gap-3">
                  <Eye className="h-6 w-6 text-success" />
                  <h3 className="text-xl font-bold text-foreground">Review Your Donation</h3>
                </div>
                <p className="text-sm text-muted-foreground -mt-4">Please confirm the details below before publishing your listing.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Food Photo */}
                  {reviewData.imagePreview && (
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Food Photo</p>
                      <img src={reviewData.imagePreview} alt="Food" className="w-full max-h-56 object-cover rounded-xl border border-border shadow-sm" />
                    </div>
                  )}

                  {/* Title */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Post Title</p>
                    <p className="text-sm font-medium text-foreground">{reviewData.title}</p>
                  </div>

                  {/* Category */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Category</p>
                    <p className="text-sm font-medium text-foreground capitalize">
                      {FOOD_CATEGORIES.find(c => c.value === reviewData.foodType)?.label || reviewData.foodType}
                    </p>
                  </div>

                  {/* Quantity */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Quantity</p>
                    <p className="text-sm font-medium text-foreground">{reviewData.quantity}</p>
                  </div>

                  {/* Expiry */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Expiry / Best Before</p>
                    <p className="text-sm font-medium text-foreground">{new Date(reviewData.expiry).toLocaleString('en-IN')}</p>
                  </div>

                  {/* Pickup Window */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-success mb-2">Pickup Window</p>
                    <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-foreground">
                      <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-muted-foreground" />{new Date(reviewData.pickupStart).toLocaleString('en-IN')}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-muted-foreground" />{new Date(reviewData.pickupEnd).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Pickup Address</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-2"><MapPin className="h-4 w-4 text-success" />{reviewData.address}</p>
                  </div>

                  {/* AI Scores (if available) */}
                  {classificationResult && (
                    <div className="bg-muted/30 rounded-xl p-4 border border-border md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">AI Quality Analysis</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="text-center"><p className="text-xs text-muted-foreground">Priority</p><p className="font-bold text-sm text-foreground">{classificationResult.priority_score ?? 'N/A'}/100</p></div>
                        <div className="text-center"><p className="text-xs text-muted-foreground">Freshness</p><p className="font-bold text-sm text-success">{classificationResult.freshness_score ?? 'N/A'}/100</p></div>
                        <div className="text-center"><p className="text-xs text-muted-foreground">Quality</p><p className="font-bold text-sm text-foreground capitalize">{classificationResult.quality_status ?? 'N/A'}</p></div>
                        <div className="text-center"><p className="text-xs text-muted-foreground">Shelf Life</p><p className="font-bold text-sm text-foreground">{classificationResult.estimated_safe_hours != null ? `~${classificationResult.estimated_safe_hours}h` : 'N/A'}</p></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                  <p className="text-sm text-muted-foreground">Please double-check all details. Once published, recipients can immediately see and request this listing.</p>
                </div>
              </div>
            </CardContent>
          )}

          {/* ── STEP 3: Success ── */}
          {currentStep === 3 && (
            <CardContent className="p-10 flex flex-col items-center justify-center text-center min-h-[480px] space-y-6">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl animate-pulse" />
                <div className="relative bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full p-8">
                  <PartyPopper className="h-16 w-16 text-success" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground mb-2">Listing Published! 🎉</h3>
                <p className="text-muted-foreground max-w-sm">Your food donation is now live. Nearby recipients will be notified and can request a pickup right away.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button type="button" variant="outline" className="flex-1" onClick={handleStartOver}>
                  Donate More
                </Button>
                <Button type="button" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => navigate('/dashboard')}>
                  View Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          )}

          {/* Bottom Action Bar — hidden on success step */}
          {currentStep !== 3 && (
            <CardFooter className="bg-muted/20 flex flex-col-reverse sm:flex-row justify-between items-center py-4 px-6 lg:px-8 border-t border-border gap-3 sm:gap-4 sticky bottom-0 z-10 backdrop-blur-md">
              <div className="flex gap-2 w-full sm:w-auto">
                {currentStep === 2 ? (
                  <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => { setCurrentStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Edit
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" className="w-full sm:w-auto text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                )}
              </div>
              <div className="w-full sm:w-auto">
                {currentStep === 1 ? (
                  <Button type="submit" size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-md shadow-emerald-900/20" disabled={isLoading || !selectedFile}>
                    Next: Review <Eye className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" size="lg" onClick={handleConfirmPublish} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-md shadow-emerald-900/20" disabled={isLoading}>
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing...</>
                    ) : (
                      <><Send className="mr-2 h-4 w-4" />Confirm & Publish</>
                    )}
                  </Button>
                )}
              </div>
            </CardFooter>
          )}
        </form>
      </Card>
    </div>
  );
}
