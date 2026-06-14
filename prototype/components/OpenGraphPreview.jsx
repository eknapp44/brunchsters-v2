// OpenGraphPreview — what the share link looks like in iMessage / Slack / etc.
// Renders a faux 1200x630 OG card (the canonical size) at scaled-down preview
// alongside an iMessage-style chat bubble so you can see it in context.

const OgCard = ({ width = 1200, height = 630, scale = 0.5 }) => (
  <div style={{
    width: width * scale, height: height * scale,
    background: 'oklch(0.94 0.025 80)',
    borderRadius: 12, overflow: 'hidden',
    position: 'relative', boxShadow: '0 8px 28px -10px oklch(0.20 0.01 70 / 0.20)',
    border: '1px solid var(--line)',
  }}>
    <svg viewBox="0 0 1200 630" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="og-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="oklch(0.96 0.040 78)"/>
          <stop offset="100%" stopColor="oklch(0.92 0.025 72)"/>
        </linearGradient>
        <radialGradient id="og-spot" cx="78%" cy="30%" r="50%">
          <stop offset="0%"   stopColor="oklch(0.97 0.060 85)" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="oklch(0.97 0.060 85)" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#og-bg)"/>
      <ellipse cx="940" cy="180" rx="380" ry="200" fill="url(#og-spot)"/>

      {/* — egg as art on the right — */}
      <g transform="translate(950 330)">
        <ellipse cx="0" cy="0" rx="170" ry="200" fill="oklch(0.99 0.005 80)" stroke="oklch(0.86 0.020 70)" strokeWidth="2"/>
        <ellipse cx="-32" cy="-22" rx="74" ry="68" fill="var(--accent-strong)"/>
      </g>

      {/* tiny scattered crumbs */}
      <g fill="oklch(0.55 0.040 50)" opacity="0.35">
        <circle cx="120" cy="540" r="3"/>
        <circle cx="146" cy="556" r="2"/>
        <circle cx="98" cy="566" r="2.5"/>
        <circle cx="380" cy="588" r="3"/>
        <circle cx="730" cy="572" r="2"/>
      </g>

      {/* wordmark, top-left */}
      <g transform="translate(80 110)">
        <circle cx="0" cy="0" r="28" fill="none" stroke="oklch(0.25 0.015 70)" strokeWidth="2.5"/>
        <circle cx="-5" cy="-5" r="11" fill="var(--accent-strong)"/>
        <text x="48" y="10" fontFamily="Fraunces, Georgia, serif" fontSize="32" fontWeight="500"
              fill="oklch(0.22 0.015 70)" letterSpacing="-0.5">brunchsters</text>
      </g>

      {/* inviter / occasion */}
      <text x="80" y="280" fontFamily="Inter, system-ui, sans-serif" fontSize="22"
            fill="oklch(0.45 0.020 70)" letterSpacing="1">
        SAM L. INVITED YOU TO
      </text>
      <text x="80" y="370" fontFamily="Fraunces, Georgia, serif" fontSize="64" fontWeight="500"
            fill="oklch(0.22 0.015 70)" letterSpacing="-1.5">
        Birthday brunch
      </text>
      <text x="80" y="440" fontFamily="Fraunces, Georgia, serif" fontSize="64" fontWeight="500"
            fill="oklch(0.22 0.015 70)" letterSpacing="-1.5">
        for Sam
      </text>

      {/* when/where chips */}
      <g transform="translate(80 500)" fontFamily="Inter, system-ui, sans-serif" fontSize="24" fill="oklch(0.30 0.015 70)">
        <g>
          <rect x="0" y="0" width="280" height="48" rx="24" fill="oklch(0.99 0.005 80)" stroke="oklch(0.85 0.020 70)"/>
          <text x="24" y="31">📅 Sun, May 10 · 11:30</text>
        </g>
        <g transform="translate(296 0)">
          <rect x="0" y="0" width="240" height="48" rx="24" fill="oklch(0.99 0.005 80)" stroke="oklch(0.85 0.020 70)"/>
          <text x="24" y="31">📍 Tartine, Mission</text>
        </g>
      </g>

      {/* bottom URL strip */}
      <text x="80" y="600" fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize="18"
            fill="oklch(0.55 0.012 70)">brunchsters.app/b/sam-birthday</text>
    </svg>
  </div>
);

// iMessage-style preview bubble
const IMessagePreview = () => (
  <div style={{
    background: 'oklch(0.96 0.005 250)',
    padding: '18px 14px', borderRadius: 18,
    maxWidth: 380, margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }}>
    <div style={{ fontSize: 11, color: 'oklch(0.45 0.012 250)', textAlign: 'center', marginBottom: 8 }}>
      iMessage · Sam Liu
    </div>
    <div style={{
      background: 'oklch(0.92 0.020 245)',
      padding: '10px 14px', borderRadius: 18,
      borderBottomLeftRadius: 4,
      maxWidth: 280,
      fontSize: 14, color: 'oklch(0.20 0.012 250)',
      marginBottom: 6,
    }}>
      yo come to my birthday brunch!! 🥂
    </div>
    <div style={{
      background: 'oklch(0.92 0.020 245)',
      borderRadius: 14, overflow: 'hidden',
      maxWidth: 300, marginBottom: 4,
      borderBottomLeftRadius: 4,
    }}>
      <div style={{ aspectRatio: '1200 / 630', overflow: 'hidden' }}>
        <OgCard width={1200} height={630} scale={300 / 1200} />
      </div>
      <div style={{ padding: '10px 14px 12px', background: 'oklch(0.94 0.012 250)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.18 0.012 250)', marginBottom: 2 }}>
          Sam invited you to brunch
        </div>
        <div style={{ fontSize: 11.5, color: 'oklch(0.45 0.012 250)' }}>
          brunchsters.app
        </div>
      </div>
    </div>
  </div>
);

const OpenGraphPreview = () => (
  <div style={{ padding: '40px 48px', background: 'var(--bg)' }}>
    <p className="bs-eyebrow">Share preview · Open Graph</p>
    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
      What invites look like when shared
    </h2>
    <p style={{ color: 'var(--fg-muted)', fontSize: 14, margin: '0 0 32px', maxWidth: 620 }}>
      When Sam pastes a brunch link in iMessage, Slack, or anywhere with link unfurling,
      the receiver sees this card before they tap. The actual invite is one click in.
    </p>

    <div className="bs-row" style={{ gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <p className="bs-eyebrow" style={{ marginBottom: 12 }}>The card · 1200×630</p>
        <OgCard scale={0.5} />
      </div>
      <div>
        <p className="bs-eyebrow" style={{ marginBottom: 12 }}>In context</p>
        <IMessagePreview />
      </div>
    </div>
  </div>
);

window.OgCard = OgCard;
window.IMessagePreview = IMessagePreview;
window.OpenGraphPreview = OpenGraphPreview;
