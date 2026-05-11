import { useState } from "react";
import { Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SqlModal({ distId, distNombre, onClose }: { distId: number, distNombre: string, onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  
  const sql = `-- Ejecutar en el SQL Editor de Supabase para el tenant: ${distNombre} (ID: ${distId})
CREATE TABLE public.clientes_pdv_v2_d${distId} PARTITION OF public.clientes_pdv_v2 FOR VALUES IN (${distId});
CREATE TABLE public.exhibiciones_v2_d${distId} PARTITION OF public.exhibiciones_v2 FOR VALUES IN (${distId});
CREATE TABLE public.ventas_enriched_v2_d${distId} PARTITION OF public.ventas_enriched_v2 FOR VALUES IN (${distId});
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/50">
          <h3 className="font-bold text-[var(--shelfy-text)]">SQL de Tablas Particionadas</h3>
          <button onClick={onClose} className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-[var(--shelfy-muted)] mb-3">
            Copia y ejecuta este código en el SQL Editor de Supabase para crear las tablas del tenant <strong>{distNombre}</strong>.
          </p>
          <div className="relative">
            <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg text-sm font-mono overflow-x-auto">
              {sql}
            </pre>
            <button 
              onClick={handleCopy}
              className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-md transition-colors backdrop-blur-md"
              title="Copiar SQL"
            >
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/50 flex justify-end">
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
