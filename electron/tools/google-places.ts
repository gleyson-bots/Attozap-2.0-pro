export type GooglePlacesSearchInput = {
  query: string;
  location?: string;
  includedType?: string;
  minRating?: number;
  maxResults?: number;
  languageCode?: string;
  regionCode?: string;
};

export type GooglePlaceLead = {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  internationalPhone: string;
  website: string;
  rating?: number;
  ratingCount?: number;
  googleMapsUrl: string;
  latitude?: number;
  longitude?: number;
  primaryType?: string;
  businessStatus?: string;
};

const endpoint = 'https://places.googleapis.com/v1/places:searchText';
const fieldMask = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.location',
  'places.primaryType',
  'places.businessStatus',
  'nextPageToken',
].join(',');

function normalizePlace(place: any): GooglePlaceLead {
  return {
    placeId: String(place.id ?? ''),
    name: String(place.displayName?.text ?? ''),
    address: String(place.formattedAddress ?? ''),
    phone: String(place.nationalPhoneNumber ?? ''),
    internationalPhone: String(place.internationalPhoneNumber ?? ''),
    website: String(place.websiteUri ?? ''),
    rating: typeof place.rating === 'number' ? place.rating : undefined,
    ratingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined,
    googleMapsUrl: String(place.googleMapsUri ?? ''),
    latitude: typeof place.location?.latitude === 'number' ? place.location.latitude : undefined,
    longitude: typeof place.location?.longitude === 'number' ? place.location.longitude : undefined,
    primaryType: place.primaryType ? String(place.primaryType) : undefined,
    businessStatus: place.businessStatus ? String(place.businessStatus) : undefined,
  };
}

export async function searchGooglePlaces(apiKey: string, input: GooglePlacesSearchInput): Promise<GooglePlaceLead[]> {
  const key = apiKey.trim();
  if (!key) throw new Error('Configure a chave da Google Places API em Configurações > Google Maps');
  const query = input.query.trim();
  if (!query) throw new Error('Informe o que deseja buscar no Google Maps');

  const maxResults = Math.max(1, Math.min(60, Math.floor(input.maxResults ?? 20)));
  const textQuery = input.location?.trim() ? `${query} em ${input.location.trim()}` : query;
  const output: GooglePlaceLead[] = [];
  let pageToken: string | undefined;

  while (output.length < maxResults) {
    const remaining = maxResults - output.length;
    const body: Record<string, unknown> = {
      textQuery,
      pageSize: Math.min(20, remaining),
      languageCode: input.languageCode ?? 'pt-BR',
      regionCode: input.regionCode ?? 'BR',
    };
    if (pageToken) body.pageToken = pageToken;
    if (input.includedType?.trim()) body.includedType = input.includedType.trim();
    if (typeof input.minRating === 'number' && input.minRating > 0) body.minRating = Math.min(5, input.minRating);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({})) as any;
      if (!response.ok) {
        const reason = data?.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`Google Places API: ${reason}`);
      }
      for (const place of data.places ?? []) {
        if (output.length >= maxResults) break;
        output.push(normalizePlace(place));
      }
      pageToken = data.nextPageToken ? String(data.nextPageToken) : undefined;
      if (!pageToken || !(data.places?.length)) break;
    } finally {
      clearTimeout(timeout);
    }
  }

  return output;
}
