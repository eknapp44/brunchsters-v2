import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeEmail } from '@brunchsters/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileEmailService } from './FileEmailService';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'brunchsters-outbox-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const INPUT = {
  to: normalizeEmail('guest@example.com'),
  subject: 'Hello',
  html: '<p>Hi</p>',
  idempotencyKey: 'invite:1:abc',
};

describe('FileEmailService', () => {
  it('writes one readable JSON file per email', async () => {
    const result = await new FileEmailService(dir).send(INPUT);

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const saved = JSON.parse(await readFile(path.join(dir, files[0] ?? ''), 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(saved).toMatchObject({
      id: result._unsafeUnwrap(),
      to: 'guest@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      idempotencyKey: 'invite:1:abc',
    });
    expect(typeof saved.createdAt).toBe('string');
  });

  it('creates the outbox directory when it does not exist yet', async () => {
    const nested = path.join(dir, 'a', 'b');

    const result = await new FileEmailService(nested).send(INPUT);

    expect(result.isOk()).toBe(true);
    expect(await readdir(nested)).toHaveLength(1);
  });

  it('gives each email its own file, in send order', async () => {
    const service = new FileEmailService(dir);

    await service.send({ ...INPUT, subject: 'first' });
    await service.send({ ...INPUT, subject: 'second' });

    const files = (await readdir(dir)).sort();
    expect(files).toHaveLength(2);
    const subjects = await Promise.all(
      files.map(
        async (file) =>
          (JSON.parse(await readFile(path.join(dir, file), 'utf-8')) as { subject: string })
            .subject,
      ),
    );
    expect(subjects).toEqual(['first', 'second']);
  });

  it('reports a delivery failure when the directory cannot be written', async () => {
    // A file where the directory should be: mkdir cannot succeed.
    const blocker = path.join(dir, 'blocker');
    await writeFile(blocker, 'not a directory');

    const result = await new FileEmailService(path.join(blocker, 'outbox')).send(INPUT);

    expect(result._unsafeUnwrapErr().kind).toBe('delivery_failed');
  });
});
