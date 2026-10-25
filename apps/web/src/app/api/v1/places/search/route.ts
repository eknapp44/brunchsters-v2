import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { requireGooglePlacesApiKey } from '@/lib/googlePlacesApiKey';
import { enforceLimit } from '@/lib/rateLimit';

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
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
    return apiError({
      code: 'invalid',
      status: 400,
      message: 'Query must be at least 3 characters',
    });
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
    return apiError({ code: 'unavailable', status: 502, message: 'Place search unavailable' });
  }
}
