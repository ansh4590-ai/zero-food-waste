/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 * 
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const R = 6371; // Earth's mean radius in kilometers
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Formats a distance in kilometers to a human readable string format
 */
export function formatDistance(kilometers: number): string {
  if (kilometers < 1) {
    return `${(kilometers * 1000).toFixed(0)}m`;
  }
  return `${kilometers.toFixed(1)}km`;
}
