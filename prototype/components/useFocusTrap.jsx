// useFocusTrap — applied to ModalShell + BottomSheet to keep Tab cycling
// inside the dialog instead of leaking to the page underneath.
//
// Contract:
//   useFocusTrap(ref, isOpen)
//     - ref      → React ref attached to the dialog container element
//     - isOpen   → boolean; trap activates when true, releases when false
//
// What it does:
//   • On open: snapshots whatever owned focus before, focuses the first
//     focusable inside the container.
//   • While open: Tab from the last element wraps to the first; Shift+Tab
//     from the first wraps to the last.
//   • On close: restores focus to whatever was active before.
//
// Notes:
//   - We re-query focusables on every Tab so the trap survives content
//     that grows/shrinks (e.g. wizard advancing through stages).
//   - We don't auto-focus inputs aggressively — just whatever's first in
//     DOM order. Components that want a specific autofocus target should
//     keep doing their own ref-based focusing (it'll override ours).
//   - Disabled / aria-hidden / type=hidden / tabindex=-1 are excluded.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function useFocusTrap(ref, isOpen) {
  React.useEffect(() => {
    if (!isOpen) return;
    const container = ref.current;
    if (!container) return;

    const prevActive = document.activeElement;

    const getFocusables = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(el => !el.hasAttribute('aria-hidden') && el.offsetParent !== null);

    // Initial focus — first focusable, falling back to the container itself
    // (so SR users still land somewhere inside, not on the page beneath).
    const initial = getFocusables();
    if (initial.length) {
      initial[0].focus();
    } else if (container.tabIndex === -1) {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = getFocusables();
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever owned it before we opened — common
      // pattern is the button that triggered the modal.
      if (prevActive && typeof prevActive.focus === 'function') {
        try { prevActive.focus(); } catch (_) {}
      }
    };
  }, [isOpen]);
}

window.useFocusTrap = useFocusTrap;
