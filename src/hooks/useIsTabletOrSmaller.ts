import { useState, useEffect } from "react";

// Below this width, a visitor is treated as "mobile or tablet" for layout
// decisions like which Restaurant view opens by default (see
// src/pages/Restaurant.tsx). Matches Tailwind's default `lg` breakpoint -
// wider than src/hooks/use-mobile.jsx's 768px "phone only" cutoff, since
// tablets (e.g. a 1024px-landscape iPad) should get the same default.
const BREAKPOINT = 1024;

export function useIsTabletOrSmaller(): boolean {
  const [isSmall, setIsSmall] = useState(() => typeof window !== "undefined" && window.innerWidth < BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT - 1}px)`);
    const onChange = () => setIsSmall(window.innerWidth < BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isSmall;
}
