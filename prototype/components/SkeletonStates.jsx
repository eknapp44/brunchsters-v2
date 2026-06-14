// SkeletonStates — loading placeholders for fetch states.
//
// Three patterns used across the app:
//   1. DashboardSkeleton  — when the upcoming brunches list is loading
//   2. DetailSkeleton     — host/invitee detail loading
//   3. InboxSkeleton      — inbox list loading
//
// Pattern: subtle pulse animation, masks match the real component shape.
// Honors prefers-reduced-motion (pulse becomes static).

const SkeletonBar = ({ width = '100%', height = 14, radius = 4, style }) => (
  <div className="sk-bar" style={{
    width, height, borderRadius: radius,
    background: 'linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%)',
    backgroundSize: '200% 100%',
    animation: 'sk-pulse 1.4s ease-in-out infinite',
    ...style,
  }} />
);

const SkeletonCircle = ({ size = 32, style }) => (
  <div className="sk-bar" style={{
    width: size, height: size, borderRadius: '50%',
    background: 'linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%)',
    backgroundSize: '200% 100%',
    animation: 'sk-pulse 1.4s ease-in-out infinite',
    ...style,
  }} />
);

const SkeletonStyleTag = () => (
  <style>{`
    @keyframes sk-pulse {
      0%, 100% { background-position: 200% 0; }
      50%      { background-position: -200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sk-bar { animation: none !important; background: var(--surface-2) !important; }
    }
  `}</style>
);

const DashboardSkeleton = () => (
  <div className="bs-app">
    <SkeletonStyleTag />
    <header className="bs-topbar">
      <div className="bs-row" style={{ gap: 32 }}>
        <SkeletonBar width={140} height={20} />
        <div className="bs-row" style={{ gap: 18 }}>
          <SkeletonBar width={50} height={14} />
          <SkeletonBar width={70} height={14} />
        </div>
      </div>
      <div className="bs-row" style={{ gap: 12 }}>
        <SkeletonBar width={120} height={36} radius={8} />
        <SkeletonCircle size={32} />
      </div>
    </header>
    <main className="bs-page">
      {/* Greeting */}
      <div style={{ marginBottom: 36 }}>
        <SkeletonBar width={120} height={12} style={{ marginBottom: 14 }} />
        <SkeletonBar width="60%" height={36} radius={8} style={{ marginBottom: 14 }} />
        <SkeletonBar width="40%" height={16} />
      </div>

      {/* Hero card */}
      <div style={{
        marginBottom: 40, padding: 32, borderRadius: 'var(--r-3)',
        background: 'var(--surface)', border: '1px solid var(--line)',
        display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28,
      }}>
        <div>
          <SkeletonBar width={100} height={20} radius={20} style={{ marginBottom: 16 }} />
          <SkeletonBar width="70%" height={28} radius={6} style={{ marginBottom: 18 }} />
          <SkeletonBar width="80%" height={14} style={{ marginBottom: 10 }} />
          <SkeletonBar width="60%" height={14} style={{ marginBottom: 10 }} />
          <SkeletonBar width="50%" height={14} style={{ marginBottom: 24 }} />
          <SkeletonBar width={140} height={40} radius={8} />
        </div>
        <div className="bs-col" style={{ gap: 12 }}>
          <SkeletonBar width={80} height={12} style={{ marginBottom: 4 }} />
          {[0,1,2,3].map(i => (
            <div key={i} className="bs-row" style={{ gap: 10 }}>
              <SkeletonCircle size={24} />
              <SkeletonBar width="60%" height={14} />
            </div>
          ))}
        </div>
      </div>

      {/* List */}
      <SkeletonBar width={120} height={22} radius={6} style={{ marginBottom: 16 }} />
      <div className="bs-col" style={{ gap: 10 }}>
        {[0,1].map(i => (
          <div key={i} style={{
            padding: 18, borderRadius: 'var(--r-3)',
            background: 'var(--surface)', border: '1px solid var(--line)',
            display: 'flex', gap: 18, alignItems: 'center',
          }}>
            <div style={{ width: 64, height: 56, borderRadius: 'var(--r-2)',
                            background: 'var(--surface-2)' }} />
            <div style={{ flex: 1 }}>
              <SkeletonBar width="60%" height={16} style={{ marginBottom: 8 }} />
              <SkeletonBar width="80%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </main>
  </div>
);

const InboxSkeleton = () => (
  <div style={{ background: 'var(--bg)', minHeight: '100%' }}>
    <SkeletonStyleTag />
    <header style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--line-soft)', background: 'var(--surface)' }}>
      <SkeletonBar width={120} height={26} radius={6} style={{ marginBottom: 8 }} />
      <SkeletonBar width="60%" height={12} />
    </header>
    {[0,1,2,3,4].map(i => (
      <div key={i} className="bs-row" style={{ gap: 14, padding: '14px 16px',
                                                  borderBottom: '1px solid var(--line-soft)' }}>
        <SkeletonCircle size={28} />
        <div style={{ flex: 1 }}>
          <SkeletonBar width="40%" height={12} style={{ marginBottom: 8 }} />
          <SkeletonBar width="85%" height={11} style={{ marginBottom: 6 }} />
          <SkeletonBar width="30%" height={11} />
        </div>
      </div>
    ))}
  </div>
);

const DetailSkeleton = () => (
  <div className="bs-app">
    <SkeletonStyleTag />
    <header className="bs-topbar">
      <SkeletonBar width={140} height={20} />
      <SkeletonCircle size={32} />
    </header>
    <main className="bs-page" style={{ maxWidth: 1100 }}>
      <SkeletonBar width={120} height={14} style={{ marginBottom: 20 }} />
      <div className="bs-row" style={{ gap: 10, marginBottom: 14 }}>
        <SkeletonBar width={120} height={24} radius={20} />
        <SkeletonBar width={100} height={24} radius={20} />
      </div>
      <SkeletonBar width="50%" height={36} radius={6} style={{ marginBottom: 16 }} />
      <SkeletonBar width="70%" height={14} style={{ marginBottom: 36 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28 }}>
        <div className="bs-col" style={{ gap: 20 }}>
          {[0,1].map(i => (
            <div key={i} style={{ padding: 22, borderRadius: 'var(--r-3)',
                                    background: 'var(--surface)', border: '1px solid var(--line)' }}>
              <SkeletonBar width="40%" height={16} radius={4} style={{ marginBottom: 14 }} />
              <SkeletonBar width="80%" height={20} radius={4} style={{ marginBottom: 8 }} />
              <SkeletonBar width="60%" height={12} />
            </div>
          ))}
        </div>
        <div style={{ padding: 22, borderRadius: 'var(--r-3)',
                       background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <SkeletonBar width="50%" height={16} radius={4} style={{ marginBottom: 18 }} />
          {[0,1,2,3].map(i => (
            <div key={i} className="bs-row" style={{ gap: 10, padding: '8px 0' }}>
              <SkeletonCircle size={32} />
              <SkeletonBar width="60%" height={14} />
            </div>
          ))}
        </div>
      </div>
    </main>
  </div>
);

window.SkeletonBar = SkeletonBar;
window.SkeletonCircle = SkeletonCircle;
window.DashboardSkeleton = DashboardSkeleton;
window.InboxSkeleton = InboxSkeleton;
window.DetailSkeleton = DetailSkeleton;
