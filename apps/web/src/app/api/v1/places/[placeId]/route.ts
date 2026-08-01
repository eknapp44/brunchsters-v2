import { NextResponse } from 'next/server';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { requireGooglePlacesApiKey } from '@/lib/googlePlacesApiKey';

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
  } catch (cause) {
    console.error('Place details lookup failed', cause);
    return NextResponse.json({ error: 'Place search unavailable' }, { status: 502 });
  }
}
