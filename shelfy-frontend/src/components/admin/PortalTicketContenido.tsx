"use client";

import React from "react";

const URL_RE = /(https?:\/\/[^\s<>"'\]]+)/gi;

function pathLooksLikeImage(href: string): boolean {
  const base = href.split(/[?#]/)[0]?.toLowerCase() ?? "";
  return /\.(jpe?g|png|gif|webp)$/.test(base);
}

/**
 * Mensajes de portal suelen llevar URLs de adjuntos incrustadas en texto plano.
 * Enlaza las URLs y muestra miniatura para imágenes públicas conocidas del bucket.
 */
export function PortalTicketContenido({ text, className }: { text: string; className?: string }) {
  const parts = React.useMemo(() => text.split(URL_RE), [text]);

  return (
    <div
      className={
        className ??
        "text-sm leading-relaxed text-[var(--shelfy-text)] break-words flex flex-col gap-2"
      }
    >
      {parts.map((part, idx) => {
        if (/^https?:\/\//i.test(part.trim())) {
          const href = part.trim();
          const img = pathLooksLikeImage(href);
          return (
            <div key={`u-${idx}-${href.slice(0, 32)}`} className="max-w-full">
              {img ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage */}
                  <img
                    src={href}
                    alt={href}
                    className="max-h-56 max-w-full rounded-lg border border-[var(--shelfy-border)] object-contain bg-muted/20"
                  />
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-xs text-[var(--shelfy-accent)] underline truncate max-w-full"
                  >
                    Abrir archivo
                  </a>
                </>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[var(--shelfy-accent)] underline font-medium"
                >
                  {href}
                </a>
              )}
            </div>
          );
        }
        return (
          <span key={`t-${idx}`} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </div>
  );
}
