import { describe, expect, it } from 'vitest';
import { assertE2eDatabaseUrl, UnsafeE2eTargetError } from './guard';

const e2eUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/brunchsters_e2e';

describe('assertE2eDatabaseUrl', () => {
  it('accepts a local database whose name ends in _e2e', () => {
    expect(assertE2eDatabaseUrl(e2eUrl)).toEqual({
      databaseName: 'brunchsters_e2e',
      hostname: '127.0.0.1',
    });
  });

  it('accepts localhost and a bare "e2e" database name', () => {
    expect(
      assertE2eDatabaseUrl('postgresql://postgres:postgres@localhost:5432/e2e').databaseName,
    ).toBe('e2e');
  });

  it('rejects an unset or empty URL', () => {
    expect(() => assertE2eDatabaseUrl(undefined)).toThrow(UnsafeE2eTargetError);
    expect(() => assertE2eDatabaseUrl('')).toThrow(UnsafeE2eTargetError);
  });

  it('rejects a URL that does not parse', () => {
    expect(() => assertE2eDatabaseUrl('not a url')).toThrow(UnsafeE2eTargetError);
  });

  it('rejects the dev database', () => {
    expect(() =>
      assertE2eDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
    ).toThrow(/must be "e2e" or end in "_e2e"/);
  });

  it('rejects a remote host even when the database name is right', () => {
    expect(() =>
      assertE2eDatabaseUrl('postgresql://u:p@db.example.supabase.co:5432/brunchsters_e2e'),
    ).toThrow(/only localhost is allowed/);
  });

  it('rejects names that merely contain e2e', () => {
    expect(() =>
      assertE2eDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/e2e_prod'),
    ).toThrow(UnsafeE2eTargetError);
  });

  it('rejects a non-postgres protocol', () => {
    expect(() => assertE2eDatabaseUrl('mysql://root@127.0.0.1:3306/brunchsters_e2e')).toThrow(
      /must be postgres/,
    );
  });
});
