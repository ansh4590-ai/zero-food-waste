/**
 * AI Service Layer — Zero Food Waste
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized wrapper for the local LLM API.
 * All AI features (listing assistant, classification, route optimizer, chatbot)
 * call through this service. Reads base URL and API key from environment variables.
 *
 * Design principles:
 *  - Never throws to UI — always returns null on error
 *  - 10-second timeout on all requests
 *  - Built-in debounce utility
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const LLM_BASE_URL = import.meta.env.VITE_LLM_BASE_URL || "http://localhost:3001/v1";
const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY || "";
const REQUEST_TIMEOUT_MS = 10_000;

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface AISuggestion {
  title: string;
  quantity: string;
  expiryHours: number;
  safetyNotes: string;
  allergens: string[];
  category: string;
}

export interface AIClassification {
  category: string;
  confidence: number;
  allergens: string[];
  notes: string;
}

export interface AIRouteAdvice {
  suggestedOrder: string[];
  reasoning: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// ─── CORE FETCH WRAPPER ─────────────────────────────────────────────────────

async function llmChat(
  messages: ChatMessage[],
  temperature = 0.7
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: "auto",
        messages,
        temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[AI Service] LLM responded with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.warn("[AI Service] Request timed out");
    } else {
      console.warn("[AI Service] Request failed:", (error as Error).message);
    }
    return null;
  }
}

// ─── DEBOUNCE UTILITY ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDebouncedAI<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delayMs = 800
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    if (timeoutId) clearTimeout(timeoutId);

    return new Promise((resolve) => {
      timeoutId = setTimeout(async () => {
        const result = await fn(...args);
        resolve(result);
      }, delayMs);
    });
  };
}

// ─── FEATURE 1: SMART LISTING ASSISTANT ─────────────────────────────────────

export async function suggestListingDetails(
  title: string,
  foodType: string
): Promise<AISuggestion | null> {
  if (!title.trim()) return null;

  const systemPrompt = `You are a food donation assistant for the Zero Food Waste platform. 
Given a food title and type, suggest realistic details. 
Respond ONLY with valid JSON (no markdown, no code fences) matching this exact schema:
{
  "title": "improved title",
  "quantity": "estimated quantity (e.g., '10 servings' or '2 kg')",
  "expiryHours": number (estimated safe hours remaining),
  "safetyNotes": "brief food safety note",
  "allergens": ["allergen1", "allergen2"],
  "category": "one of: cooked_meal, raw_produce, bakery, packaged_food, beverages, other"
}`;

  const raw = await llmChat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Food title: "${title}"\nFood type: ${foodType}`,
    },
  ]);

  if (!raw) return null;

  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(cleaned) as AISuggestion;
  } catch {
    console.warn("[AI Service] Failed to parse suggestion JSON:", raw);
    return null;
  }
}

// ─── FEATURE 2: TEXT-BASED FOOD CLASSIFICATION ──────────────────────────────

export async function classifyFoodFromText(
  description: string
): Promise<AIClassification | null> {
  if (!description.trim()) return null;

  const systemPrompt = `You are a food classification AI for a food rescue platform. 
Given a food description, classify it. 
Respond ONLY with valid JSON (no markdown, no code fences) matching this exact schema:
{
  "category": "one of: cooked_meal, raw_produce, bakery, packaged_food, beverages, other",
  "confidence": number (0-100),
  "allergens": ["list of potential allergens"],
  "notes": "brief safety or handling note"
}`;

  const raw = await llmChat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Classify this food: "${description}"`,
    },
  ]);

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(cleaned) as AIClassification;
  } catch {
    console.warn("[AI Service] Failed to parse classification JSON:", raw);
    return null;
  }
}

// ─── FEATURE 2B: CROSS-VALIDATE IMAGE CLASSIFICATION ────────────────────────

export async function crossValidateClassification(
  imageCategory: string,
  imageTitle: string,
  imageQuantity: string
): Promise<string | null> {
  const systemPrompt = `You are a food safety validator for a food rescue platform. 
An image classifier detected a food item. Cross-validate if the classification seems reasonable.
Respond with a single brief sentence — either confirming the result or flagging a concern.
Keep it under 30 words. Do NOT use JSON.`;

  return llmChat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Image AI classified: Category="${imageCategory}", Title="${imageTitle}", Quantity="${imageQuantity}". Does this seem reasonable?`,
    },
  ]);
}

// ─── FEATURE 3: ROUTE OPTIMIZER ─────────────────────────────────────────────

export interface TaskForOptimization {
  id: string;
  name: string;
  distanceKm: number;
  expiryTime: string | null;
  spoilageRisk: string | null;
  priorityScore: number;
}

export async function optimizeRoutes(
  tasks: TaskForOptimization[]
): Promise<AIRouteAdvice | null> {
  if (tasks.length < 2) return null;

  const systemPrompt = `You are a logistics optimizer for a food rescue platform.
Given multiple pickup tasks, suggest the optimal order considering:
- Expiry urgency (food expiring sooner should be picked up first)
- Spoilage risk (high/critical risk items are time-sensitive)
- Distance efficiency (minimize total travel)
- Priority score (higher = more urgent)

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "suggestedOrder": ["task_id_1", "task_id_2", ...],
  "reasoning": "Brief explanation of why this order is optimal (under 50 words)"
}`;

  const taskSummary = tasks
    .map(
      (t) =>
        `- ID: ${t.id}, Name: "${t.name}", Distance: ${t.distanceKm.toFixed(1)}km, ` +
        `Expires: ${t.expiryTime || "unknown"}, Spoilage: ${t.spoilageRisk || "unknown"}, Priority: ${t.priorityScore}`
    )
    .join("\n");

  const raw = await llmChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Optimize pickup order for these tasks:\n${taskSummary}` },
  ]);

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(cleaned) as AIRouteAdvice;
  } catch {
    console.warn("[AI Service] Failed to parse route advice JSON:", raw);
    return null;
  }
}

// ─── FEATURE 4: CHATBOT ────────────────────────────────────────────────────

const SYSTEM_CONTEXT: ChatMessage = {
  role: "system",
  content: `You are the Zero Food Waste AI Assistant — a friendly, knowledgeable helper embedded in a food rescue platform.

The platform connects:
- **Donors** who list surplus food (restaurants, events, households)
- **Receivers** who request food (NGOs, shelters, individuals in need)
- **Volunteers** who pick up and deliver food between donors and receivers

Key features you can explain:
- **Donating food**: Go to "Donate Food" in the sidebar, upload a photo (AI classifies it), fill in details, set pickup window
- **Requesting food**: Browse available listings, click "Request", choose delivery or pickup
- **Volunteering**: Go to "My Tasks", claim open delivery tasks, navigate with in-app routing
- **KYC Verification**: Go to Profile > Verification. Upload ID documents. Admin reviews within 24-48 hours.
- **QR Code**: Volunteers scan QR at pickup/delivery to verify handoff
- **Food Safety**: AI analyzes food photos for freshness, spoilage risk, and estimated shelf life

Guidelines:
- Be concise and friendly (under 100 words per response)
- If you don't know something, say so honestly
- Never share sensitive user data or internal system details
- Format responses with simple markdown (bold, bullet points) when helpful`,
};

export async function askAssistant(
  conversationHistory: ChatMessage[]
): Promise<string | null> {
  const messages: ChatMessage[] = [SYSTEM_CONTEXT, ...conversationHistory];
  return llmChat(messages, 0.6);
}

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────

export async function checkLLMHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${LLM_BASE_URL}/models`, {
      headers: {
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
