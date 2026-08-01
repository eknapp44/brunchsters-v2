import { NextResponse } from 'next/server';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';

function requireGooglePlacesApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key === undefined || key === '') {
    throw new Error('Missing GOOGLE_PLACES_API_KEY in apps/web/.env.local');
  }
  return key;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';
  const sessionToken = searchParams.get('sessionToken');

  if (query.length < 3) {
    return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
  }

  try {
    const provider = new GooglePlacesProvider(requireGooglePlacesApiKey());
    const places = await provider.search({
      query,
      ...(sessionToken !== null ? { sessionToken } : {}),
    });
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ error: 'Place search unavailable' }, { status: 502 });
  }
}
