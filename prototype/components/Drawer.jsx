// Mobile slide-in drawer — anchored left, full-height, scrim backdrop.
// Used by the mobile TopBar's hamburger.

const Drawer = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="bs-drawer" role="dialog" aria-modal="true">
      <div className="bs-drawer-scrim" onClick={onClose} />
      <aside className="bs-drawer-panel">
        {children}
      </aside>
    </div>
  );
};

window.Drawer = Drawer;
