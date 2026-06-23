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
  HeartHandshake,
  Check,
  Sparkles,
  Zap,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLoadingStore, useAuthStore } from "../store";
import { supabase, isValidSupabaseId } from "../lib/supabase";
import { FOOD_CATEGORIES } from "../lib/constants";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { AddressAutocomplete } from "../components/common/AddressAutocomplete";
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
  map.setView([lat, lng], 13);
  return null;
}

export default function Donate() {
  const { isLoading, setLoading } = useLoadingStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [foodType, setFoodType] = useState("cooked_meal");
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addressInput, setAddressInput] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const [hasLocation, setHasLocation] = useState(false);

  // ─── AI Feature State ─────────────────────────────────────────────────────
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(false);
  const [textClassification, setTextClassification] = useState<AIClassification | null>(null);
  const [isTextClassifying, setIsTextClassifying] = useState(false);
  const [crossValidation, setCrossValidation] = useState<string | null>(null);
  const [isCrossValidating, setIsCrossValidating] = useState(false);

  // Load donor's profile location first, then try browser geolocation
  useEffect(() => {
    (async () => {
      if (user && isValidSupabaseId(user.id)) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("location_lat, location_lng")
          .eq("id", user.id)
          .single();
        if (profile?.location_lat && profile?.location_lng) {
          setMapCenter([profile.location_lat, profile.location_lng]);
          setHasLocation(true);
          return; // profile location found, skip browser geolocation
        }
      }
      // Fallback: try browser geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setMapCenter([position.coords.latitude, position.coords.longitude]);
            setHasLocation(true);
          },
          () => { /* geolocation denied */ }
        );
      }
    })();
  }, [user]);

  const handleAddressSelect = (suggestion: Suggestion) => {
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

    // Client-side size validation (5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("Image too large. Please upload an image under 5MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setImagePreview(base64String);

      setIsClassifying(true);
      try {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

    reader.readAsDataURL(file);
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

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !isValidSupabaseId(user.id)) {
      toast.error("You must be logged in to donate.");
      return;
    }

    if (!selectedFile) {
      toast.error("Please upload a food photo first.");
      return;
    }

    if (!hasLocation) {
      toast.error("Pickup location is required. Please allow location access or type an address.");
      return;
    }

    const form = e.currentTarget as HTMLFormElement;
    const address = addressInput.trim();
    const expiryStr = (form.elements.namedItem("expiry") as HTMLInputElement).value;
    const pickupStart = (form.elements.namedItem("pickupStart") as HTMLInputElement).value;
    const pickupEnd = (form.elements.namedItem("pickupEnd") as HTMLInputElement).value;

    // Form Validations
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

    if (!expiryStr) {
      toast.error("Please set an expiry time for the food.");
      return;
    }

    const expiryDate = new Date(expiryStr);
    if (expiryDate.getTime() <= Date.now()) {
      toast.error("Expiry time must be in the future.");
      return;
    }

    if (!pickupStart || !pickupEnd) {
      toast.error("Please specify both start and end times for the pickup window.");
      return;
    }

    const startD = new Date(pickupStart);
    const endD = new Date(pickupEnd);
    
    if (endD.getTime() <= startD.getTime()) {
      toast.error("Pickup end time must be after the start time.");
      return;
    }
    
    if (endD.getTime() - startD.getTime() < 15 * 60000) {
      toast.error("Pickup window must be at least 15 minutes long.");
      return;
    }
    
    if (startD.getTime() < Date.now() - 5 * 60000) {
      toast.error("Pickup start time cannot be significantly in the past.");
      return;
    }

    setLoading(true);

    try {
      const imageUrl = await uploadToStorage(selectedFile);

      const { error } = await supabase.from("food_listings").insert({
        donor_id: user.id,
        title: title || `${quantity} of ${foodType} food`,
        food_category: foodType,
        quantity_description: quantity,
        image_url: imageUrl,
        expiry_time: new Date(expiryStr).toISOString(),
        pickup_window_start: startD.toISOString(),
        pickup_window_end: endD.toISOString(),
        pickup_window: `${startD.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${endD.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
        location_name: address,
        pickup_lat:  mapCenter[0],
        pickup_lng:  mapCenter[1],
        status: "active",
        estimated_safe_hours: classificationResult?.estimated_safe_hours || null,
        spoilage_risk: classificationResult?.spoilage_risk || null,
        ai_confidence_score: classificationResult?.confidence_score || null,
        priority_score: classificationResult?.priority_score || null,
        detected_items: classificationResult?.detected_items || null,
        freshness_score: classificationResult?.freshness_score || null,
        quality_status: classificationResult?.quality_status || null,
      });

      if (error) throw error;

      toast.success("✅ Food listing created with smart recognition!");

      setImagePreview(null);
      setClassificationResult(null);
      setFoodType("cooked_meal");
      setTitle("");
      setQuantity("");
      setSelectedFile(null);
      setAddressInput("");
      setHasLocation(false);
      form.reset();

      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to create listing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/20 p-3 rounded-full hidden sm:block">
            <HeartHandshake className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Donate Surplus Food
            </h2>
            <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-xl">
              List your available food to help those in need. Your generosity can make a big difference.
            </p>
          </div>
        </div>

        {/* Safe & Verified Trust Badge */}
        <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl max-w-sm">
          <ShieldCheck className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">Safe & Verified</h4>
            <p className="text-xs text-muted-foreground mt-0.5">All donations are verified for safety and quality before delivery.</p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-6 bg-card border border-border rounded-xl p-3 sm:px-6 flex items-center justify-between overflow-x-auto gap-4 shadow-sm">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-500/20">1</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Food Details</p>
            <p className="text-[11px] text-muted-foreground">Add details about the food</p>
          </div>
        </div>
        <div className="h-px bg-border flex-grow mx-4 hidden sm:block"></div>
        <div className="flex items-center gap-3 shrink-0 opacity-60 grayscale">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted border border-border text-muted-foreground font-bold text-sm">2</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Review</p>
            <p className="text-[11px] text-muted-foreground">Review your information</p>
          </div>
        </div>
        <div className="h-px bg-border flex-grow mx-4 hidden sm:block"></div>
        <div className="flex items-center gap-3 shrink-0 opacity-60 grayscale">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted border border-border text-muted-foreground font-bold text-sm">3</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Submit</p>
            <p className="text-[11px] text-muted-foreground">Publish your listing</p>
          </div>
        </div>
      </div>

      <Card className="border-border shadow-lg bg-card/50 backdrop-blur-sm overflow-hidden">
        <form onSubmit={handleSubmit}>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.5fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
              
              {/* Left Column: Photo Upload & AI Analysis */}
              <div className="p-5 sm:p-6 flex flex-col space-y-5 bg-muted/10 h-full">
                <div>
                  <label className="block text-lg font-semibold text-foreground mb-3">
                    1. Food Photo <span className="text-red-500">*</span>
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
                      
                      <div className="mt-4 text-xs text-emerald-600/80 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
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
                              <CheckCircle2 className="h-5 w-5 mr-3 flex-shrink-0 text-emerald-500 mt-0.5" />
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
                          <p className={`font-bold ${
                            (classificationResult.priority_score ?? 0) >= 80 ? 'text-red-600' :
                            (classificationResult.priority_score ?? 0) >= 50 ? 'text-amber-600' : 'text-blue-600'
                          }`}>{classificationResult.priority_score ? `${classificationResult.priority_score}/100` : 'N/A'}</p>
                        </div>
                        <div className="bg-background rounded p-2 text-center shadow-sm">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Freshness</p>
                          <p className="font-bold text-green-600">{classificationResult.freshness_score ? `${classificationResult.freshness_score}/100` : 'N/A'}</p>
                        </div>
                        <div className="bg-background rounded p-2 text-center shadow-sm">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Quality</p>
                          <p className={`font-bold capitalize ${
                            classificationResult.quality_status === 'excellent' ? 'text-emerald-600' :
                            classificationResult.quality_status === 'good' ? 'text-blue-600' :
                            classificationResult.quality_status === 'usable' ? 'text-amber-600' :
                            classificationResult.quality_status === 'risky' ? 'text-red-600' : 'text-gray-600'
                          }`}>{classificationResult.quality_status || 'N/A'}</p>
                        </div>
                        <div className="bg-background rounded p-2 text-center shadow-sm">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Confidence</p>
                          <p className="font-bold text-purple-600">{classificationResult.confidence_score ? `${classificationResult.confidence_score}%` : 'N/A'}</p>
                        </div>
                      </div>

                      {/* Shelf life + spoilage row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-background rounded p-2 text-center shadow-sm">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Shelf Life</p>
                          <p className="font-bold text-foreground flex items-center justify-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {classificationResult.estimated_safe_hours ? `~${classificationResult.estimated_safe_hours}h` : 'N/A'}
                          </p>
                        </div>
                        <div className="bg-background rounded p-2 text-center shadow-sm">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Spoilage Risk</p>
                          <p className={`font-bold capitalize ${
                            classificationResult.spoilage_risk === 'critical' ? 'text-red-600' :
                            classificationResult.spoilage_risk === 'high' ? 'text-red-500' :
                            classificationResult.spoilage_risk === 'medium' ? 'text-amber-600' : 'text-emerald-600'
                          }`}>{classificationResult.spoilage_risk || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* Tips Card */}
            <div className="bg-background border border-border rounded-xl p-5 mt-auto shadow-sm">
              <h4 className="flex items-center gap-2 font-semibold text-sm mb-4">
                <AlertCircle className="h-4 w-4 text-amber-500" /> Tips for a great photo
              </h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Use natural lighting</li>
                <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Show the quantity clearly</li>
                <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Avoid blurred images</li>
                <li className="flex items-start gap-2.5"><Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> No people in the photo</li>
              </ul>
            </div>

            {/* Prioritize Safety */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mt-4 flex gap-3 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
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
                        Post Title <span className="text-red-500">*</span>
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
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
                            <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
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
                            <div className="text-xs text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Allergens: {aiSuggestion.allergens.join(", ")}
                            </div>
                          )}
                          {aiSuggestion.safetyNotes && (
                            <p className="text-xs text-muted-foreground italic">{aiSuggestion.safetyNotes}</p>
                          )}
                          <button
                            type="button"
                            onClick={applyAiSuggestion}
                            className="w-full mt-1 py-1.5 text-xs font-medium rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 transition-colors"
                          >
                            Apply Suggestions
                          </button>
                        </div>
                      )}

                      {/* Text Classification Result */}
                      {textClassification && (
                        <div className="mt-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs space-y-1 animate-fade-in">
                          <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                            <Zap className="w-3 h-3" /> AI Text Classification
                          </div>
                          <p className="text-foreground">Category: <span className="font-medium">{textClassification.category}</span> ({textClassification.confidence}% confidence)</p>
                          {textClassification.allergens?.length > 0 && (
                            <p className="text-amber-400"><AlertTriangle className="w-3 h-3 inline mr-1" />Allergens: {textClassification.allergens.join(", ")}</p>
                          )}
                          {textClassification.notes && <p className="text-muted-foreground">{textClassification.notes}</p>}
                        </div>
                      )}

                      {/* Cross-validation note (after image classification) */}
                      {crossValidation && classificationResult && (
                        <div className="mt-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-xs text-emerald-400 flex items-start gap-1.5 animate-fade-in">
                          <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{crossValidation}</span>
                        </div>
                      )}
                    </div>

                    {/* Category & Quantity */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="foodType" className="block text-sm font-medium text-foreground mb-1.5">
                          Food Category <span className="text-red-500">*</span>
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
                          Quantity Estimation <span className="text-red-500">*</span>
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
                        Expiry / Best Before <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="expiry" 
                          name="expiry" 
                          type="datetime-local" 
                          className="pl-10 bg-muted/30 focus-visible:ring-emerald-500/50" 
                          required 
                        />
                      </div>
                    </div>

                    {/* Structured Pickup Window */}
                    <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-5 relative overflow-hidden shadow-sm">
                      <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Available Pickup Window <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-muted-foreground mb-4">Choose a time window when the food can be picked up.</p>
                      
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="w-full">
                          <label htmlFor="pickupStart" className="block text-xs font-medium text-muted-foreground mb-1">Pickup Start</label>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                              id="pickupStart" 
                              name="pickupStart" 
                              type="datetime-local" 
                              className="pl-10 bg-background border-border focus-visible:ring-emerald-500/50 shadow-sm" 
                              required 
                            />
                          </div>
                        </div>
                        
                        <ArrowRight className="h-5 w-5 text-emerald-500/50 hidden sm:block shrink-0 mt-5" />
                        <div className="sm:hidden text-muted-foreground text-xs my-1 w-full text-center">to</div>

                        <div className="w-full">
                          <label htmlFor="pickupEnd" className="block text-xs font-medium text-muted-foreground mb-1">Pickup End</label>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                              id="pickupEnd" 
                              name="pickupEnd" 
                              type="datetime-local" 
                              className="pl-10 bg-background border-border focus-visible:ring-emerald-500/50 shadow-sm" 
                              required 
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="address" className="block text-sm font-medium text-foreground mb-1.5">
                        Pickup Address (Type Pincode or City) <span className="text-red-500">*</span>
                      </label>
                      <div className="mb-3">
                        <AddressAutocomplete
                          id="address"
                          name="address"
                          value={addressInput}
                          onChange={(val) => setAddressInput(val)}
                          onSelect={handleAddressSelect}
                          className="bg-muted/30 focus-visible:ring-emerald-500/50"
                          required
                        />
                      </div>

                      <div className="h-[260px] bg-muted/30 rounded-xl border border-border overflow-hidden relative z-0 shadow-inner">
                        <MapContainer center={mapCenter} zoom={4} style={{ height: "100%", width: "100%" }}>
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          />
                          <Marker position={mapCenter} />
                          <RecenterMap lat={mapCenter[0]} lng={mapCenter[1]} />
                        </MapContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          {/* Bottom Action Bar */}
          <CardFooter className="bg-muted/20 flex flex-col-reverse sm:flex-row justify-end items-center py-4 px-6 lg:px-8 border-t border-border gap-3 sm:gap-4 sticky bottom-0 z-10 backdrop-blur-md">
            <Button type="button" variant="ghost" className="w-full sm:w-auto text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-900/20" disabled={isLoading || !selectedFile}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Listing...
                </>
              ) : (
                <>
                  Save & Continue <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
