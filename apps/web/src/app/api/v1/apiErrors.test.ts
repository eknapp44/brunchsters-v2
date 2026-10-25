import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Spec 0014, ADR 0016: every error a route answers with is a code, built by `apiError()`
// (`lib/apiErrorResponse.ts`), so the client words it from one table and no server string is
// ever shown. This fails, naming the file and line, when a route builds an error answer the old
// way (`NextResponse.json({ error: '...' }, { status })`), which the client could only read by
// its status.
//
// Fix: `return apiError({ code: '<a code from packages/shared/src/apiError.ts>', status, message })`.
// A code a person can act on gets a line in `lib/errorCopy.ts`; the rate-limit answers keep
// `rateLimitedResponse` / `rateLimiterUnavailableResponse`, which are coded already.

const API_DIR = fileURLToPath(new URL('.', import.meta.url));

// Routes that may still answer the old way, each with the reason. None today (the wizard's create call
// was the last, moved in spec 0014 M5); the test also fails when an exempt route no longer needs it.
const EXEMPT: ReadonlyMap<string, string> = new Map<string, string>([]);

function listRoutes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listRoutes(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

function findOldShapeAnswers(
  source: string,
): readonly { readonly line: number; readonly text: string }[] {
  const file = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
  const found: { line: number; text: string }[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === 'NextResponse' &&
      node.expression.name.text === 'json'
    ) {
      const [first] = node.arguments;
      if (first !== undefined && ts.isObjectLiteralExpression(first)) {
        // The coded shape ({ error: { code, ... } }) is the one allowed way to say "error" by hand
        // (the middleware has no helper to import); anything else under `error` or `errors` is old.
        const isCoded = (property: ts.ObjectLiteralElementLike): boolean =>
          ts.isPropertyAssignment(property) &&
          ts.isObjectLiteralExpression(property.initializer) &&
          property.initializer.properties.some(
            (inner) => ts.isPropertyAssignment(inner) && inner.name.getText(file) === 'code',
          );
        const names = first.properties.flatMap((property) =>
          (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
          !isCoded(property)
            ? [property.name.getText(file)]
            : [],
        );
        if (names.includes('error') || names.includes('errors')) {
          const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
          found.push({
            line: line + 1,
            text: node.getText(file).slice(0, 80).replace(/\s+/g, ' '),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}

describe('API errors: every route answers with a code', () => {
  const routes = listRoutes(API_DIR).map((path) => ({
    path,
    name: relative(API_DIR, path).split(sep).join('/'),
  }));

  it('scans the routes (the test is not passing on an empty list)', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.map((route) => route.name)).toContain('brunches/[id]/rsvp/route.ts');
  });

  it('finds no error answer in the old shape outside the exemption list', () => {
    const offences = routes
      .filter((route) => !EXEMPT.has(route.name))
      .flatMap((route) =>
        findOldShapeAnswers(readFileSync(route.path, 'utf8')).map(
          (answer) => `${route.name}:${answer.line} ${answer.text}`,
        ),
      );

    expect(offences).toEqual([]);
  });

  it('answers a signed-out API call with a code too: the middleware is the 401 a person meets when their session ends', () => {
    const middleware = fileURLToPath(new URL('../../../middleware.ts', import.meta.url));
    expect(findOldShapeAnswers(readFileSync(middleware, 'utf8'))).toEqual([]);
  });

  it('keeps an exemption only while the route still needs it', () => {
    for (const [name, reason] of EXEMPT) {
      const route = routes.find((candidate) => candidate.name === name);
      expect(route, `${name} is exempt (${reason}) but no longer exists: remove it`).toBeDefined();
      const stillOld = findOldShapeAnswers(readFileSync(route?.path ?? '', 'utf8')).length > 0;
      expect(stillOld, `${name} answers with codes now: remove its exemption`).toBe(true);
    }
  });
});

describe('findOldShapeAnswers', () => {
  it('flags an error answer built the old way, with either key', () => {
    expect(
      findOldShapeAnswers("return NextResponse.json({ error: 'Nope' }, { status: 404 });"),
    ).toHaveLength(1);
    expect(
      findOldShapeAnswers('return NextResponse.json({ errors: issues }, { status: 422 });'),
    ).toHaveLength(1);
  });

  it('allows the coded shape written by hand', () => {
    expect(
      findOldShapeAnswers(
        "NextResponse.json({ error: { code: 'signed_out', message: 'x' } }, { status: 401 });",
      ),
    ).toEqual([]);
  });

  it('leaves a success answer and an apiError call alone', () => {
    expect(findOldShapeAnswers('return NextResponse.json(result.value, { status: 200 });')).toEqual(
      [],
    );
    expect(findOldShapeAnswers('return NextResponse.json({ invites }, { status: 201 });')).toEqual(
      [],
    );
    expect(
      findOldShapeAnswers("return apiError({ code: 'not_found', status: 404, message: 'x' });"),
    ).toEqual([]);
  });
});
