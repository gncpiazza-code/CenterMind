import type { SyncStatusEntry } from "@/lib/api";

function parseTs(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatCcLastUpdate(entry: SyncStatusEntry | undefined): string | null {
  const ts = parseTs(entry?.last_run_ok_at ?? entry?.last_updated);
  if (!ts) return null;
  return ts.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "2 h 15 min" hasta próxima corrida programada (AR). */
export function formatCcNextUpdateCountdown(nextRunIso: string | null | undefined, now = new Date()): string | null {
  const target = parseTs(nextRunIso);
  if (!target) return null;
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "en curso o reprogramando";
  const totalMin = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0 && mins > 0) return `${hours} h ${mins} min`;
  if (hours > 0) return `${hours} h`;
  return `${mins} min`;
}
