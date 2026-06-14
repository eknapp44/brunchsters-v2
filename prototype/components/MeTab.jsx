// Me tab — bare bones profile.
// Includes: name/handle, profile pic, intro blurb, Google + Apple connect,
// notification preferences (3 toggles), sign out. Theme toggle stays in topbar.

const MeTab = ({ theme = 'light' }) => {
  const [user, setUser] = React.useState({
    name: 'Yusef Ortega',
    handle: 'yusef',
    intro: 'Mission, SF. Always game for eggs benedict.',
  });
  const [google, setGoogle] = React.useState(true);
  const [apple, setApple] = React.useState(false);
  const [notif, setNotif] = React.useState({
    rsvps: true, votes: true, reminders: true,
  });
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const Toggle = ({ checked, onChange, label }) => (
    <button onClick={() => onChange(!checked)}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            style={{
              width: 40, height: 24,
              borderRadius: 12,
              background: checked ? 'var(--accent-strong)' : 'var(--line)',
              border: 'none', cursor: 'pointer',
              position: 'relative', padding: 0,
              transition: 'background 0.2s var(--ease)',
            }}>
      <div style={{
        position: 'absolute', top: 2,
        left: checked ? 18 : 2,
        width: 20, height: 20,
        borderRadius: '50%', background: 'var(--surface)',
        boxShadow: '0 1px 3px oklch(0.20 0.01 70 / 0.18)',
        transition: 'left 0.2s var(--ease)',
      }} />
    </button>
  );

  return (
    <div className="bs-app">
      <TopBar active="me" onCreate={() => {}} theme={theme} />
      <main className="bs-page" style={{ maxWidth: 720 }}>
        <h1 className="bs-h1" style={{ marginBottom: 28 }}>Me</h1>

        {/* Profile card */}
        <div className="bs-card" style={{ padding: 22, marginBottom: 20 }}>
          <div className="bs-row" style={{ gap: 18, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ position: 'relative' }}>
              <div className="bs-avatar" aria-hidden="true" style={{ width: 72, height: 72, fontSize: 24,
                                                    background: 'var(--accent-soft)',
                                                    color: 'var(--accent-fg)' }}>
                YO
              </div>
              <button style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--surface)', border: '1.5px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }} aria-label="Change photo">
                <window.IconPlus size={14} />
              </button>
            </div>
            <div className="bs-col" style={{ flex: 1, gap: 10 }}>
              <div>
                <label className="bs-label">Name</label>
                <input className="bs-input" value={user.name}
                       onChange={(e) => setUser({ ...user, name: e.target.value })} />
              </div>
              <div>
                <label className="bs-label">Handle</label>
                <div className="bs-row" style={{ gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: 'var(--fg-subtle)' }}>brunchsters.app/</span>
                  <input className="bs-input" value={user.handle}
                         onChange={(e) => setUser({ ...user, handle: e.target.value })}
                         style={{ flex: 1 }} />
                </div>
              </div>
            </div>
          </div>
          <label className="bs-label">Intro · <span style={{ fontWeight: 400, color: 'var(--fg-subtle)' }}>shows on invites</span></label>
          <textarea className="bs-textarea" value={user.intro}
                    onChange={(e) => setUser({ ...user, intro: e.target.value })}
                    style={{ minHeight: 60 }} />
        </div>

        {/* Accounts */}
        <h2 className="bs-h2" style={{ margin: '24px 0 12px', fontSize: 18 }}>Connected accounts</h2>
        <div className="bs-card" style={{ padding: 4, marginBottom: 20 }}>
          {[
            { id: 'g', label: 'Google', state: google, set: setGoogle, glyph: <window.GCalGlyph size={20} /> },
            { id: 'a', label: 'Apple', state: apple, set: setApple,
              glyph: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.5c0-2.86 2.34-4.2 2.44-4.27-1.33-1.95-3.4-2.22-4.13-2.25-1.76-.18-3.43 1.04-4.32 1.04-.9 0-2.27-1.01-3.74-.98-1.92.03-3.7 1.12-4.69 2.84-2 3.47-.51 8.6 1.44 11.42.95 1.38 2.08 2.92 3.56 2.87 1.43-.06 1.97-.92 3.7-.92 1.71 0 2.21.92 3.72.89 1.54-.03 2.51-1.4 3.45-2.79 1.09-1.6 1.53-3.15 1.55-3.23-.03-.01-2.98-1.14-3.01-4.52zM14.49 4.13c.78-.95 1.31-2.26 1.17-3.57-1.13.05-2.5.75-3.3 1.69-.72.84-1.36 2.18-1.19 3.46 1.26.1 2.55-.64 3.32-1.58z"/></svg>
            },
          ].map((acc) => (
            <div key={acc.id} className="bs-row" style={{ gap: 12, padding: '14px 16px',
                                                            borderBottom: acc.id === 'g' ? '1px solid var(--line-soft)' : 'none' }}>
              {acc.glyph}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{acc.label}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                  {acc.state ? `Connected as yusef@${acc.id === 'g' ? 'gmail' : 'icloud'}.com` : 'Not connected'}
                </div>
              </div>
              <button className="bs-btn sm"
                      onClick={() => acc.set(!acc.state)}
                      style={{ color: acc.state ? 'var(--fg-muted)' : 'var(--accent-fg)' }}>
                {acc.state ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          ))}
        </div>

        {/* Notification prefs */}
        <h2 className="bs-h2" style={{ margin: '24px 0 12px', fontSize: 18 }}>Notifications</h2>
        <div className="bs-card" style={{ padding: 4, marginBottom: 20 }}>
          {[
            { key: 'rsvps',     label: 'New RSVPs',  sub: "When someone says yes / maybe / can't make it." },
            { key: 'votes',     label: 'Votes cast', sub: 'When guests vote on time or location.' },
            { key: 'reminders', label: 'Reminders',  sub: 'T-24h pings and voting-closing nudges.' },
          ].map((row, i, arr) => (
            <div key={row.key} className="bs-row" style={{ gap: 12, padding: '14px 16px',
                                                             borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none',
                                                             alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{row.sub}</div>
              </div>
              <Toggle checked={notif[row.key]}
                      label={row.label}
                      onChange={(v) => setNotif({ ...notif, [row.key]: v })} />
            </div>
          ))}
        </div>

        {/* Help & contact */}
        <h2 className="bs-h2" style={{ margin: '24px 0 12px', fontSize: 18 }}>Help &amp; contact</h2>
        <div className="bs-card" style={{ padding: 4, marginBottom: 20 }}>
          <a href="#" className="bs-row" style={{
            gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line-soft)',
            textDecoration: 'none', color: 'var(--fg)',
          }}>
            <window.PopSparkle size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>FAQ</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Quick answers to common stuff.</div>
            </div>
            <IconArrowRight size={16} style={{ color: 'var(--fg-subtle)' }} />
          </a>
          <a href="mailto:hi@brunchsters.app" className="bs-row" style={{
            gap: 12, padding: '14px 16px',
            textDecoration: 'none', color: 'var(--fg)',
          }}>
            <window.PopShare size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Contact us</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>hi@brunchsters.app · a real human replies.</div>
            </div>
            <IconArrowRight size={16} style={{ color: 'var(--fg-subtle)' }} />
          </a>
        </div>

        {/* Sign out */}
        <div className="bs-row" style={{ gap: 10, padding: '24px 0' }}>
          <button className="bs-btn ghost" onClick={() => setSignOutOpen(true)} style={{ color: 'oklch(0.50 0.180 30)' }}>Sign out</button>
          <span className="bs-spacer" />
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>brunchsters · v0.3</span>
        </div>

        {/* Danger zone */}
        <h2 className="bs-h2" style={{ margin: '24px 0 12px', fontSize: 18, color: 'oklch(0.45 0.140 30)' }}>Danger zone</h2>
        <div className="bs-card" style={{ padding: 18, marginBottom: 20,
                                            border: '1px solid oklch(0.85 0.080 30)',
                                            background: 'oklch(0.98 0.012 30)' }}>
          <div className="bs-row" style={{ gap: 14, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>Delete account</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 2, lineHeight: 1.45 }}>
                Cancels upcoming brunches you're hosting. 30 days to change your mind.
              </div>
            </div>
            <button className="bs-btn" onClick={() => setDeleteOpen(true)}
                    style={{ color: 'oklch(0.42 0.140 30)',
                              borderColor: 'oklch(0.78 0.140 30 / 0.5)' }}>
              Delete account
            </button>
          </div>
        </div>

        <window.SignOutModal
          open={signOutOpen}
          onClose={() => setSignOutOpen(false)}
          onConfirm={() => { setSignOutOpen(false); /* would route to Welcome */ }}
        />
        <window.DeleteAccountModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => { setDeleteOpen(false); /* would route to GoodbyeScreen */ }}
        />
      </main>
    </div>
  );
};

window.MeTab = MeTab;
