// PhotoUpload — avatar photo upload + crop, used by Me tab.
//
// Scope: profile photo only. Brunch / restaurant photos are deferred to v2.
// The PastBrunchDetail has a placeholder calling that out.
//
// Two states:
//   1. PhotoUploadModal — pick file (drop / browse), then crop preview
//   2. PhotoSrcChooser  — small popover from the avatar's edit (+) button —
//                          "Take photo" / "Choose photo" / "Remove"

const PhotoUploadModal = ({ open, onClose, onSave }) => {
  const [stage, setStage] = React.useState('pick'); // pick | crop
  const [filename, setFilename] = React.useState(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => { if (open) { setStage('pick'); setFilename(null); } }, [open]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) { setFilename(f.name); setStage('crop'); }
  };

  if (!open) return null;

  return (
    <window.ModalShell
      open={open} onClose={onClose}
      title="Update your photo"
      sub="Square works best — JPG or PNG, up to 5 MB."
      footer={stage === 'pick' ? <>
        <button className="bs-btn ghost" onClick={onClose}>Cancel</button>
        <span className="bs-spacer" />
      </> : <>
        <button className="bs-btn ghost" onClick={() => setStage('pick')}>Pick a different one</button>
        <span className="bs-spacer" />
        <button className="bs-btn primary lg" onClick={() => { onSave(); onClose(); }}>
          <window.PopCheck size={18} /> <span>Save photo</span>
        </button>
      </>}
    >
      {stage === 'pick' ? (
        <div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png"
                 onChange={onFile} style={{ display: 'none' }} />
          <button onClick={() => inputRef.current?.click()} style={{
            width: '100%', padding: '36px 24px',
            border: '2px dashed var(--line)', borderRadius: 'var(--r-3)',
            background: 'var(--surface-2)',
            cursor: 'pointer', textAlign: 'center',
            transition: 'border-color 0.15s var(--ease), background 0.15s var(--ease)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--surface-2)'; }}>
            <window.PopPlus size={40} />
            <p style={{ fontSize: 15, fontWeight: 500, margin: '12px 0 4px' }}>
              Drop a photo or click to browse
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0 }}>
              JPG or PNG · up to 5 MB
            </p>
          </button>
        </div>
      ) : (
        // Crop preview — circular mask with a placeholder image
        <div className="bs-col" style={{ gap: 14, alignItems: 'center' }}>
          <div style={{
            width: 200, height: 200, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--accent) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', boxShadow: 'inset 0 0 0 2px var(--accent-strong)',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 500,
                            color: 'var(--accent-fg)' }}>YO</span>
            {/* corner handles to suggest crop */}
            {[['top','left'], ['top','right'], ['bottom','left'], ['bottom','right']].map(([v, h], i) => (
              <span key={i} style={{
                position: 'absolute', [v]: -4, [h]: -4,
                width: 12, height: 12,
                borderRadius: 2, background: 'var(--surface)',
                border: '1.5px solid var(--accent-strong)',
              }} />
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--fg-subtle)', margin: 0, textAlign: 'center' }}>
            {filename || 'your-photo.jpg'} · drag to reposition
          </p>
          <div className="bs-row" style={{ gap: 14, alignItems: 'center', width: '100%' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>−</span>
            <input type="range" min="100" max="200" defaultValue="130"
                   style={{ flex: 1, accentColor: 'var(--accent-strong)' }} />
            <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>+</span>
          </div>
        </div>
      )}
    </window.ModalShell>
  );
};

window.PhotoUploadModal = PhotoUploadModal;
