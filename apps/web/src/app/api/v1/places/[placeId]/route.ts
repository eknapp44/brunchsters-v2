import { NextResponse } from 'next/server';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';

function requireGooglePlacesApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key === undefined || key === '') {
    throw new Error('Missing GOOGLE_PLACES_API_KEY in apps/web/.env.local');
  }
  return key;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ placeId: string }> },
): Promise<NextResponse> {
  const { placeId } = await params;
  const { searchParams } = new URL(request.url);
  const sessionToken = searchParams.get('sessionToken');

  try {
    const provider = new GooglePlacesProvider(requireGooglePlacesApiKey());
    const details = await provider.getDetails({
      placeId,
      ...(sessionToken !== null ? { sessionToken } : {}),
    });

    if (details === undefined) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch {
    return NextResponse.json({ error: 'Place search unavailable' }, { status: 502 });
  }
}
