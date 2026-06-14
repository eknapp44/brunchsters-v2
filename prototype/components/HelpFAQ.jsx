// HelpContact — minimal help surface required for app store approval.
//
// Three things:
//   1. Help & contact section in Me tab (links to: FAQ, contact us, status)
//   2. Compact HelpFAQ page (mobile + desktop)
//   3. Footer link wherever there's a footer (marketing landing, sign-in screens)
//
// Voice: friend who happens to know how the app works. No "How may we assist you today?"

const HelpFAQ = ({ onBack }) => {
  const faqs = [
    {
      q: "How does voting work?",
      a: "If the host adds more than one spot or time, everyone gets to vote. Pick your favorite — you can change your vote until voting closes. The host can close it early or pick a winner if it's tied.",
    },
    {
      q: "Can I bring a plus-one?",
      a: "Only if the host turned it on for that brunch. You'll see a 'Bringing a +1' checkbox in your RSVP if they did. No checkbox = no plus-ones (for now).",
    },
    {
      q: "Do my friends need the app?",
      a: "Nope. They tap the link, see your invite, and sign in with Apple or Google to RSVP. No app download, no friction.",
    },
    {
      q: "What happens when I sign out?",
      a: "Your brunches stay put. Sign back in anytime and you'll pick up where you left off. (If you delete your account, that's different — see the Danger zone on the Me tab.)",
    },
    {
      q: "How long do invite links work?",
      a: "Until 7 days after the brunch happens. After that, the link shows a 'this brunch is over' page. Hosts can revoke and regenerate a link at any time.",
    },
    {
      q: "Will you sell my data?",
      a: "No. We don't post for you, share your contacts, or sell anything to anyone. We're not in the data business — we're in the brunch business.",
    },
    {
      q: "I found a bug / have an idea / want to yell about brunch",
      a: "Email hi@brunchsters.app — a real person reads it. Usually replies same day.",
    },
  ];

  return (
    <div className="bs-app">
      <TopBar active="help" onCreate={() => {}} />
      <main className="bs-page" style={{ maxWidth: 720 }}>
        <button className="bs-btn ghost" style={{ marginBottom: 20, paddingLeft: 8 }} onClick={onBack}>
          <IconArrowLeft size={16} /> <span>Back</span>
        </button>

        <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>Help</p>
        <h1 className="bs-h1" style={{ marginBottom: 8 }}>Frequently asked stuff</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: '0 0 32px', maxWidth: 560 }}>
          Quick answers to the things we get asked most. Can't find your answer?
          Email <a href="mailto:hi@brunchsters.app" style={{ color: 'var(--accent-fg)', fontWeight: 500 }}>hi@brunchsters.app</a> — a person, not a bot.
        </p>

        <div className="bs-col" style={{ gap: 4, marginBottom: 36 }}>
          {faqs.map((f, i) => <FAQRow key={i} q={f.q} a={f.a} defaultOpen={i === 0} />)}
        </div>

        {/* Contact card */}
        <div className="bs-card" style={{ padding: 22 }}>
          <div className="bs-row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <window.PopSparkle size={32} />
            <div style={{ flex: 1 }}>
              <h3 className="bs-h3" style={{ margin: '0 0 6px' }}>Still need a hand?</h3>
              <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Email us. Real human. Usually same-day reply, faster on weekend mornings (we're literally at brunch).
              </p>
              <a href="mailto:hi@brunchsters.app" className="bs-btn primary">
                <window.PopShare size={18} /> <span>hi@brunchsters.app</span>
              </a>
            </div>
          </div>
        </div>

        {/* Status + meta */}
        <div className="bs-row" style={{ marginTop: 28, gap: 18, color: 'var(--fg-subtle)', fontSize: 12, flexWrap: 'wrap' }}>
          <span className="bs-row" style={{ gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--mint)' }} />
            <span>All systems brunching · <a href="#" style={{ color: 'inherit' }}>status</a></span>
          </span>
          <span>·</span>
          <a href="#" style={{ color: 'inherit' }}>Privacy</a>
          <a href="#" style={{ color: 'inherit' }}>Terms</a>
          <span className="bs-spacer" />
          <span>brunchsters · v0.3</span>
        </div>
      </main>
    </div>
  );
};

const FAQRow = ({ q, a, defaultOpen = false }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <button onClick={() => setOpen(!open)} style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '16px 18px',
      background: open ? 'var(--surface)' : 'transparent',
      border: '1px solid', borderColor: open ? 'var(--line)' : 'transparent',
      borderBottomColor: 'var(--line-soft)',
      borderRadius: open ? 'var(--r-2)' : 0,
      cursor: 'pointer',
      transition: 'background 0.15s var(--ease)',
    }}>
      <div className="bs-row" style={{ alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)', flex: 1 }}>{q}</span>
        <span style={{
          fontSize: 18, color: 'var(--fg-subtle)',
          transform: open ? 'rotate(45deg)' : 'rotate(0)',
          transition: 'transform 0.2s var(--ease)',
          lineHeight: 1, display: 'inline-block', width: 14, textAlign: 'center',
        }}>+</span>
      </div>
      {open && (
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.6 }}>{a}</p>
      )}
    </button>
  );
};

window.HelpFAQ = HelpFAQ;
window.FAQRow = FAQRow;
