import { type ApiErrorBody, type ApiErrorCode, isStatusAllowedFor } from '@brunchsters/shared';
import { NextResponse } from 'next/server';

// The one way a route answers with an error (spec 0014, ADR 0016): a code the client words, and a
// message for logs and other clients. The status must be one the code is listed with, so a route
// cannot send, say, a `not_found` with a 403; that is a programming error and throws.
// A 429 stays `rateLimitedResponse` (it carries the wait), and the answers that already have a
// helper (`rateLimiterUnavailableResponse`) keep it.
export function apiError(params: {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly message: string;
}): NextResponse<ApiErrorBody> {
  if (!isStatusAllowedFor({ code: params.code, status: params.status })) {
    throw new Error(`apiError: the code "${params.code}" cannot be sent with ${params.status}`);
  }
  return NextResponse.json(
    { error: { code: params.code, message: params.message } },
    { status: params.status },
  );
}
