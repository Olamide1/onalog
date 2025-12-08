/**
 * Distance calculation utilities
 * Calculates distance between two geographic coordinates using Haversine formula
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Number} lat1 - Latitude of first point
 * @param {Number} lon1 - Longitude of first point
 * @param {Number} lat2 - Latitude of second point
 * @param {Number} lon2 - Longitude of second point
 * @returns {Number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Major city coordinates lookup
 * Used when exact coordinates aren't available
 */
export const CITY_COORDINATES = {
  // Nigeria
  'lagos': { lat: 6.5244, lon: 3.3792 },
  'abuja': { lat: 9.0765, lon: 7.3986 },
  'kano': { lat: 12.0022, lon: 8.5919 },
  'ibadan': { lat: 7.3775, lon: 3.9470 },
  'port harcourt': { lat: 4.8156, lon: 7.0498 },
  'benin city': { lat: 6.3350, lon: 5.6271 },
  'kaduna': { lat: 10.5105, lon: 7.4165 },
  'abia': { lat: 5.5320, lon: 7.4860 },
  
  // Kenya
  'nairobi': { lat: -1.2921, lon: 36.8219 },
  'mombasa': { lat: -4.0435, lon: 39.6682 },
  'kisumu': { lat: -0.0917, lon: 34.7680 },
  'nakuru': { lat: -0.3031, lon: 36.0800 },
  'eldoret': { lat: 0.5143, lon: 35.2698 },
  
  // South Africa
  'johannesburg': { lat: -26.2041, lon: 28.0473 },
  'cape town': { lat: -33.9249, lon: 18.4241 },
  'durban': { lat: -29.8587, lon: 31.0218 },
  'pretoria': { lat: -25.7479, lon: 28.2293 },
  'port elizabeth': { lat: -33.9608, lon: 25.6022 },
  
  // Ghana
  'accra': { lat: 5.6037, lon: -0.1870 },
  'kumasi': { lat: 6.6885, lon: -1.6244 },
  'tamale': { lat: 9.4000, lon: -0.8333 },
  'sekondi-takoradi': { lat: 4.9340, lon: -1.7137 },
  
  // Uganda
  'kampala': { lat: 0.3476, lon: 32.5825 },
  'gulu': { lat: 2.7667, lon: 32.3056 },
  'mbarara': { lat: -0.6000, lon: 30.6500 },
  
  // Tanzania
  'dar es salaam': { lat: -6.7924, lon: 39.2083 },
  'arusha': { lat: -3.3869, lon: 36.6830 },
  'mwanza': { lat: -2.5164, lon: 32.9176 },
  
  // Ethiopia
  'addis ababa': { lat: 9.1450, lon: 38.7667 },
  'dire dawa': { lat: 9.6000, lon: 41.8500 },
  
  // Egypt
  'cairo': { lat: 30.0444, lon: 31.2357 },
  'alexandria': { lat: 31.2001, lon: 29.9187 },
  
  // US
  'new york': { lat: 40.7128, lon: -74.0060 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'chicago': { lat: 41.8781, lon: -87.6298 },
  'houston': { lat: 29.7604, lon: -95.3698 },
  'phoenix': { lat: 33.4484, lon: -112.0740 },
  
  // UK
  'london': { lat: 51.5074, lon: -0.1278 },
  'manchester': { lat: 53.4808, lon: -2.2426 },
  'birmingham': { lat: 52.4862, lon: -1.8904 },
  
  // More cities can be added as needed
};

/**
 * Get coordinates for a city name (fuzzy matching)
 * @param {String} cityName - City name
 * @param {String} country - Country code (optional, for disambiguation)
 * @returns {Object|null} { lat, lon } or null if not found
 */
export function getCityCoordinates(cityName, country = null) {
  if (!cityName || typeof cityName !== 'string') return null;
  
  const normalized = cityName.toLowerCase().trim();
  
  // Direct match
  if (CITY_COORDINATES[normalized]) {
    return CITY_COORDINATES[normalized];
  }
  
  // Try partial matches
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }
  
  return null;
}

/**
 * Calculate distance from search location to company location
 * @param {String} searchLocation - Search location string (e.g., "Lagos")
 * @param {String} companyLocation - Company location string (e.g., "Ikeja, Lagos")
 * @param {String} searchCountry - Search country code (optional)
 * @returns {Number|null} Distance in kilometers, or null if can't calculate
 */
export function calculateLocationDistance(searchLocation, companyLocation, searchCountry = null) {
  if (!searchLocation || !companyLocation) return null;
  
  const searchCoords = getCityCoordinates(searchLocation, searchCountry);
  if (!searchCoords) return null;
  
  // Try to extract city from company location
  // Company location might be "Ikeja, Lagos" or "123 Main St, Lagos"
  const companyCity = extractCityFromLocation(companyLocation);
  const companyCoords = getCityCoordinates(companyCity || companyLocation, searchCountry);
  
  if (!companyCoords) return null;
  
  return calculateDistance(
    searchCoords.lat,
    searchCoords.lon,
    companyCoords.lat,
    companyCoords.lon
  );
}

/**
 * Extract city name from a location string
 * @param {String} location - Location string (e.g., "Ikeja, Lagos, Nigeria")
 * @returns {String} City name
 */
function extractCityFromLocation(location) {
  if (!location || typeof location !== 'string') return null;
  
  // Split by common separators
  const parts = location.split(/[,;|]/).map(p => p.trim());
  
  // Usually city is first or second part
  // Try to find a known city name
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (CITY_COORDINATES[normalized]) {
      return normalized;
    }
    // Check if part contains a known city
    for (const cityName of Object.keys(CITY_COORDINATES)) {
      if (normalized.includes(cityName) || cityName.includes(normalized)) {
        return cityName;
      }
    }
  }
  
  // Return first part as fallback
  return parts[0] || null;
}

/**
 * Format distance for display
 * @param {Number} distanceKm - Distance in kilometers
 * @returns {String} Formatted distance string
 */
export function formatDistance(distanceKm) {
  if (distanceKm === null || distanceKm === undefined) return '—';
  
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  } else if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)}km`;
  } else {
    return `${Math.round(distanceKm)}km`;
  }
}

