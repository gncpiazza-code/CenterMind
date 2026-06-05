"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { fetchObjetivoJob, type ObjetivoJobStatus } from "@/lib/api";
import { Progress } from "@/components/ui/progress";

interface Props {
  jobId: string;
  distId: number;
  onDone?: (objetivoId: string) => void;
  onError?: (msg: string) => void;
  onDismiss?: () => void;
}

export function ObjetivoCreateProgress({ jobId, distId, onDone, onError, onDismiss }: Props) {
  const [status, setStatus] = useState<ObjetivoJobStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const poll = useCallback(async () => {
    try {
      const s = await fetchObjetivoJob(jobId, distId);
      setStatus(s);
      if (s.estado === "done") {
        onDone?.(s.id_objetivo);
      } else if (s.estado === "error") {
        onError?.(s.error ?? "Error desconocido");
      }
    } catch {
      // ignore polling errors
    }
  }, [jobId, distId, onDone, onError]);

  useEffect(() => {
    poll();
    const t = setInterval(() => {
      if (status?.estado === "done" || status?.estado === "error") {
        clearInterval(t);
        return;
      }
      poll();
    }, 2000);
    return () => clearInterval(t);
  }, [poll, status?.estado]);

  if (dismissed) return null;
  if (!status) return null;

  const isDone = status.estado === "done";
  const isError = status.estado === "error";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white border rounded-xl shadow-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">
          {isDone ? "Objetivo creado" : isError ? "Error al crear objetivo" : "Creando objetivo…"}
        </span>
        {(isDone || isError) && (
          <button
            onClick={() => { setDismissed(true); onDismiss?.(); }}
            className="text-zinc-400 hover:text-zinc-600 text-xs"
          >
            ✕
          </button>
        )}
      </div>
      <Progress value={status.pct} className="h-2" />
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {isDone ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        ) : isError ? (
          <XCircle className="w-3.5 h-3.5 text-red-500" />
        ) : (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
        )}
        <span>{isError ? (status.error ?? "Error") : (status.mensaje ?? "…")}</span>
      </div>
    </div>
  );
}
