"use client";

import { useEffect, useState } from "react";

export const MOBILE_BREAKPOINT_PX = 768;

function getDesktopState() {
  if (typeof window === "undefined") return true;
  return window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
}

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(getDesktopState);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export function useViewport() {
  const isDesktop = useIsDesktop();
  return {
    isDesktop,
    isMobile: !isDesktop,
    breakpointPx: MOBILE_BREAKPOINT_PX,
  };
}
