// For route handler tests (spec 0014): the code in an error answer, or undefined when the body is
// not in the coded shape. Kept out of the app's code on purpose: only tests import it.
export async function errorCodeOf(response: Response): Promise<unknown> {
  const body = (await response.clone().json()) as { error?: { code?: unknown } };
  return body.error?.code;
}
