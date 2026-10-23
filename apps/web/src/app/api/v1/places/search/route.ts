import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { requireGooglePlacesApiKey } from '@/lib/googlePlacesApiKey';
import { enforceLimit } from '@/lib/rateLimit';

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Google bills each call, so the budget is spent before it is called (spec 0012).
  const limited = await enforceLimit({
    policy: RATE_LIMIT_POLICIES.placeSearchPerUser,
    subject: session.user.id,
    route: 'place search',
  });
  if (limited !== undefined) return limited;

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
