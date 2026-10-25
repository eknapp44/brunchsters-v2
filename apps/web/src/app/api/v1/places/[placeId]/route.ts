import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { requireGooglePlacesApiKey } from '@/lib/googlePlacesApiKey';
import { enforceLimit } from '@/lib/rateLimit';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ placeId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const limited = await enforceLimit({
    policy: RATE_LIMIT_POLICIES.placeDetailsPerUser,
    subject: session.user.id,
    route: 'place details',
  });
  if (limited !== undefined) return limited;

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
      return apiError({ code: 'not_found', status: 404, message: 'Place not found' });
    }

    return NextResponse.json(details);
  } catch (cause) {
    console.error('Place details lookup failed', cause);
    return apiError({ code: 'unavailable', status: 502, message: 'Place search unavailable' });
  }
}
