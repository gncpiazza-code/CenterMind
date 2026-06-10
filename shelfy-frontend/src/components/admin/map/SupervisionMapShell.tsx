"use client";

import React from "react";
// Layout shell for integrated map mode (R1–R4): map fills the area, chrome and dock float above.

interface SupervisionMapShellProps {
  chrome: React.ReactNode;
  dock?: React.ReactNode;
  dockOpen?: boolean;
  dockWidth?: number;
  children: React.ReactNode;
}

/**
 * Integrated map layout shell: map fills entire area, chrome floats at top,
 * optional slide-in dock from the left. No borders/cards around the map canvas.
 */
export function SupervisionMapShell({
  chrome,
  dock,
  dockOpen = false,
  dockWidth = 288,
  children,
}: SupervisionMapShellProps) {
  return (
    <div className="flex-1 min-h-0 relative overflow-hidden">
      {/* Map content fills everything (z-0) */}
      <div className="absolute inset-0 z-0">
        {children}
      </div>

      {/* Glass chrome overlay — rendered by SupervisionMapToolbar glass variant (z-30) */}
      {chrome}

      {/* Vendor dock — slides from left (z-20) */}
      {dock && (
        <div
          className="absolute left-0 bottom-0 z-20 overflow-y-auto
            bg-[var(--shelfy-bg)]/97 backdrop-blur-md border-r border-white/8
            shadow-xl transition-transform duration-200 ease-out"
          style={{
            top: 52,
            width: dockWidth,
            transform: dockOpen ? 'translateX(0)' : 'translateX(-100%)',
          }}
        >
          {dock}
        </div>
      )}
    </div>
  );
}
