// Makes the curated screenshots of one spec: the small set that says "this is what we did and how
// it looked then" (a process step from spec 0014). It runs the review screenshot set once
// (dev server, like `pnpm screenshots`) and keeps only the shots the spec lists, as compressed JPEGs
// in `specs/NNNN-name/screenshots/`, plus a README that lays them out. Usage:
//
//   pnpm --filter @brunchsters/web shots:spec 0014
//
// The list is `specs/NNNN-name/screenshots.json`:
//   { "shots": [ { "name": "feedback/toast-error", "caption": "...", "variants": ["phone-light"] } ] }
// `name` is the one passed to `captureReviewShots` in `e2e/screenshots/review.spec.ts`; `variants` are
// `<device>-<scheme>` (device: desktop or phone) and default to phone light and desktop light (two per
// shot at most keeps the folder small). Each image is one screenful, JPEG quality 60; pass `{ focus }`
// to `captureReviewShots` to scroll a lower part of a long page into view.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_VARIANTS = ['phone-light', 'desktop-light'];
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
const specsDir = path.resolve(webDir, '..', '..', 'specs');

const number = process.argv[2];
if (number === undefined || !/^\d{4}$/.test(number)) {
  console.error('Usage: pnpm --filter @brunchsters/web shots:spec <spec number, e.g. 0014>');
  process.exit(1);
}
const specFolder = fs.readdirSync(specsDir).find((entry) => entry.startsWith(`${number}-`));
if (specFolder === undefined) {
  console.error(`No folder in specs/ starts with ${number}-`);
  process.exit(1);
}
const specDir = path.join(specsDir, specFolder);
const listPath = path.join(specDir, 'screenshots.json');
if (!fs.existsSync(listPath)) {
  console.error(`${path.relative(process.cwd(), listPath)} is missing: list the shots to keep.`);
  process.exit(1);
}
const { shots } = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const outDir = path.join(specDir, 'screenshots');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const run = (args, env = {}) => {
  const result = spawnSync('pnpm', args, {
    cwd: webDir,
    stdio: 'inherit',
    shell: true,
    // The review shots need the dev server (the production CSP blocks their injected style).
    env: { ...process.env, CI: '', ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(['e2e:db:reset']);
run(['exec', 'playwright', 'test', '--config', 'playwright.screenshots.config.ts'], {
  SPEC_SHOTS_DIR: outDir,
  SPEC_SHOTS: shots.map((shot) => shot.name).join(','),
  SPEC_SHOTS_VARIANTS: JSON.stringify(
    Object.fromEntries(shots.map((shot) => [shot.name, shot.variants ?? DEFAULT_VARIANTS])),
  ),
});

const fileFor = (name, variant) => {
  const [device, scheme] = variant.split('-');
  return `${name.replace('/', '-')}-${scheme}-${device}.jpg`;
};
const lines = [
  `# Screenshots, spec ${number}`,
  '',
  `What this spec looked like when it was finished (made by \`pnpm --filter @brunchsters/web shots:spec ${number}\`, from the list in \`screenshots.json\`). A record of a moment, not a baseline: nothing compares against these.`,
  '',
];
for (const shot of shots) {
  const variants = shot.variants ?? DEFAULT_VARIANTS;
  const present = variants.filter((variant) =>
    fs.existsSync(path.join(outDir, fileFor(shot.name, variant))),
  );
  lines.push(`## ${shot.caption}`, '', `\`${shot.name}\``, '');
  if (present.length !== variants.length) {
    lines.push(
      `> Missing: ${variants.filter((v) => !present.includes(v)).join(', ')} (the shot was not captured).`,
      '',
    );
  }
  lines.push(`| ${present.join(' | ')} |`, `| ${present.map(() => '---').join(' | ')} |`);
  lines.push(
    `| ${present.map((variant) => `![${shot.caption}, ${variant}](./${fileFor(shot.name, variant)})`).join(' | ')} |`,
    '',
  );
}
fs.writeFileSync(path.join(outDir, 'README.md'), lines.join('\n'));
console.log(
  `${shots.length} shots listed; images and README in ${path.relative(process.cwd(), outDir)}`,
);
