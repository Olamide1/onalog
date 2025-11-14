/**
 * Comprehensive country list organized by regions
 */
export const countriesByRegion = {
  'Africa': [
    { code: 'ng', name: 'Nigeria' },
    { code: 'za', name: 'South Africa' },
    { code: 'ke', name: 'Kenya' },
    { code: 'gh', name: 'Ghana' },
    { code: 'ug', name: 'Uganda' },
    { code: 'tz', name: 'Tanzania' },
    { code: 'et', name: 'Ethiopia' },
    { code: 'eg', name: 'Egypt' },
    { code: 'zm', name: 'Zambia' },
    { code: 'zw', name: 'Zimbabwe' },
    { code: 'rw', name: 'Rwanda' },
    { code: 'sn', name: 'Senegal' },
    { code: 'ci', name: 'Ivory Coast' },
    { code: 'cm', name: 'Cameroon' },
    { code: 'ao', name: 'Angola' },
    { code: 'ma', name: 'Morocco' },
    { code: 'tn', name: 'Tunisia' },
    { code: 'dz', name: 'Algeria' },
    { code: 'mg', name: 'Madagascar' },
    { code: 'mw', name: 'Malawi' }
  ],
  'North America': [
    { code: 'us', name: 'United States' },
    { code: 'ca', name: 'Canada' },
    { code: 'mx', name: 'Mexico' }
  ],
  'Europe': [
    { code: 'gb', name: 'United Kingdom' },
    { code: 'de', name: 'Germany' },
    { code: 'fr', name: 'France' },
    { code: 'it', name: 'Italy' },
    { code: 'es', name: 'Spain' },
    { code: 'nl', name: 'Netherlands' },
    { code: 'be', name: 'Belgium' },
    { code: 'ch', name: 'Switzerland' },
    { code: 'at', name: 'Austria' },
    { code: 'se', name: 'Sweden' },
    { code: 'no', name: 'Norway' },
    { code: 'dk', name: 'Denmark' },
    { code: 'pl', name: 'Poland' },
    { code: 'ie', name: 'Ireland' },
    { code: 'pt', name: 'Portugal' }
  ],
  'Asia': [
    { code: 'in', name: 'India' },
    { code: 'cn', name: 'China' },
    { code: 'jp', name: 'Japan' },
    { code: 'kr', name: 'South Korea' },
    { code: 'sg', name: 'Singapore' },
    { code: 'my', name: 'Malaysia' },
    { code: 'th', name: 'Thailand' },
    { code: 'id', name: 'Indonesia' },
    { code: 'ph', name: 'Philippines' },
    { code: 'vn', name: 'Vietnam' },
    { code: 'ae', name: 'United Arab Emirates' },
    { code: 'sa', name: 'Saudi Arabia' },
    { code: 'il', name: 'Israel' },
    { code: 'pk', name: 'Pakistan' },
    { code: 'bd', name: 'Bangladesh' }
  ],
  'Oceania': [
    { code: 'au', name: 'Australia' },
    { code: 'nz', name: 'New Zealand' }
  ],
  'South America': [
    { code: 'br', name: 'Brazil' },
    { code: 'ar', name: 'Argentina' },
    { code: 'co', name: 'Colombia' },
    { code: 'cl', name: 'Chile' },
    { code: 'pe', name: 'Peru' }
  ]
};

export const allCountries = Object.values(countriesByRegion).flat();

export function getCountryName(code) {
  const country = allCountries.find(c => c.code === code);
  return country ? country.name : code;
}

