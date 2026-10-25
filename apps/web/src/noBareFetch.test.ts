import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Spec 0014, ADR 0016: a control does not call `fetch` for a mutation. It dispatches the shared
// thunk through `useMutation` (apps/web/CLAUDE.md, "Shared mutations and toasts"), so a failure is
// worded from its code, a second tap on a key in flight does nothing, and a late result is ignored.
// This fails, naming the file and line, when a component or screen calls `fetch` directly.
//
// Fix: `const thing = useMutation('<key>')` and `thing.run({ request, failure })`. A read that is
// not a mutation (a search as you type) is the one reason to be on the list below, with its reason.

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

const ALLOWED: ReadonlyMap<string, string> = new Map([
  [
    'app/(authenticated)/brunch/PlaceSearchInput.tsx',
    'GET lookups as the person types (search, place details), not mutations: they are cancelled and de-duplicated by the component itself (an abort per query), which a store cannot do for a read',
  ],
  [
    'store/StoreProvider.tsx',
    'hands the browser `fetch` to the store as the thunks’ `extra.fetch` (the one place it is bound)',
  ],
]);

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function findFetchCalls(source: string): readonly number[] {
  const file = ts.createSourceFile(
    'x.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const lines: number[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isBare = ts.isIdentifier(callee) && callee.text === 'fetch';
      const isWindow =
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'fetch' &&
        ['window', 'globalThis'].includes(callee.expression.getText(file));
      if (isBare || isWindow) {
        lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return lines;
}

describe('no bare fetch in components and screens', () => {
  const sources = listSources(SRC_DIR)
    .map((path) => ({ path, name: relative(SRC_DIR, path).split(sep).join('/') }))
    // Server code (the routes, the auth setup, the adapters, the queue) is not a control.
    .filter(
      (source) =>
        !source.name.startsWith('app/api/') &&
        !source.name.startsWith('adapters/') &&
        !source.name.startsWith('inngest/') &&
        !source.name.startsWith('test-support/'),
    );

  it('scans the controls (the test is not passing on an empty list)', () => {
    const names = sources.map((source) => source.name);
    expect(names).toContain('app/(authenticated)/brunch/[id]/RsvpControl.tsx');
    expect(names).toContain('components/HideControl.tsx');
    expect(names).toContain('store/mutationsSlice.ts');
  });

  it('finds no direct fetch call outside the list', () => {
    const offences = sources
      .filter((source) => !ALLOWED.has(source.name))
      .flatMap((source) =>
        findFetchCalls(readFileSync(source.path, 'utf8')).map(
          (line) => `${source.name}:${line} calls fetch directly`,
        ),
      );
    expect(offences).toEqual([]);
  });

  it('keeps a file on the list only while it still needs to be there', () => {
    for (const [name, reason] of ALLOWED) {
      const source = sources.find((candidate) => candidate.name === name);
      expect(source, `${name} (${reason}) no longer exists: remove it from the list`).toBeDefined();
      const calls = findFetchCalls(readFileSync(source?.path ?? '', 'utf8')).length;
      // StoreProvider only wraps fetch; it does not call it in a call expression of this shape.
      if (name !== 'store/StoreProvider.tsx') {
        expect(calls, `${name} calls no fetch any more: remove it from the list`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

describe('findFetchCalls', () => {
  it('flags a bare and a window fetch, with their lines', () => {
    expect(findFetchCalls("const a = 1;\nawait fetch('/x');")).toEqual([2]);
    expect(findFetchCalls("window.fetch('/x');")).toEqual([1]);
    expect(findFetchCalls("globalThis.fetch('/x');")).toEqual([1]);
  });

  it('leaves the injected fetch and other names alone', () => {
    expect(findFetchCalls("await extra.fetch('/x');")).toEqual([]);
    expect(
      findFetchCalls('storeRef.current ??= makeStore({ fetch: (i, n) => fetch(i, n) });'),
    ).toEqual([1]);
    expect(findFetchCalls('const refetch = () => 1; refetch();')).toEqual([]);
  });
});
