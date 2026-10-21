import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';

// Prototype-vs-app boards (spec 0011): for each screen, the Claude Design prototype next to the
// built app, light and dark, desktop and phone, written to .screenshots/board-<screen>-<light|dark>-<device>.png.
// This is the review artifact at every milestone.
//
//   pnpm --filter @brunchsters/web screenshots   (the app side; needs the local database)
//   pnpm --filter @brunchsters/web boards        (this script; needs network: React and Babel load from unpkg)
//
// The prototype is served from a scratch copy, so prototype/ and design-docs/ are never written.
// The scratch copy also gets a stand-in for ios-frame.jsx (missing from the repo, so the
// prototype's phone scenes would not render) and the Design v3 canvas files next to its HTML.

const WEB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');
const SHOTS_DIR = path.join(WEB_ROOT, '.screenshots');

type Scheme = 'light' | 'dark';
type Device = 'desktop' | 'phone';

type Pair = {
  readonly id: string;
  readonly title: string;
  // the app's screenshot name (see e2e/screenshots/review.spec.ts), without scheme and device
  readonly app: string;
  // the prototype's scene label and the size it is drawn at
  readonly scene: string;
  readonly sceneDevice: Device;
};

const PAIRS: readonly Pair[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    app: 'dashboard-full',
    scene: 'Dashboard (v3)',
    sceneDevice: 'desktop',
  },
  {
    id: 'dashboard-mobile',
    title: 'Dashboard (phone)',
    app: 'dashboard-full',
    scene: 'Dashboard (mobile shell)',
    sceneDevice: 'phone',
  },
  {
    id: 'empty-dashboard',
    title: 'Empty dashboard',
    app: 'dashboard-empty',
    scene: 'Empty dashboard',
    sceneDevice: 'desktop',
  },
  {
    id: 'host',
    title: 'Brunch page, host',
    app: 'brunch-host-voting',
    scene: 'Host detail',
    sceneDevice: 'desktop',
  },
  {
    id: 'invitee',
    title: 'Brunch page, invitee',
    app: 'brunch-invitee-voting',
    scene: 'Invitee detail',
    sceneDevice: 'desktop',
  },
  {
    id: 'wizard',
    title: 'Creation wizard, step 1',
    app: 'wizard-1-what',
    scene: 'Create-brunch wizard',
    sceneDevice: 'desktop',
  },
  {
    id: 'landing',
    title: 'Landing',
    app: 'landing',
    scene: 'Marketing landing',
    sceneDevice: 'desktop',
  },
  {
    id: 'sign-in',
    title: 'Sign-in',
    app: 'sign-in',
    scene: 'Welcome / Sign-in',
    sceneDevice: 'phone',
  },
  {
    id: 'invite-preview',
    title: 'Invite preview',
    app: 'invite-preview',
    scene: 'Invite preview',
    sceneDevice: 'phone',
  },
];

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const DEVICES: readonly Device[] = ['desktop', 'phone'];

// The prototype's frames: its desktop window, and (with the stand-in below) its phone frame.
const FRAME_SELECTOR: Record<Device, string> = {
  desktop: '.desktop-frame',
  phone: '.ios-stub',
};

// A stand-in for the prototype's missing ios-frame.jsx: a plain rounded box of the right size,
// not Apple's bezel. Only the scratch copy gets it.
const IOS_FRAME_STAND_IN = `window.IOSDevice = function IOSDevice({ width, height, children }) {
  return (
    <div className="ios-stub" style={{ width, height, overflow: 'hidden', position: 'relative', borderRadius: 28, border: '1px solid #bbb', background: '#fff' }}>
      {children}
    </div>
  );
};
`;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.jsx': 'text/babel',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function makeScratchCopy(): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'brunchsters-boards-'));
  fs.cpSync(path.join(REPO_ROOT, 'prototype'), scratch, { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'design-docs', 'Brunchsters Design v3.html'),
    path.join(scratch, 'v3.html'),
  );
  // the canvas HTML loads these next to itself; they live in components/ in the repo
  for (const file of ['design-canvas.jsx', 'tweaks-panel.jsx']) {
    fs.copyFileSync(path.join(scratch, 'components', file), path.join(scratch, file));
  }
  const frame = path.join(scratch, 'ios-frame.jsx');
  if (!fs.existsSync(frame)) fs.writeFileSync(frame, IOS_FRAME_STAND_IN);
  return scratch;
}

function serve(root: string): Promise<{ readonly server: http.Server; readonly port: number }> {
  const server = http.createServer((request, response) => {
    const file = path.join(root, decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/'));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'text/plain',
    });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The scratch server did not report a port'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

type Captures = Map<string, Buffer>;

const captureKey = (pair: Pair, scheme: Scheme): string => `${pair.id}-${scheme}`;

async function photographPrototype(browser: Browser, port: number): Promise<Captures> {
  const captures: Captures = new Map();
  for (const scheme of SCHEMES) {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1600, height: 1500 },
    });
    const page = await context.newPage();
    // a fixed clock keeps anything time-dependent in the prototype stable between runs
    await page.clock.setFixedTime(new Date('2026-10-21T15:00:00'));
    await page.goto(`http://127.0.0.1:${port}/Brunchsters%20Prototype.html`);
    await page.waitForSelector('.desktop-frame, .ios-stub');
    for (const pair of PAIRS) {
      try {
        await page.getByText(pair.scene, { exact: true }).first().click({ timeout: 5000 });
        await page.waitForTimeout(1500);
        const frame = page.locator(FRAME_SELECTOR[pair.sceneDevice]).first();
        captures.set(captureKey(pair, scheme), await frame.screenshot());
      } catch (error) {
        console.warn(
          `prototype scene "${pair.scene}" (${scheme}) was not captured:`,
          String(error),
        );
      }
    }
    await context.close();
  }
  return captures;
}

function figure(params: {
  readonly caption: string;
  readonly image: Buffer | undefined;
  readonly device: Device;
}): string {
  const style = params.device === 'phone' ? 'flex:0 1 48%;min-width:0' : 'flex:1 1 0;min-width:0';
  const imageStyle =
    params.device === 'phone'
      ? 'display:block;max-height:1500px;max-width:100%;width:auto;margin:0 auto;border:1px solid #bbb'
      : 'display:block;width:100%;border:1px solid #bbb';
  const body =
    params.image === undefined
      ? '<div style="padding:48px 16px;background:#eee;color:#555;font:600 20px sans-serif;text-align:center">Nothing to show at this size</div>'
      : `<img style="${imageStyle}" src="data:image/png;base64,${params.image.toString('base64')}"/>`;
  return `<figure style="${style};margin:0"><figcaption style="color:#222;font:700 22px sans-serif;padding:8px 4px">${params.caption}</figcaption>${body}</figure>`;
}

async function writeBoards(browser: Browser, captures: Captures): Promise<number> {
  let written = 0;
  for (const pair of PAIRS) {
    for (const scheme of SCHEMES) {
      for (const device of DEVICES) {
        const appFile = path.join(SHOTS_DIR, `${pair.app}-${scheme}-${device}.png`);
        const app = fs.existsSync(appFile) ? fs.readFileSync(appFile) : undefined;
        const proto =
          pair.sceneDevice === device ? captures.get(captureKey(pair, scheme)) : undefined;
        if (app === undefined && proto === undefined) continue;

        const sheet = await browser.newPage({
          viewport: { width: device === 'phone' ? 1400 : 2500, height: 400 },
        });
        const label = `${pair.title} · ${scheme} · ${device}`;
        await sheet.setContent(
          `<body style="margin:0;padding:12px;background:#fff;display:flex;gap:16px;align-items:flex-start">${figure({ caption: `Your design (Claude Design prototype): ${label}`, image: proto, device })}${figure({ caption: 'What we built', image: app, device })}</body>`,
        );
        await sheet.screenshot({
          path: path.join(SHOTS_DIR, `board-${pair.id}-${scheme}-${device}.png`),
          fullPage: true,
        });
        await sheet.close();
        written += 1;
      }
    }
  }
  return written;
}

async function main(): Promise<void> {
  if (!fs.existsSync(SHOTS_DIR) || fs.readdirSync(SHOTS_DIR).length === 0) {
    throw new Error(
      'No app screenshots yet. Run `pnpm --filter @brunchsters/web screenshots` first (needs the local database).',
    );
  }
  const scratch = makeScratchCopy();
  const { server, port } = await serve(scratch);
  const browser = await chromium.launch();
  try {
    const captures = await photographPrototype(browser, port);
    const written = await writeBoards(browser, captures);
    console.log(`Wrote ${written} boards to ${SHOTS_DIR} (board-*.png).`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
