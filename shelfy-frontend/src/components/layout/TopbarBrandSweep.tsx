"use client";

const ICON_PX = 40;

/** Brand estático en topbar desktop — animación sweep desactivada temporalmente. */
export function TopbarBrandSweep() {
  return (
    <div
      className="hidden md:flex items-center justify-center shrink-0"
      style={{ width: ICON_PX, height: ICON_PX }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/WEBICON.svg"
        alt="Shelfy"
        className="object-contain"
        style={{ width: ICON_PX, height: ICON_PX }}
      />
    </div>
  );
}
