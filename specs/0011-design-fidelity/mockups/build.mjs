// The owner-approved target for spec 0011 (design fidelity), as static pages built from the app's
// real tokens. Reference only: the real screens are built in apps/web and reviewed with
// `pnpm --filter @brunchsters/web boards`. Run `node specs/0011-design-fidelity/mockups/build.mjs`
// (needs network for the fonts); PNGs go to ./out (git-ignored). Mock data, not app data.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(repo + '/apps/web/package.json');
const { chromium } = require('@playwright/test');
const tokens = fs.readFileSync(repo + '/apps/web/src/styles/tokens.css', 'utf8');

const css = `
${tokens}
:root{--font-nunito:'Nunito';--font-fraunces:'Fraunces';--font-jetbrains:'JetBrains Mono';
 --wash-a:oklch(0.955 0.07 85);--wash-b:oklch(0.945 0.05 45);--butter:var(--accent-soft);--butter-fg:var(--accent-soft-fg);
 --mint-soft:oklch(0.93 0.05 165);--mint-soft-fg:oklch(0.32 0.07 165);--bar:oklch(0.93 0.07 85)}
@media (prefers-color-scheme:dark){:root{--wash-a:oklch(0.27 0.045 78);--wash-b:oklch(0.23 0.03 40);--mint-soft:oklch(0.3 0.05 165);--mint-soft-fg:oklch(0.9 0.06 165);--bar:oklch(0.34 0.06 78)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-sans);font-size:var(--text-base);line-height:1.5}
.wash{min-height:100vh;background:radial-gradient(1100px 460px at 15% -8%,var(--wash-a),transparent 62%),radial-gradient(800px 420px at 100% 0,var(--wash-b),transparent 58%),var(--bg)}
h1,h2,h3{font-family:var(--font-display);font-variation-settings:var(--display-variation);font-weight:500;letter-spacing:-.02em;margin:0}
nav.top{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-5);border-bottom:1px solid var(--line-soft);background:color-mix(in oklab,var(--bg) 80%,transparent)}
.mark{font-family:var(--font-display);font-variation-settings:var(--display-variation);font-weight:600;font-size:1.25rem;display:flex;align-items:center;gap:8px}
.egg{width:26px;height:26px;border-radius:8px;background:var(--pop-butter);display:grid;place-items:center;font-size:14px}
.sp{flex:1}
.av{width:30px;height:30px;border-radius:50%;background:var(--pop-peach);color:var(--pop-peach-fg);display:grid;place-items:center;font-weight:700;font-size:.72rem}
.small{font-size:var(--text-sm);color:var(--fg-muted)}
.btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 var(--space-4);border-radius:var(--r-3);border:1px solid var(--control-border);background:var(--surface);color:var(--fg);font:600 var(--text-sm) var(--font-sans)}
.btn.sm{min-height:36px;padding:0 var(--space-3)}
.btn.primary{background:var(--accent-strong);border-color:transparent;color:var(--accent-fg)}
.btn.ghost{border-color:transparent;background:transparent}
.page{max-width:var(--page-width);margin:0 auto;padding:var(--space-6) var(--page-gutter) var(--space-8)}
.eyebrow{font-size:var(--text-xs);font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--fg-subtle);margin:0 0 var(--space-2)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-4);box-shadow:var(--shadow-sm);padding:var(--space-5)}
.card h2{font-size:var(--text-lg);margin-bottom:var(--space-3)}
.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:var(--r-pill);font-size:var(--text-xs);font-weight:700;background:var(--surface-3);color:var(--fg-muted)}
.pill.mint{background:var(--mint-soft);color:var(--mint-soft-fg)}.pill.butter{background:var(--butter);color:var(--butter-fg)}
.pill.tomato{background:var(--danger-soft);color:var(--fg)}
.ic{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;font-size:14px;flex:none}
.ic.b{background:var(--pop-butter)}.ic.t{background:var(--pop-tomato)}.ic.m{background:var(--pop-mint)}
.row{display:flex;align-items:center;gap:var(--space-3)}
.hero{font-size:var(--text-3xl);line-height:1.1}
.cols{display:grid;gap:var(--space-5);grid-template-columns:minmax(0,1fr)}
@media(min-width:60rem){.cols{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}}
.stack{display:grid;gap:var(--space-5);align-content:start}
.feature{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden;padding:0}
@media(min-width:48rem){.feature{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}}
.feature .l{padding:var(--space-5);display:grid;gap:var(--space-3);align-content:start}
.feature .r{background:var(--butter);color:var(--butter-fg);padding:var(--space-5)}
.who{display:grid;gap:10px;margin-top:var(--space-3)}
.who .p{display:flex;align-items:center;gap:10px}
.mini{width:26px;height:26px;border-radius:50%;background:var(--surface);color:var(--fg);display:grid;place-items:center;font-size:.62rem;font-weight:800;border:1px solid var(--line)}
.state{margin-left:auto;font-size:var(--text-xs);font-weight:700}
.tile{width:56px;height:56px;border-radius:14px;background:var(--butter);color:var(--butter-fg);display:grid;place-items:center;text-align:center;line-height:1.05;flex:none}
.tile b{font-family:var(--font-display);font-size:1.3rem;display:block}.tile span{font-size:.62rem;font-weight:800;letter-spacing:.08em}
.tile.tbd{background:var(--surface-3);color:var(--fg-muted)}
.list{display:grid;gap:var(--space-3);margin-top:var(--space-3)}
.item{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-4);background:var(--surface);border:1px solid var(--line);border-radius:var(--r-3)}
.item .t{font-weight:700}
.opt{position:relative;display:flex;gap:var(--space-3);align-items:flex-start;padding:var(--space-3) var(--space-4);border:1px solid var(--line);border-radius:var(--r-3);overflow:hidden;background:var(--surface)}
.opt .fill{position:absolute;inset:0 auto 0 0;background:var(--bar);z-index:0}
.opt>*:not(.fill){position:relative;z-index:1}
.opt.on{border-color:var(--accent-strong)}
.cb{width:20px;height:20px;border-radius:6px;border:2px solid var(--control-border);flex:none;margin-top:2px;background:var(--surface)}
.cb.on{background:var(--accent-strong);border-color:var(--accent-strong);display:grid;place-items:center;color:var(--accent-fg);font-size:12px;font-weight:900}
.count{margin-left:auto;font-size:var(--text-xs);font-weight:700;background:var(--surface-2);border-radius:var(--r-pill);padding:2px 10px;white-space:nowrap}
.rsvp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-3)}
.rsvp .btn{justify-content:center;min-height:56px;font-size:var(--text-base)}
.rsvp .btn.sel{background:var(--accent-strong);border-color:transparent;color:var(--accent-fg)}
.banner{display:flex;align-items:center;gap:var(--space-4);background:var(--mint-soft);color:var(--mint-soft-fg);border-radius:var(--r-4);padding:var(--space-4) var(--space-5);margin-bottom:var(--space-5)}
.banner h2{font-size:var(--text-xl)}
.result{font-family:var(--font-display);font-variation-settings:var(--display-variation);font-size:var(--text-2xl);line-height:1.15;margin:var(--space-2) 0}
.field{display:grid;gap:6px;margin-bottom:var(--space-4)}.field label{font-size:var(--text-sm);font-weight:700}
.input{border:1px solid var(--control-border);border-radius:var(--r-3);background:var(--surface);min-height:50px;padding:12px 14px;color:var(--fg-subtle);font-family:var(--font-display)}
.input.focus{outline:3px solid var(--accent-strong);color:var(--fg)}
.steps{display:flex;justify-content:space-between;margin:0 0 var(--space-6);position:relative}
.steps .s{display:grid;justify-items:center;gap:6px;font-size:var(--text-xs);color:var(--fg-subtle)}
.steps .s .dot{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--surface-3)}
.steps .s.on .dot{background:var(--pop-butter);outline:3px solid var(--accent-soft)}.steps .s.on{color:var(--fg);font-weight:700}
.phone{max-width:430px}
.phone nav.top{padding:var(--space-3) var(--space-4)}.phone .hero{font-size:var(--text-2xl)}.phone .page{padding-top:var(--space-5)}
.phone .rsvp .btn{font-size:var(--text-sm);padding:0 6px}
.item .main{flex:1;min-width:0}.item .meta{display:flex;align-items:center;gap:var(--space-3)}
.phone .nm{display:none}.phone .out{white-space:nowrap}
.phone .item{display:grid;grid-template-columns:56px minmax(0,1fr);gap:var(--space-2) var(--space-3);align-items:start}
.phone .item .tile{grid-row:1/3}.phone .item .meta{grid-column:2}.phone .item .arrow{display:none}
.phone .item .main .t,.phone .item .main .small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.phone .helper,.phone .dup,.phone .cnt{display:none}
.phone .steps .s{font-size:var(--text-sm)}.phone .steps .s .dot{width:48px;height:48px;font-size:22px}
.notes{margin-top:var(--space-5);font-size:var(--text-sm);color:var(--fg-muted)}
`;

const nav = (name = 'Evan Knapp') => `<nav class="top"><div class="mark"><span class="egg">🍳</span>brunchsters</div><span class="sp"></span><span class="av">EK</span><span class="small nm">${name}</span><span class="small out">Sign out</span></nav>`;
const plan = `<span class="btn primary">＋ Plan a Brunch</span>`;

const dashboard = `
<div class="wash">${nav()}
<main class="page">
 <div class="row" style="align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:16rem">
  <p class="eyebrow">Tuesday, October 21</p>
  <h1 class="hero">Afternoon, Evan <span>👋</span></h1>
  <p class="small" style="font-size:var(--text-base);margin:6px 0 0">You've got <b style="color:var(--fg)">2 brunches</b> coming up and <span class="pill butter">＋ 1 vote waiting</span> on you.</p></div>${plan}</div>
 <div class="card feature" style="margin-top:var(--space-5)">
  <div class="l"><div class="row"><span class="pill mint">✓ Confirmed</span><span class="pill">In 7 days</span></div>
   <h2 style="font-size:var(--text-2xl)">Sunday catch-up</h2>
   <div class="row"><span class="ic b">📅</span>Sun, Nov 1 · 11:00 AM</div>
   <div class="row"><span class="ic t">📍</span>Tartine Bakery, Mission</div>
   <div class="row"><span class="ic m">👥</span>4 going</div>
   <div class="row" style="margin-top:6px"><span class="btn primary">Open →</span></div></div>
  <div class="r"><p class="eyebrow" style="color:inherit;opacity:.8">Who's coming</p>
   <div class="who"><div class="p"><span class="mini">EK</span>You<span class="state">✓</span></div><div class="p"><span class="mini">MR</span>Maya R.<span class="state">✓</span></div><div class="p"><span class="mini">DK</span>Devon K.<span class="state">✓</span></div><div class="p"><span class="mini">PS</span>Priya S.<span class="state">✓</span></div><div class="p" style="opacity:.75"><span class="mini">RC</span>Robin C.<span class="state">maybe</span></div></div>
   <p class="small" style="color:inherit;opacity:.8;margin:14px 0 0">1 can't make it</p></div></div>
 <div class="row" style="margin-top:var(--space-6)"><h2 style="font-size:var(--text-xl)">Upcoming</h2><span class="sp"></span><span class="small cnt">2 brunches</span></div>
 <div class="list">
  <div class="item"><div class="tile"><span>NOV</span><b>8</b></div><div class="main"><div class="t">Birthday brunch for Sam <span class="small">(Host)</span></div><div class="small">Sunday vibes, low-key, bring whoever</div></div><div class="meta"><span class="pill butter">Open for votes</span><span class="small">2 going</span></div><span class="arrow">→</span></div>
  <div class="item"><div class="tile tbd"><b>TBD</b></div><div class="main"><div class="t">Mother's Day plans <span class="small">(Host)</span></div><div class="small">Not set yet</div></div><div class="meta"><span class="pill">In the works</span><span class="small">1 going</span></div><span class="arrow">→</span></div>
 </div>
 <div class="row" style="margin-top:var(--space-6)"><h2 style="font-size:var(--text-xl)">Past</h2></div>
 <div class="list" style="opacity:.8"><div class="item"><div class="tile tbd"><span>OCT</span><b>12</b></div><div class="main"><div class="t">Easter brunch with Mom</div><div class="small">Tartine Bakery, Mission</div></div><div class="meta"><span class="pill">Past</span><span class="small">5 went</span></div></div></div>
</main></div>`;

const dashboardEmpty = `
<div class="wash">${nav()}
<main class="page"><div class="row" style="align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:16rem"><p class="eyebrow">Tuesday, October 21</p><h1 class="hero">Afternoon, Evan 👋</h1><p class="small" style="font-size:var(--text-base)">Nothing on the calendar yet — let's fix that.</p></div>${plan}</div>
 <div class="card" style="margin-top:var(--space-5);text-align:center;padding:var(--space-7) var(--space-5);background:linear-gradient(var(--accent-soft),var(--surface))">
  <div style="font-size:64px">🍳☕🥂</div>
  <h2 style="font-size:var(--text-2xl);margin-top:var(--space-4)">The table's set. Now invite some people.</h2>
  <p class="small" style="font-size:var(--text-base);max-width:34rem;margin:8px auto 20px">Pick a spot, pick a time, send it. We'll handle the invites and the votes.</p>${plan}
  <div class="row" style="justify-content:center;gap:var(--space-6);margin-top:var(--space-6);flex-wrap:wrap"><span><b>1</b> Name it</span><span><b>2</b> Pick spots &amp; times</span><span><b>3</b> Round up the crew</span></div></div>
</main></div>`;

const header = (host) => `
 <p class="eyebrow">${host ? '' : ''}</p>`;

const inviteeHdr = `
 <div class="row" style="margin-bottom:var(--space-3)"><span class="av" style="background:var(--pop-lavender);color:var(--pop-lavender-fg)">SL</span><span><b>Sam Liu</b> wants you at brunch</span></div>
 <div class="row" style="gap:var(--space-3);flex-wrap:wrap"><h1 class="hero">Birthday brunch for Sam</h1></div>
 <div class="row" style="margin:10px 0;flex-wrap:wrap"><span class="pill butter">Active</span><span class="pill">◔ Votes coming in · closes in 1d 4h</span></div>
 <p class="small" style="font-size:var(--text-md)">Sunday vibes, low-key, bring whoever 💕</p>`;

const hostHdr = `
 <div class="row" style="flex-wrap:wrap"><span class="pill butter">Active</span><span class="pill">◔ Votes coming in · closes in 1d 4h</span><span class="pill">You're hosting</span></div>
 <div class="row" style="margin:10px 0;align-items:flex-start;flex-wrap:wrap"><h1 class="hero" style="flex:1;min-width:14rem">Birthday brunch for Sam</h1><span class="btn sm">→ Manage brunch</span></div>
 <p class="small" style="font-size:var(--text-md)">Sunday vibes, low-key, bring whoever 💕</p>`;

const opt = (name, addr, n, max, on, lead) => `<div class="opt${on ? ' on' : ''}"><span class="fill" style="width:${Math.round((n / max) * 100)}%"></span><span class="cb${on ? ' on' : ''}">${on ? '✓' : ''}</span><div><b>${name}</b>${lead ? ' <span class="pill butter" style="padding:1px 8px">leading</span>' : ''}<div class="small">${addr}</div></div><span class="count">${n} vote${n === 1 ? '' : 's'}</span></div>`;

const where = (sel) => `<section class="card"><div class="row"><h2 style="margin:0">Where to?</h2><span class="sp"></span><span class="pill dup">◔ closes in 1d 4h</span></div>
 <p class="small helper" style="margin:4px 0 12px">Pick any you like — change it anytime before voting closes.</p>
 <div class="list" style="margin:0">${opt('Tartine Bakery', '600 Guerrero St, San Francisco', 4, 4, sel === 0, true)}${opt('Zazie', '941 Cole St, San Francisco', 2, 4, sel === 1, false)}${opt('Plow', '1299 18th St, San Francisco', 1, 4, false, false)}</div></section>`;
const when = () => `<section class="card"><div class="row"><h2 style="margin:0">When?</h2><span class="sp"></span><span class="pill dup">◔ closes in 1d 4h</span></div>
 <p class="small helper" style="margin:4px 0 12px">Times show in Tartine Bakery's time (Pacific).</p>
 <div class="list" style="margin:0">${opt('Sun, Nov 1 · 11:00 AM', '', 3, 3, true, true)}${opt('Sun, Nov 1 · 12:30 PM', '', 1, 3, false, false)}</div></section>`;

const inviteeRsvp = `<section class="card"><p class="eyebrow">RSVP</p><h2 style="font-size:var(--text-xl)">You in?</h2>
 <div class="rsvp"><span class="btn sel">🙌 I'm in</span><span class="btn">🤔 Maybe</span><span class="btn">😬 Can't</span></div></section>`;

const roster = (host) => `<section class="card"><div class="row"><h2 style="margin:0">Who's coming</h2><span class="sp"></span><span class="small">3 yes · 1 maybe</span></div>
 <div class="who">${(host
    ? [['MR', 'Maya Reyes', '✓ Yes', 'mint'], ['DK', 'Devon Kim', '✓ Yes', 'mint'], ['PS', 'Priya Shah', '✓ Yes', 'mint'], ['RC', 'Robin Cole', 'Maybe', 'butter']]
    : [['EK', 'You', '✓ Yes', 'mint'], ['MR', 'Maya R.', '✓ Yes', 'mint'], ['DK', 'Devon K.', '✓ Yes', 'mint'], ['RC', 'Robin C.', 'Maybe', 'butter']]
  ).map(([i, n, s, t]) => `<div class="p"><span class="mini">${i}</span>${n}<span class="pill ${t}" style="margin-left:auto">${s}</span></div>`).join('')}
 ${host ? `<div class="p" style="opacity:.8"><span class="mini">JM</span>jess.m@example.com<span class="pill" style="margin-left:auto">Hasn't said yet</span></div><div class="p" style="opacity:.8"><span class="mini">SL</span>Sam Liu<span class="pill tomato" style="margin-left:auto">Can't make it</span></div>` : ''}</div>
 ${host ? '' : `<p class="small" style="margin:12px 0 0">1 can't make it · 1 hasn't said yet</p>`}</section>`;

const suggest = `<section class="card"><h2>Suggest a spot</h2><div class="input" style="font-family:var(--font-sans)">🔍 Search for a place</div></section>`;
const invitePanel = `<section class="card"><h2>Invites</h2><div class="list" style="margin:0">
 <div class="item" style="flex-wrap:wrap"><span style="flex:1">jess.m@example.com <span class="pill">pending</span></span><span class="btn sm">Copy link</span><span class="btn sm">Resend</span></div></div>
 <div class="field" style="margin:14px 0 0"><label>Invite more people</label><div class="row"><div class="input" style="flex:1;font-family:var(--font-sans)">name@example.com</div><span class="btn">Round up the crew →</span></div></div></section>`;

const invitee = (phone) => `<div class="wash">${nav('Alex Rivera')}<main class="page">
 <span class="btn sm ghost" style="margin-left:-12px">← Back</span>${inviteeHdr}
 <div class="stack" style="margin-top:var(--space-5)">${inviteeRsvp}
 <div class="cols"><div class="stack">${where(0)}${when()}</div><div class="stack">${roster(false)}${suggest}</div></div></div></main></div>`;

const host = `<div class="wash">${nav()}<main class="page">
 <span class="btn sm ghost" style="margin-left:-12px">← Back to Dashboard</span>${hostHdr}
 <div class="cols" style="margin-top:var(--space-5)"><div class="stack">${where(-1)}${when()}</div><div class="stack">${roster(true)}${invitePanel}</div></div></main></div>`;

const confirmed = `<div class="wash">${nav()}<main class="page">
 <span class="btn sm ghost" style="margin-left:-12px">← Back to Dashboard</span>
 <div class="row" style="flex-wrap:wrap;margin-top:var(--space-3)"><span class="pill mint">Confirmed</span><span class="pill">You're hosting</span></div>
 <div class="row" style="margin:10px 0;flex-wrap:wrap"><h1 class="hero" style="flex:1">Birthday brunch for Sam</h1><span class="btn sm">→ Manage brunch</span></div>
 <div class="banner"><span style="font-size:36px">🥂</span><div><h2>Brunch on. 💕</h2><div>Maya, Devon &amp; Priya are in. Invites went out to the crew.</div></div></div>
 <div class="cols"><div class="stack">
  <section class="card"><div class="row"><h2 style="margin:0">When</h2><span class="sp"></span><span class="pill mint">● Locked in</span></div><div class="result">Sunday, November 1 · 11:00 AM</div><div class="small">Pacific time · 7 days away</div></section>
  <section class="card"><div class="row"><h2 style="margin:0">Where</h2><span class="sp"></span><span class="pill mint">● Locked in</span></div><div class="result">Tartine Bakery</div><div class="small">600 Guerrero St, San Francisco</div></section></div>
 <div class="stack">${roster(true)}</div></div></main></div>`;

const wizard = `<div class="wash"><nav class="top"><div class="mark"><span class="egg">🍳</span>brunchsters</div><span class="sp"></span><span class="btn sm ghost">✕ Cancel</span></nav>
<main class="page" style="max-width:var(--content-width)">
 <p class="eyebrow" style="margin-bottom:var(--space-2)">Plan a Brunch</p>
 <div class="steps"><div class="s on"><span class="dot">🍳</span>Title</div><div class="s"><span class="dot">📍</span>Where</div><div class="s"><span class="dot">🕐</span>When</div><div class="s"><span class="dot">👥</span>Who</div></div>
 <p class="eyebrow">Step 1 of 4 · a name everyone will see</p>
 <h2 style="font-size:var(--text-3xl);line-height:1.1">Give it a name</h2>
 <p class="small" style="font-size:var(--text-md);margin:8px 0 var(--space-5)">Keep it casual — "Sunday catch-up" works just fine.</p>
 <div class="field"><label>Title</label><div class="input focus">Sunday catch-up</div></div>
 <div class="field"><label>Description <span class="small">· optional</span></label><div class="input" style="min-height:96px;font-family:var(--font-sans)">Anything you want guests to know — the vibe, the occasion, dress code…</div></div>
 <div class="row" style="justify-content:space-between;margin-top:var(--space-6);border-top:1px solid var(--line);padding-top:var(--space-5)"><span class="btn">← Cancel</span><span class="btn primary">Continue →</span></div>
</main></div>`;

const pages = { dashboard, 'dashboard-empty': dashboardEmpty, 'brunch-invitee': invitee(), 'brunch-host': host, 'brunch-confirmed': confirmed, wizard };
const shots = [
  ['dashboard', 'desktop'], ['dashboard', 'phone'], ['dashboard-empty', 'desktop'],
  ['brunch-invitee', 'desktop'], ['brunch-invitee', 'phone'], ['brunch-host', 'desktop'],
  ['brunch-confirmed', 'desktop'], ['wizard', 'desktop'], ['wizard', 'phone'],
];

const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400..700,0..100&family=Nunito:wght@400;600;700;800&display=swap">';
const browser = await chromium.launch();
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
for (const [name, size] of shots) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: size === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: size === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    const body = size === 'phone' ? `<div class="phone" style="margin:0 auto">${pages[name]}</div>` : pages[name];
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fonts}<style>${css}</style></head><body>${body}</body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(here, 'out', `${name}-${size}-${scheme}.png`), fullPage: true });
    await ctx.close();
  }
}
await browser.close();
console.log('done');
