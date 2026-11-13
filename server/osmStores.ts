// OpenStreetMap store lookup for AutoHustle's /api/parts endpoint.
// Replaces the Google Places findStores() — free, no key, no billing.
// Pipeline: geocode the ZIP with Nominatim, then find nearby
// shop=car_parts / shop=car_repair with the Overpass API.
//
// Honest note: Overpass is a free shared service. It is usually fast,
// but it can be slow when busy. This module tries two public endpoints
// in turn and gives up after a bounded wait, so a slow store lookup
// never hangs the parts response forever. When it gives up, the parts
// prices and labor still come back — only the store list is empty, with
// a note saying so. Store hours/phone are sparser than Places.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'AutoHustle/1.0 (BYOK; contact: support@atothei.dev)';

type LatLng = { lat: number; lng: number };

export type OsmStore = {
  name: string;
  address: string;
  phone: string;
  hours: string;
  lat: number | null;
  lng: number | null;
  distance_mi: number | null;
  distance: string;
  maps_url: string;
  source: 'OpenStreetMap';
};

async function geocodeZip(zip: string): Promise<LatLng | null> {
  const url =
    NOMINATIM_URL +
    '?format=json&postalcode=' +
    encodeURIComponent(zip) +
    '&countrycodes=us&limit=1';
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error('Nominatim lookup failed (HTTP ' + res.status + ').');
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function haversineMi(a: LatLng, b: LatLng): number {
  const R = 3958.8; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildOverpassQuery(lat: number, lng: number, radiusM: number): string {
  // nwr = nodes, ways and relations. `out center` puts a lat/lng on
  // ways/relations so every result can be placed on a map.
  return (
    '[out:json][timeout:18];' +
    '(' +
    'nwr["shop"="car_parts"](around:' + radiusM + ',' + lat + ',' + lng + ');' +
    'nwr["shop"="car_repair"](around:' + radiusM + ',' + lat + ',' + lng + ');' +
    ');' +
    'out center 8;'
  );
}

// One Overpass attempt against one endpoint. Throws on timeout/HTTP/error.
async function queryOverpassOnce(url: string, query: string): Promise<any[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'text/plain' },
    body: query,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('Overpass request failed (HTTP ' + res.status + ').');
  const data = await res.json();
  if (!data || !Array.isArray(data.elements)) throw new Error('Overpass returned an unexpected response.');
  return data.elements;
}

// Try the public Overpass endpoints in turn until one answers.
async function queryOverpass(lat: number, lng: number, radiusM: number): Promise<any[]> {
  const query = buildOverpassQuery(lat, lng, radiusM);
  let lastErr: any = null;
  for (const url of OVERPASS_URLS) {
    try {
      return await queryOverpassOnce(url, query);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Overpass lookup failed.');
}

function elementToStore(el: any, origin: LatLng): OsmStore | null {
  const tags = el.tags || {};
  const name = typeof tags.name === 'string' && tags.name.trim() ? tags.name.trim() : 'Auto parts / repair shop';
  const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat ?? null;
  const lng = typeof el.lon === 'number' ? el.lon : el.center?.lon ?? null;
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'],
    tags['addr:state'],
    tags['addr:postcode'],
  ].filter((x) => typeof x === 'string' && x.trim());
  const address = parts.join(' ');
  const phone = tags.phone || tags['contact:phone'] || '';
  const hours = tags.opening_hours || '';
  const distanceMi =
    lat != null && lng != null ? haversineMi(origin, { lat, lng }) : null;
  return {
    name,
    address,
    phone,
    hours,
    lat,
    lng,
    distance_mi: distanceMi != null ? Math.round(distanceMi * 10) / 10 : null,
    distance: distanceMi != null ? distanceMi.toFixed(1) + ' mi' : '',
    maps_url:
      lat != null && lng != null
        ? 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng
        : '',
    source: 'OpenStreetMap',
  };
}

// Same shape the frontend already renders for Places results.
// Never throws: on any failure it returns an empty list with a note,
// so the prices/labor part of the response is unaffected.
export async function findStoresOSM(zip: string): Promise<{
  stores: OsmStore[];
  store_note: string;
}> {
  try {
    if (!zip || !/^\d{5}(-\d{4})?$/.test(String(zip).trim())) {
      return { stores: [], store_note: 'Enter a valid 5-digit ZIP code to see nearby stores.' };
    }
    const origin = await geocodeZip(String(zip).trim());
    if (!origin) {
      return { stores: [], store_note: 'Could not find that ZIP code. Prices and labor below are unaffected.' };
    }
    let elements = await queryOverpass(origin.lat, origin.lng, 16000); // ~10 mi
    if (elements.length < 3) {
      try {
        elements = await queryOverpass(origin.lat, origin.lng, 40000); // ~25 mi
      } catch {
        // Keep the (few) 16 km results rather than failing outright.
      }
    }
    const stores = elements
      .map((el) => elementToStore(el, origin))
      .filter((s): s is OsmStore => s !== null)
      .sort((a, b) => (a.distance_mi ?? 9999) - (b.distance_mi ?? 9999))
      .slice(0, 8);
    if (stores.length === 0) {
      return { stores: [], store_note: 'No auto parts or repair shops found near this ZIP in OpenStreetMap. Prices and labor below are unaffected.' };
    }
    return {
      stores,
      store_note:
        'Stores from OpenStreetMap (free, community data). Hours and phone numbers may be missing for some shops — call ahead if you need them.',
    };
  } catch (e) {
    console.error('OSM store lookup failed:', e);
    return { stores: [], store_note: 'Store lookup is unavailable right now. Prices and labor below are unaffected.' };
  }
}
