// 3. Create-brunch wizard — 4 steps with progress indicator.
// Step 1: Title
// Step 2: Where (search + suggestions; multi = vote)
// Step 3: When (time options; multi = vote)
// Step 4: Who (invite emails)
// Then: confirmation success screen with delight flourish.

const STEPS = ['Title', 'Where', 'When', 'Who'];

const ProgressBar = ({ step, total }) => {
  // Use the breakfast-metaphor plate progress bar if available; fall back to pips.
  if (window.PlateProgressBar) {
    return <window.PlateProgressBar step={step} total={total} />;
  }
  return (
    <div className="bs-progress">
      {Array.from({ length: total }).map((_, i) => {
        const cls = i < step ? 'step done' : i === step ? 'step active' : 'step';
        return <div key={i} className={cls} />;
      })}
    </div>
  );
};

const StepHeader = ({ step, total, eyebrow, title, sub }) => (
  <>
    <ProgressBar step={step} total={total} />
    <p className="bs-step-label">
      <span>Step {step + 1} of {total}</span>
      <span style={{ color: 'var(--fg-subtle)' }}>·</span>
      <span style={{ color: 'var(--fg-muted)' }}>{eyebrow}</span>
    </p>
    <h1 style={{
      fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500,
      letterSpacing: '-0.025em', margin: '0 0 10px', textWrap: 'balance'
    }}>{title}</h1>
    {sub && <p style={{ color: 'var(--fg-muted)', fontSize: 15, margin: 0, maxWidth: 480 }}>{sub}</p>}
  </>
);

// ─── Step 1: Title ──────────────────────────────────────────
const Step1Title = ({ value, onChange }) => (
  <>
    <StepHeader step={0} total={4} eyebrow="A name everyone will see"
      title="Give it a name"
      sub="Keep it casual — &ldquo;Sunday catch-up&rdquo; works just fine." />
    <div style={{ marginTop: 32, maxWidth: 540 }}>
      <label className="bs-label">Title</label>
      <input
        className="bs-input"
        style={{ height: 56, fontSize: 18, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
        placeholder="e.g. Sunday catch-up"
        value={value.title || ''}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        autoFocus
      />
      <div style={{ marginTop: 20 }}>
        <label className="bs-label">Description <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>· optional</span></label>
        <textarea className="bs-textarea"
          placeholder="Anything you want guests to know — the vibe, the occasion, dress code…"
          value={value.description || ''}
          onChange={(e) => onChange({ ...value, description: e.target.value })} />
      </div>
    </div>
  </>
);

// ─── Step 2: Where ─────────────────────────────────────────
const Step2Where = ({ value, onChange }) => {
  const selected = value.locations || [];
  const toggle = (loc) => {
    const exists = selected.find(s => s.id === loc.id);
    onChange({ ...value, locations: exists ? selected.filter(s => s.id !== loc.id) : [...selected, loc] });
  };
  return (
    <>
      <StepHeader step={1} total={4} eyebrow="Pick one — or a few to vote on"
        title="Pick a spot"
        sub="Lock in one place, or toss in a few and we'll vote 🗳️" />
      <div style={{ marginTop: 28, maxWidth: 580 }}>
        <div style={{ position: 'relative' }}>
          <IconSearch size={18} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--fg-subtle)' }} />
          <input className="bs-input" placeholder="Search restaurants, cafés…" style={{ paddingLeft: 44 }} />
        </div>

        <p className="bs-eyebrow" style={{ marginTop: 28 }}>From your past brunches</p>
        <div className="bs-col" style={{ gap: 8 }}>
          {window.SAMPLE_LOCATIONS.map((loc) => {
            const isSelected = !!selected.find(s => s.id === loc.id);
            return (
              <button key={loc.id} className={`bs-option${isSelected ? ' selected' : ''}`} onClick={() => toggle(loc)}>
                <div className="radio" />
                <div className="body">
                  <div className="title">{loc.name}</div>
                  <div className="sub">{loc.address} · {loc.neighborhood}</div>
                </div>
                <div className="meta">★ {loc.rating} · {loc.distance}</div>
              </button>
            );
          })}
        </div>

        {selected.length >= 2 && (
          <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: 'var(--r-2)', color: 'var(--accent-fg)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
            <IconSparkle size={16} />
            <span><strong>{selected.length} places</strong> — guests will vote on which to pick.</span>
          </div>
        )}
      </div>
    </>
  );
};

// ─── Step 3: When ──────────────────────────────────────────
const Step3When = ({ value, onChange }) => {
  const selected = value.times || [];
  const toggle = (t) => {
    const exists = selected.find(s => s.id === t.id);
    onChange({ ...value, times: exists ? selected.filter(s => s.id !== t.id) : [...selected, t] });
  };
  return (
    <>
      <StepHeader step={2} total={4} eyebrow="Same logic — one or several"
        title="Pick a time"
        sub="Lock in a time, or float a few and the gang picks." />
      <div style={{ marginTop: 28, maxWidth: 580 }}>
        <div className="bs-row" style={{ gap: 8, marginBottom: 16 }}>
          <button className="bs-btn sm">📅 This weekend</button>
          <button className="bs-btn sm">Next weekend</button>
          <button className="bs-btn sm">+ Custom date</button>
        </div>
        <div className="bs-col" style={{ gap: 8 }}>
          {window.SAMPLE_TIMES.map((t) => {
            const isSelected = !!selected.find(s => s.id === t.id);
            return (
              <button key={t.id} className={`bs-option${isSelected ? ' selected' : ''}`} onClick={() => toggle(t)}>
                <div className="radio" />
                <div className="body">
                  <div className="title">{t.label} · {t.time}</div>
                  <div className="sub">{t.sub}</div>
                </div>
                <div className="meta"><IconClock size={14} style={{ verticalAlign: -2 }} /></div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ─── Step 4: Who ───────────────────────────────────────────
const Step4Who = ({ value, onChange }) => {
  const invited = value.invited || [];
  const toggle = (f) => {
    const exists = invited.find(s => s.id === f.id);
    onChange({ ...value, invited: exists ? invited.filter(s => s.id !== f.id) : [...invited, f] });
  };
  return (
    <>
      <StepHeader step={3} total={4} eyebrow="Last step!"
        title="Round up the crew"
        sub="Pick from past brunches, or add by email." />
      <div style={{ marginTop: 28, maxWidth: 580 }}>
        <label className="bs-label">Invite by email</label>
        <div className="bs-row" style={{ gap: 8 }}>
          <input className="bs-input" placeholder="friend@email.com" style={{ flex: 1 }} />
          <button className="bs-btn">Add</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 8 }}>Or share an invite link after you create the brunch.</p>

        <p className="bs-eyebrow" style={{ marginTop: 28 }}>From past brunches</p>
        <div className="bs-col" style={{ gap: 8 }}>
          {window.SAMPLE_FRIENDS.map((f) => {
            const isSelected = !!invited.find(s => s.id === f.id);
            return (
              <button key={f.id} className={`bs-option${isSelected ? ' selected' : ''}`} onClick={() => toggle(f)}>
                <div className="radio" />
                <div className="bs-avatar" aria-hidden="true" style={{ background: 'var(--surface-2)' }}>{f.initials}</div>
                <div className="body">
                  <div className="title">{f.name}</div>
                  <div className="sub">{f.email}</div>
                </div>
              </button>
            );
          })}
        </div>

        {invited.length > 0 && (
          <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: 'var(--r-2)', color: 'var(--accent-fg)', fontSize: 13 }}>
            <strong>{invited.length} invited</strong> — they'll get an email + link to RSVP.
          </div>
        )}
      </div>
    </>
  );
};

// ─── Success screen ────────────────────────────────────────
const Confetti = () => {
  const bits = Array.from({ length: 14 });
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {bits.map((_, i) => {
        const delay = (i * 60) + 'ms';
        const left = (5 + (i * 6.7) % 90) + '%';
        const top = (10 + (i * 13) % 70) + '%';
        const colors = ['var(--accent-strong)', 'var(--mint)', 'var(--accent-soft)', 'var(--fg)'];
        const color = colors[i % colors.length];
        const size = 8 + (i % 3) * 4;
        return (
          <div key={i} style={{
            position: 'absolute', left, top, width: size, height: size,
            background: color, borderRadius: i % 2 ? '50%' : 2,
            transform: 'scale(0)',
            animation: `bs-confetti-pop 0.6s var(--ease-spring) ${delay} forwards`,
            opacity: 0
          }} />
        );
      })}
    </div>
  );
};

const SuccessScreen = ({ data, onDone }) => (
  <div style={{ position: 'relative', textAlign: 'center', padding: '60px 20px', maxWidth: 560, margin: '0 auto' }}>
    <Confetti />
    <div style={{
      width: 80, height: 80, borderRadius: '50%',
      background: 'var(--mint)', color: 'var(--mint-fg)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      animation: 'bs-confetti-pop 0.5s var(--ease-spring) forwards',
      marginBottom: 24
    }}>
      <IconCheck size={36} />
    </div>
    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, letterSpacing: '-0.025em', margin: '0 0 12px' }}>
      Brunch on! 💕
    </h1>
    <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: '0 0 28px' }}>
      <strong style={{ color: 'var(--fg)' }}>{data.title || 'Your brunch'}</strong> is on the table.
      Invites going out to <strong style={{ color: 'var(--fg)' }}>{(data.invited || []).length} friends</strong> now.
    </p>
    <div className="bs-row" style={{ gap: 10, justifyContent: 'center' }}>
      <button className="bs-btn primary lg" onClick={onDone}>Take me there <IconArrowRight size={16} /></button>
      <button className="bs-btn lg"><IconShare size={15} /> Share link</button>
    </div>
  </div>
);

// ─── Wizard shell ──────────────────────────────────────────
const CreateBrunchWizard = ({ onClose, onComplete, theme, onThemeToggle }) => {
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState({ title: '', description: '', locations: [], times: [], invited: [] });
  const [done, setDone] = React.useState(false);

  const canAdvance = () => {
    if (step === 0) return data.title.trim().length > 0;
    if (step === 1) return (data.locations || []).length > 0;
    if (step === 2) return (data.times || []).length > 0;
    if (step === 3) return (data.invited || []).length > 0;
    return true;
  };

  const next = () => {
    if (step < 3) setStep(step + 1);
    else setDone(true);
  };
  const back = () => step === 0 ? onClose() : setStep(step - 1);

  const ctaLabel = step < 3 ? 'Continue' : 'Send invites';

  return (
    <div className="bs-app">
      <header className="bs-topbar">
        <Wordmark size="md" />
        <button className="bs-btn ghost" onClick={onClose}>
          <IconClose size={16} /> <span>Cancel</span>
        </button>
      </header>
      <main className="bs-page" style={{ maxWidth: 720 }}>
        {!done ? (
          <>
            {step === 0 && <Step1Title value={data} onChange={setData} />}
            {step === 1 && <Step2Where value={data} onChange={setData} />}
            {step === 2 && <Step3When value={data} onChange={setData} />}
            {step === 3 && <Step4Who value={data} onChange={setData} />}
            <div className="bs-row" style={{ marginTop: 40, gap: 10, paddingTop: 24, borderTop: '1px solid var(--line-soft)' }}>
              <button className="bs-btn" onClick={back}>
                <IconArrowLeft size={16} /> <span>{step === 0 ? 'Cancel' : 'Back'}</span>
              </button>
              <div className="bs-spacer" />
              <button className="bs-btn primary lg" onClick={next} disabled={!canAdvance()} style={{ opacity: canAdvance() ? 1 : 0.4 }}>
                <span>{ctaLabel}</span> <IconArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <SuccessScreen data={data} onDone={onComplete} />
        )}
      </main>
    </div>
  );
};

window.CreateBrunchWizard = CreateBrunchWizard;
window.Step1Title = Step1Title;
window.Step2Where = Step2Where;
window.Step3When = Step3When;
window.Step4Who = Step4Who;
window.SuccessScreen = SuccessScreen;
window.ProgressBar = ProgressBar;
