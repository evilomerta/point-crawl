import { useEffect, useState } from "react";

// The global UI zoom applied to the whole app shell. Kept here so overlays that
// render inside that zoom can size themselves against the un-zoomed viewport
// (a `${n / SCALE}vw` width renders at n vw after the zoom multiplies it).
export const SCALE = 1.20;

// True on phone-width viewports. Drives mobile-only layout choices; every use is
// written as `isMobile ? mobileValue : <existing desktop value>`, so when false
// (every desktop, laptop, and tablet >= 641px) the rendered styles are identical
// to before. Read synchronously on first paint (client SPA, no SSR) so phones
// never flash the desktop layout.
export function useIsMobile() {
  const Q = "(max-width: 640px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(Q).matches);
  useEffect(() => {
    const mq = window.matchMedia(Q);
    const onChange = (e) => setM(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", onChange); else mq.removeListener(onChange); };
  }, []);
  return m;
}
