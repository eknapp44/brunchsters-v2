// Hook + helpers for responsive behavior inside artboards.
// Each artboard renders into its own wrapper, so we can't trust window width.
// Instead, we measure the nearest .bs-app ancestor and expose its width.

const useContainerWidth = (ref) => {
  const [w, setW] = React.useState(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const el = ref.current.closest('.bs-app') || ref.current;
    const ro = new ResizeObserver(([entry]) => {
      setW(entry.contentRect.width);
    });
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
};

// Public: hook returning { isMobile, width }. Pass `breakpoint` to override (default 720).
const useResponsive = (breakpoint = 720) => {
  const ref = React.useRef(null);
  const width = useContainerWidth(ref);
  const isMobile = width !== null && width < breakpoint;
  return { ref, isMobile, width };
};

window.useResponsive = useResponsive;
