import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A guard for a trap that cost real time in spec 0015: a regex or escape written through a shell
// heredoc or a script string lost its backslash and became a control character (a word-boundary
// escape turned into a backspace, U+0008), so two assertions and a guard test silently tested
// nothing, and a spec file failed to load. Text in this repo has no control characters other than
// tab, newline and carriage return; one means an escape was mangled on the way in.
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|css|sql|prisma|sh|txt)$/;
// Everything below U+0020 except tab (9), newline (10) and carriage return (13), plus DEL.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function trackedTextFiles(): string[] {
  const listed = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf-8' });
  return listed.split('\0').filter((file) => TEXT_FILE.test(file));
}

describe('no control characters in tracked text files', () => {
  it('finds the files it is meant to read (not nothing by mistake)', () => {
    expect(trackedTextFiles().length).toBeGreaterThan(300);
  });

  it('has none: an escape that became a control character is a mangled script, not content', () => {
    const offenders = trackedTextFiles().flatMap((file) => {
      const lines = readFileSync(join(REPO_ROOT, file), 'utf-8').split('\n');
      const at = lines.findIndex((line) => CONTROL.test(line));
      return at === -1 ? [] : [`${file}:${at + 1}`];
    });

    expect(
      offenders,
      'a control character (often a backspace from "\b") is in these files: a regex or escape was written through a shell heredoc or a script string. Write it with the Edit or Write tool instead',
    ).toEqual([]);
  });
});
