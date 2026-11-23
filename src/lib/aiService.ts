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

import { supabase } from "./supabase";

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
// Route through the Express proxy (/api/llm) to avoid browser CORS restrictions.
// The server selects the Gemini model and system instructions for each feature.
const LLM_PROXY_URL = "/api/llm";
const REQUEST_TIMEOUT_MS = 12_000;

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
  role: "user" | "assistant";
  content: string;
}

// ─── CORE FETCH WRAPPER ─────────────────────────────────────────────────────

async function llmChat(
  feature: string,
  messages: ChatMessage[],
  temperature = 0.7
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const session = (await supabase.auth.getSession()).data.session;
    const authHeaders: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};

    const response = await fetch(`${LLM_PROXY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        feature,
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

  const raw = await llmChat("listing", [
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

  const raw = await llmChat("classification", [
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
  return llmChat("validation", [
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

  const taskSummary = tasks
    .map(
      (t) =>
        `- ID: ${t.id}, Name: "${t.name}", Distance: ${t.distanceKm.toFixed(1)}km, ` +
        `Expires: ${t.expiryTime || "unknown"}, Spoilage: ${t.spoilageRisk || "unknown"}, Priority: ${t.priorityScore}`
    )
    .join("\n");

  const raw = await llmChat("route", [
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

export async function askAssistant(
  conversationHistory: ChatMessage[]
): Promise<string | null> {
  return llmChat("assistant", conversationHistory.slice(-9), 0.6);
}

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────

export async function checkLLMHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const session = (await supabase.auth.getSession()).data.session;
    const authHeaders: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};

    // Ping the proxy with a minimal request
    const response = await fetch(`${LLM_PROXY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        model: "auto",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
