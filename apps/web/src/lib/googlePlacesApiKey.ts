export function requireGooglePlacesApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key === undefined || key === '') {
    throw new Error('Missing GOOGLE_PLACES_API_KEY in apps/web/.env.local');
  }
  return key;
}
