"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Building2,
  Users,
  Map,
  Store,
  Link2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { API_URL, TOKEN_KEY } from "@/lib/constants";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MotorRun {
  id: number;
  estado: "en_curso" | "ok" | "error" | "parcial" | "sin_ejecuciones";
  iniciado_en: string | null;
  finalizado_en: string | null;
  registros: {
    sucursales?: number;
    vendedores?: number;
    rutas?: number;
    clientes?: number;
    exhib_vinculadas?: number;
  } | null;
  error_msg: string | null;
}

interface TabPadronProps {
  distId: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TabPadron({ distId }: TabPadronProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [status, setStatus] = useState<MotorRun | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Carga del estado ──────────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/padron/status/${distId}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error("Error cargando estado del Padrón:", e);
    } finally {
      setLoadingStatus(false);
    }
  }, [distId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Polling mientras el run está en curso
  useEffect(() => {
    if (status?.estado === "en_curso") {
      pollRef.current = setInterval(loadStatus, 4000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.estado, loadStatus]);

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${API_URL}/api/admin/padron/upload/${distId}`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Error en el servidor");

      setUploadMsg({ text: data.message, ok: true });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      // Espera un momento y luego empieza a hacer polling
      setTimeout(loadStatus, 1500);
    } catch (e: unknown) {
      setUploadMsg({
        text: `Error: ${e instanceof Error ? e.message : "desconocido"}`,
        ok: false,
      });
    } finally {
      setUploading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const estadoColor: Record<string, string> = {
    ok:              "text-green-400",
    error:           "text-red-400",
    parcial:         "text-yellow-400",
    en_curso:        "text-blue-400",
    sin_ejecuciones: "text-[var(--shelfy-muted)]",
  };

  const estadoLabel: Record<string, string> = {
    ok:              "Completado",
    error:           "Error",
    parcial:         "Parcial",
    en_curso:        "En curso...",
    sin_ejecuciones: "Sin ejecuciones",
  };

  const metrics = [
    { label: "Sucursales",    icon: Building2, value: status?.registros?.sucursales        },
    { label: "Vendedores",    icon: Users,     value: status?.registros?.vendedores        },
    { label: "Rutas",         icon: Map,       value: status?.registros?.rutas             },
    { label: "Clientes",      icon: Store,     value: status?.registros?.clientes          },
    { label: "Exhib. vinc.", icon: Link2,      value: status?.registros?.exhib_vinculadas  },
  ];

  return (
    <div className="space-y-6">

      {/* Upload */}
      <Card>
        <h2 className="text-[var(--shelfy-text)] font-semibold text-base mb-1">
          Cargar Padrón de Clientes
        </h2>
        <p className="text-[var(--shelfy-muted)] text-sm mb-4">
          Subí el Excel del ERP. Se reconstruirán sucursales, vendedores, rutas y clientes PDV en cascada.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer
            py-10 px-6 transition-colors
            ${dragging
              ? "border-[var(--shelfy-primary)] bg-[var(--shelfy-primary)]/10"
              : "border-[var(--shelfy-border)] hover:border-[var(--shelfy-primary)]/60"
            }
          `}
        >
          <UploadCloud className="w-9 h-9 text-[var(--shelfy-muted)]" />
          {file
            ? <span className="text-sm text-[var(--shelfy-text)] font-medium">{file.name}</span>
            : <>
                <span className="text-sm text-[var(--shelfy-text)]">Arrastrá el archivo acá</span>
                <span className="text-xs text-[var(--shelfy-muted)]">.xlsx / .xls / .csv</span>
              </>
          }
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />

        <div className="flex items-center gap-3 mt-4">
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2"
          >
            {uploading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <UploadCloud className="w-4 h-4" />
            }
            {uploading ? "Subiendo..." : "Procesar Padrón"}
          </Button>
          {file && !uploading && (
            <button
              onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="text-xs text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] underline"
            >
              quitar
            </button>
          )}
        </div>

        {uploadMsg && (
          <div className={`flex items-center gap-2 mt-3 text-sm ${uploadMsg.ok ? "text-green-400" : "text-red-400"}`}>
            {uploadMsg.ok
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />
            }
            {uploadMsg.text}
          </div>
        )}
      </Card>

      {/* Estado de la última ingesta */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[var(--shelfy-text)] font-semibold text-base">
            Última ingesta
          </h2>
          <button
            onClick={loadStatus}
            disabled={loadingStatus}
            className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />
          </button>
        </div>

        {!status || status.estado === "sin_ejecuciones" ? (
          <p className="text-[var(--shelfy-muted)] text-sm">No hay ejecuciones registradas para esta distribuidora.</p>
        ) : (
          <>
            {/* Estado + fechas */}
            <div className="flex flex-wrap gap-4 text-sm mb-5">
              <div>
                <span className="text-[var(--shelfy-muted)] text-xs uppercase tracking-wide">Estado</span>
                <p className={`font-semibold mt-0.5 ${estadoColor[status.estado] ?? ""}`}>
                  {status.estado === "en_curso" && <Loader2 className="inline w-3.5 h-3.5 mr-1 animate-spin" />}
                  {estadoLabel[status.estado] ?? status.estado}
                </p>
              </div>
              <div>
                <span className="text-[var(--shelfy-muted)] text-xs uppercase tracking-wide">Iniciado</span>
                <p className="text-[var(--shelfy-text)] mt-0.5">{fmtDate(status.iniciado_en)}</p>
              </div>
              {status.finalizado_en && (
                <div>
                  <span className="text-[var(--shelfy-muted)] text-xs uppercase tracking-wide">Finalizado</span>
                  <p className="text-[var(--shelfy-text)] mt-0.5">{fmtDate(status.finalizado_en)}</p>
                </div>
              )}
            </div>

            {/* Métricas de registros */}
            {status.registros && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {metrics.map(({ label, icon: Icon, value }) => (
                  <div
                    key={label}
                    className="rounded-lg bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3 flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-1.5 text-[var(--shelfy-muted)]">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-xs">{label}</span>
                    </div>
                    <span className="text-2xl font-bold text-[var(--shelfy-text)]">
                      {value?.toLocaleString("es-AR") ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {status.estado === "error" && status.error_msg && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-mono break-all">
                {status.error_msg}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
