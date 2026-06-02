import { calculateHaversineDistance } from "./distance";

export interface TaskPriorityContext {
  pickupLat: number;
  pickupLng: number;
  status: string;
  pickupWindow?: string;
  expiryTime?: string | null; // ISO timestamp from food_listings.expiry_time
  createdAt?: string;
}

/**
 * Compute a priority score for a task. Lower score = higher priority.
 *
 * Factors:
 *  1. Distance from volunteer (km) × 10 — closer is better
 *  2. Expiry urgency — tasks expiring within 90 min get strong bonus
 *  3. Pickup window keywords — "urgent", "asap", "within X hour"
 *  4. Age of request — older requests get slight priority boost
 */
export function computePriorityScore(
  task: TaskPriorityContext,
  volunteerLat: number,
  volunteerLng: number
): number {
  // 1. Distance factor
  const distanceKm = calculateHaversineDistance(
    volunteerLat,
    volunteerLng,
    task.pickupLat,
    task.pickupLng
  );
  let score = distanceKm * 10;

  // 2. Expiry urgency from ISO timestamp
  if (task.expiryTime) {
    const expiresAt = new Date(task.expiryTime).getTime();
    const now = Date.now();
    const minutesRemaining = (expiresAt - now) / 60000;

    if (minutesRemaining <= 0) {
      score += 200; // Already expired — deprioritise
    } else if (minutesRemaining <= 30) {
      score -= 80; // Expires very soon — critical override
    } else if (minutesRemaining <= 60) {
      score -= 50; // Expires within 1 hour
    } else if (minutesRemaining <= 90) {
      score -= 25; // Within 90 minutes
    }
  }

  // 3. Pickup window keyword hints
  if (task.pickupWindow) {
    const lower = task.pickupWindow.toLowerCase();
    if (lower.includes("urgent") || lower.includes("asap") || lower.includes("now")) {
      score -= 60;
    } else if (lower.includes("min") || lower.includes("hour") || lower.includes("tonight")) {
      score -= 20;
    }
  }

  // 4. Request age — tasks older than 30 minutes get mild boost
  if (task.createdAt) {
    const minutesOld = (Date.now() - new Date(task.createdAt).getTime()) / 60000;
    if (minutesOld > 60) score -= 15;
    else if (minutesOld > 30) score -= 8;
  }

  return Math.round(score);
}

export function sortTasksByPriority<T extends TaskPriorityContext>(
  tasks: T[],
  volunteerLat: number,
  volunteerLng: number
): T[] {
  return [...tasks].sort((a, b) => {
    const scoreA = computePriorityScore(a, volunteerLat, volunteerLng);
    const scoreB = computePriorityScore(b, volunteerLat, volunteerLng);
    return scoreA - scoreB;
  });
}

/**
 * Returns the single best task for a volunteer by priority score.
 * Used for "auto-suggest" display in the admin panel.
 */
export function autoSuggestTask<T extends TaskPriorityContext>(
  tasks: T[],
  volunteerLat: number,
  volunteerLng: number
): T | null {
  if (!tasks.length) return null;
  const sorted = sortTasksByPriority(tasks, volunteerLat, volunteerLng);
  return sorted[0];
}

export interface MultiTaskContext {
  id: string;
  status: string; // 'assigned' | 'picked_up' | 'delivered'
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
}

/**
 * Greedy Nearest-Neighbor approach for multi-task sequencing.
 * This determines the optimal sequence of stops for a volunteer that handles multiple tasks.
 * It chains from the current live position to the closest valid next node (pickup or dropoff).
 */
export function sortMultiTaskSequence<T extends MultiTaskContext>(
  tasks: T[],
  currentLat: number,
  currentLng: number
): { task: T; nextNodeRole: 'pickup' | 'dropoff'; distanceToNextKm: number }[] {
  const sequence: { task: T; nextNodeRole: 'pickup' | 'dropoff'; distanceToNextKm: number }[] = [];
  
  // Clone tasks and track pending modes
  const pendingNodes = tasks.map(t => ({
    task: t,
    needsPickup:  t.status === 'assigned',
    needsDropoff: t.status === 'assigned' || t.status === 'picked_up'
  }));

  let lastLat = currentLat;
  let lastLng = currentLng;

  while (pendingNodes.some(n => n.needsPickup || n.needsDropoff)) {
    let closestIndex = -1;
    let closestDist = Infinity;
    let chosenRole: 'pickup' | 'dropoff' | null = null;
    
    // Evaluate all valid next moves over remaining nodes
    for (let i = 0; i < pendingNodes.length; i++) {
      const node = pendingNodes[i];
      if (!node.needsPickup && !node.needsDropoff) continue;
      
      // If task needs pickup, that's the only valid next move for this task
      if (node.needsPickup) {
        const d = calculateHaversineDistance(lastLat, lastLng, node.task.pickupLat, node.task.pickupLng);
        if (d < closestDist) {
          closestDist = d;
          closestIndex = i;
          chosenRole = 'pickup';
        }
      } 
      // If task is picked up but needs dropoff, dropoff is valid
      else if (!node.needsPickup && node.needsDropoff) {
        const d = calculateHaversineDistance(lastLat, lastLng, node.task.dropoffLat, node.task.dropoffLng);
        if (d < closestDist) {
          closestDist = d;
          closestIndex = i;
          chosenRole = 'dropoff';
        }
      }
    }

    if (closestIndex === -1 || !chosenRole) break; // Should not happen given the loop condition

    const chosenNode = pendingNodes[closestIndex];
    sequence.push({
      task: chosenNode.task,
      nextNodeRole: chosenRole,
      distanceToNextKm: closestDist
    });

    if (chosenRole === 'pickup') {
      chosenNode.needsPickup = false;
      lastLat = chosenNode.task.pickupLat;
      lastLng = chosenNode.task.pickupLng;
    } else {
      chosenNode.needsDropoff = false;
      lastLat = chosenNode.task.dropoffLat;
      lastLng = chosenNode.task.dropoffLng;
    }
  }

  return sequence;
}
