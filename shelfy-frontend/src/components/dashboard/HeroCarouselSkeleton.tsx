"use client";

import { cn } from "@/lib/utils";

/** Placeholder del frame IG/iPad mientras cargan datos o imágenes */
export function HeroCarouselSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative w-full h-full min-h-0 flex flex-col rounded-3xl overflow-hidden",
        "bg-neutral-950 ring-1 ring-black/30",
        className,
      )}
      aria-busy
      aria-label="Cargando historias de exhibiciones"
    >
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1 shrink-0">
        <div className="h-3 w-10 rounded bg-white/10 animate-pulse" />
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-14 rounded bg-white/10 animate-pulse" />
          <div className="h-3 w-8 rounded bg-white/10 animate-pulse" />
        </div>
      </div>

      <div className="flex gap-[3px] px-2.5 pt-1 pb-2 shrink-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-[3px] rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full bg-white/35 animate-pulse"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          </div>
        ))}
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950 animate-pulse" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(139,92,246,0.12)_0%,_transparent_65%)]" />

        <div className="absolute top-3 left-3 flex items-center gap-2.5 z-10">
          <div className="size-9 rounded-full bg-white/10 ring-2 ring-white/5 animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3 w-28 rounded bg-white/10 animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-white/10 animate-pulse" />
          </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-4 pb-5 space-y-2 z-10 bg-gradient-to-t from-black/80 to-transparent">
          <div className="h-4 w-3/4 max-w-[220px] rounded bg-white/10 animate-pulse" />
          <div className="h-3 w-1/2 max-w-[140px] rounded bg-white/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
