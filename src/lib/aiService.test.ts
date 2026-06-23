import { describe, it, expect, vi, beforeEach } from 'vitest';
import { suggestListingDetails, classifyFoodFromText, optimizeRoutes, askAssistant } from './aiService';

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('aiService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('suggestListingDetails gracefully handles failures by returning null', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    
    const result = await suggestListingDetails('Paneer', 'cooked_meal');
    expect(result).toBeNull();
  });

  it('suggestListingDetails parses valid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Paneer Dish",
                quantity: "2 servings",
                expiryHours: 24,
                safetyNotes: "Keep refrigerated",
                allergens: ["dairy"],
                category: "cooked_meal"
              })
            }
          }
        ]
      })
    } as any);

    const result = await suggestListingDetails('Paneer', 'cooked_meal');
    expect(result).toEqual({
      title: "Paneer Dish",
      quantity: "2 servings",
      expiryHours: 24,
      safetyNotes: "Keep refrigerated",
      allergens: ["dairy"],
      category: "cooked_meal"
    });
  });

  it('classifyFoodFromText gracefully degrades on malformed JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "This is not valid JSON"
            }
          }
        ]
      })
    } as any);

    const result = await classifyFoodFromText('Paneer');
    expect(result).toBeNull();
  });

  it('optimizeRoutes skips optimization if tasks are less than 2', async () => {
    const result = await optimizeRoutes([{
      id: "1",
      name: "Task 1",
      distanceKm: 2,
      expiryTime: null,
      spoilageRisk: null,
      priorityScore: 0
    }]);
    
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('askAssistant returns text response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Hello! How can I help?"
            }
          }
        ]
      })
    } as any);

    const result = await askAssistant([{ role: "user", content: "Hi" }]);
    expect(result).toBe("Hello! How can I help?");
  });
});
