// Lightweight icon set — strokes only, brand-consistent.
// All icons inherit currentColor so they recolor with text.

const I = ({ children, size = 18, className = '', label }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden={label ? undefined : "true"}
       role={label ? "img" : undefined}
       aria-label={label}
       focusable="false"
       style={{ flexShrink: 0 }}>
    {children}
  </svg>
);

const IconCalendar = (p) => <I {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></I>;
const IconPin = (p) => <I {...p}><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></I>;
const IconUsers = (p) => <I {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="7" r="2.5"/><path d="M22 19c0-2.5-1.5-4.5-4-5.2"/></I>;
const IconCheck = (p) => <I {...p}><path d="M5 12.5l4.5 4.5L19 7"/></I>;
const IconArrowRight = (p) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6"/></I>;
const IconArrowLeft = (p) => <I {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></I>;
const IconPlus = (p) => <I {...p}><path d="M12 5v14M5 12h14"/></I>;
const IconSearch = (p) => <I {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></I>;
const IconClose = (p) => <I {...p}><path d="M6 6l12 12M18 6L6 18"/></I>;
const IconShare = (p) => <I {...p}><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><path d="M16 6l-4-4-4 4M12 2v14"/></I>;
const IconClock = (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></I>;
const IconSparkle = (p) => <I {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></I>;
const IconDots = (p) => <I {...p}><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/></I>;
const IconMoon = (p) => <I {...p}><path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/></I>;
const IconSun = (p) => <I {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></I>;

Object.assign(window, {
  IconCalendar, IconPin, IconUsers, IconCheck, IconArrowRight, IconArrowLeft,
  IconPlus, IconSearch, IconClose, IconShare, IconClock, IconSparkle, IconDots,
  IconMoon, IconSun
});
