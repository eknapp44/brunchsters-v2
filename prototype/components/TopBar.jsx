// Top app chrome — used by every authed screen.
// Responsive: at < 720px container width, collapses to a hamburger
// + drawer, and reduces the primary CTA to an icon-only "+".

const IconMenu = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const TopBar = ({ active = 'home', onNav = () => {}, onCreate = () => {}, theme = 'light', onThemeToggle }) => {
  const { ref, isMobile } = window.useResponsive(720);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  if (isMobile) {
    return (
      <>
        <header className="bs-topbar mobile" ref={ref}>
          <div className="bs-row" style={{ gap: 8 }}>
            <button className="bs-btn ghost" onClick={() => setDrawerOpen(true)}
                    style={{ width: 40, padding: 0 }} aria-label="Menu">
              <IconMenu size={20} />
            </button>
            <Wordmark size="md" />
          </div>
          <div className="bs-row" style={{ gap: 8 }}>
            <button className="bs-btn primary" onClick={onCreate}
                    style={{ width: 40, padding: 0 }} aria-label="Plan a brunch">
              <IconPlus size={18} />
            </button>
            <div className="bs-avatar" aria-label="Yusef O. — profile" role="img">YO</div>
          </div>
        </header>

        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <div className="bs-drawer-head">
            <Wordmark size="md" />
            <button className="bs-btn ghost" onClick={() => setDrawerOpen(false)}
                    style={{ width: 36, padding: 0 }} aria-label="Close menu">
              <IconClose size={18} />
            </button>
          </div>
          <nav className="bs-drawer-nav">
            <a className={active === 'home' ? 'active' : ''}
               onClick={(e) => { e.preventDefault(); setDrawerOpen(false); onNav('home'); }} href="#">Home</a>
          </nav>
          <div className="bs-drawer-foot">
            <div className="bs-row" style={{ gap: 10 }}>
              <div className="bs-avatar" aria-hidden="true">YO</div>
              <div className="bs-col" style={{ gap: 0, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>Yusef O.</span>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>yusef@example.com</span>
              </div>
              {onThemeToggle && (
                <button className="bs-btn ghost" onClick={onThemeToggle}
                        style={{ width: 36, padding: 0 }} aria-label="Toggle theme">
                  {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
                </button>
              )}
            </div>
          </div>
        </Drawer>
      </>
    );
  }

  return (
    <header className="bs-topbar" ref={ref}>
      <div className="bs-row" style={{ gap: 32 }}>
        <Wordmark size="md" />
        <nav className="nav">
          <a className={active === 'home' ? 'active' : ''} onClick={(e) => { e.preventDefault(); onNav('home'); }} href="#">Home</a>
        </nav>
      </div>
      <div className="bs-row" style={{ gap: 12 }}>
        <button className="bs-btn primary" onClick={onCreate}>
          <IconPlus size={16} />
          <span>Plan a brunch</span>
        </button>
        {onThemeToggle && (
          <button className="bs-btn ghost" onClick={onThemeToggle} title="Toggle theme" style={{ width: 40, padding: 0 }}>
            {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        )}
        <div className="bs-avatar" aria-label="Yusef O. — profile" role="img">YO</div>
      </div>
    </header>
  );
};

window.TopBar = TopBar;
