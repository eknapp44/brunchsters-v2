import { NextResponse } from 'next/server';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { requireGooglePlacesApiKey } from '@/lib/googlePlacesApiKey';

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
  } catch (cause) {
    console.error('Place search failed', cause);
    return NextResponse.json({ error: 'Place search unavailable' }, { status: 502 });
  }
}
