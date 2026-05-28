import { useState } from "react";
import { Copy, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import { buildTenantTablesSql } from "@/lib/tenant-tables-sql";

export function SqlModal({
  distId,
  distNombre,
  onClose,
  requireConfirm = false,
}: {
  distId: number;
  distNombre: string;
  onClose: () => void;
  /** Tras alta de tenant: exige confirmar que el SQL se ejecutó en Supabase. */
  requireConfirm?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [sqlExecuted, setSqlExecuted] = useState(false);

  const sql = buildTenantTablesSql(distId, distNombre);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canClose = !requireConfirm || sqlExecuted;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/50 shrink-0">
          <h3 className="font-bold text-[var(--shelfy-text)]">SQL — tablas tenant</h3>
          {canClose && (
            <button
              onClick={onClose}
              className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
              type="button"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {requireConfirm && (
            <div className="mb-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
              <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
              <p>
                La distribuidora quedó registrada, pero el padrón y el dashboard necesitan las tablas{" "}
                <code className="text-xs font-mono">*_d{distId}</code>. Copiá y ejecutá el SQL en Supabase antes de continuar.
              </p>
            </div>
          )}

          <p className="text-sm text-[var(--shelfy-muted)] mb-3">
            Copiá y ejecutá este script en el <strong>SQL Editor</strong> de Supabase para{" "}
            <strong>{distNombre}</strong> (ID {distId}). Son copias de esquema, no particiones PostgreSQL.
          </p>

          <div className="relative">
            <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre">
              {sql}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-md transition-colors backdrop-blur-md"
              title="Copiar SQL"
            >
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>

          {requireConfirm && (
            <label className="mt-4 flex items-start gap-3 cursor-pointer select-none rounded-lg border border-[var(--shelfy-border)] p-3 hover:bg-[var(--shelfy-panel)]/40">
              <Checkbox
                checked={sqlExecuted}
                onCheckedChange={(v) => setSqlExecuted(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-[var(--shelfy-text)] leading-snug">
                Confirmo que ejecuté este SQL en Supabase y las tablas específicas del tenant (
                <span className="font-mono text-xs">sucursales_v2_d{distId}</span>,{" "}
                <span className="font-mono text-xs">vendedores_v2_d{distId}</span>, etc.) existen.
              </span>
            </label>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/50 flex justify-end gap-2 shrink-0">
          {requireConfirm ? (
            <Button onClick={onClose} disabled={!sqlExecuted}>
              Continuar
            </Button>
          ) : (
            <Button onClick={onClose}>Cerrar</Button>
          )}
        </div>
      </div>
    </div>
  );
}
