// The whole close-out gate in one command (`pnpm gate`), in the one order that works. It exists
// because the gate was run by hand a dozen times in spec 0015 and the hand-run version kept
// failing in avoidable ways: the dev-mode e2e run leaves a development build that the production
// server cannot start from (so it must come BEFORE the production build, never after), a stopped run
// leaves its test server and queue listening, and a long run on a machine that goes to sleep reports
// hours of wall-clock and failures that are only the sleep.
//
//   pnpm gate                      every stage, stopping at the first failure
//   pnpm gate --quick              skip the dev-mode run and the stress run (checks while building)
//   pnpm gate --keep-going         run every stage even after one fails, then report
//   pnpm gate --only=lint,unit     just these stages (names are printed at the start)
//
// Each stage's full output goes to a log in the temp directory (the path is printed); the console
// shows only the summary lines. It does not change any file in the repository.
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const STAGES = [
  { name: 'typecheck', command: 'pnpm typecheck' },
  { name: 'lint', command: 'pnpm lint' },
  { name: 'unit', command: 'pnpm test' },
  { name: 'integration', command: 'pnpm --filter @brunchsters/core test:integration' },
  // Development mode first: it leaves a dev build the production server cannot use, and the
  // production build below replaces it.
  { name: 'e2e-dev', command: 'pnpm test:e2e --retries=0', slow: true },
  { name: 'build', command: 'pnpm build', env: { CI: 'true' } },
  { name: 'e2e-ci', command: 'pnpm test:e2e --retries=0', env: { CI: 'true' } },
  {
    name: 'stress',
    command:
      'pnpm --filter @brunchsters/web exec playwright test --workers=4 --repeat-each=3 --retries=0',
    env: { CI: 'true' },
    slow: true,
  },
];

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const keepGoing = args.includes('--keep-going');
const only = args
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');

const chosen = STAGES.filter((stage) => {
  if (only !== undefined) return only.includes(stage.name);
  return !(quick && stage.slow === true);
});

const PORTS = [3000, 8288, 3100, 8298];

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

const SUMMARY_LINE =
  /^\s*(\d+ (passed|failed|skipped|flaky)|Tests\s+\d+|Test Files\s+\d+|Tasks:|✖)/;
const ANSI = /\u001b\[[0-9;]*m/g;

function runStage(stage, logPath) {
  return new Promise((resolve) => {
    const started = Date.now();
    const log = createWriteStream(logPath);
    const lines = [];
    const child = spawn(stage.command, {
      shell: true,
      env: { ...process.env, ...stage.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const take = (chunk) => {
      log.write(chunk);
      for (const line of chunk.toString().replace(ANSI, '').split(/\r?\n/)) {
        if (SUMMARY_LINE.test(line)) lines.push(line.trim());
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code) => {
      log.end();
      resolve({
        stage,
        code: code ?? 1,
        seconds: Math.round((Date.now() - started) / 1000),
        lines,
      });
    });
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = path.join(os.tmpdir(), 'brunchsters-gate', stamp);
mkdirSync(logDir, { recursive: true });

// A test server or queue still listening from an earlier (stopped) run makes unrelated journeys fail,
// and the owner's own `pnpm dev` does too (root CLAUDE.md, "Running locally").
const busy = (
  await Promise.all(PORTS.map(async (port) => ((await portInUse(port)) ? port : undefined)))
).filter((port) => port !== undefined);
const needsPorts = chosen.some((stage) => stage.name.startsWith('e2e') || stage.name === 'stress');
if (busy.length > 0 && needsPorts) {
  console.error(
    `Port(s) ${busy.join(', ')} already in use: stop your own pnpm dev and queue (3000, 8288), or a test server left over from a stopped run (3100, 8298), then run the gate again.`,
  );
  process.exit(2);
}

if (chosen.length === 0) {
  console.error(`No stage matches. Stages: ${STAGES.map((stage) => stage.name).join(', ')}`);
  process.exit(2);
}

console.log(`Gate: ${chosen.map((stage) => stage.name).join(' > ')}`);
console.log(`Logs: ${logDir}`);
const results = [];
for (const stage of chosen) {
  process.stdout.write(`\n--- ${stage.name} `);
  const result = await runStage(stage, path.join(logDir, `${stage.name}.log`));
  results.push(result);
  console.log(`${result.code === 0 ? 'ok' : 'FAILED'} (${result.seconds}s)`);
  for (const line of result.lines.slice(-6)) console.log(`    ${line}`);
  if (result.code !== 0 && !keepGoing) break;
}

const failed = results.filter((result) => result.code !== 0);
const skipped = chosen.length - results.length;
console.log(
  `\n${failed.length === 0 ? 'GREEN' : 'RED'}: ${results.length - failed.length} of ${chosen.length} stages passed` +
    (failed.length > 0 ? `; failed: ${failed.map((result) => result.stage.name).join(', ')}` : '') +
    (skipped > 0 ? `; not run: ${skipped}` : '') +
    `. Total ${results.reduce((sum, result) => sum + result.seconds, 0)}s.`,
);
console.log('If the total is hours, the machine slept: rerun before trusting a failure.');
if (!chosen.some((stage) => stage.name === 'build')) {
  console.log(
    'Note: no production build was made; run `CI=true pnpm build` before a CI-mode e2e run.',
  );
}
process.exit(failed.length === 0 ? 0 : 1);
