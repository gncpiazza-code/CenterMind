"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import {
  applyMatchCenterRow,
  applyMatchCenterSafe,
  fetchDistribuidores,
  fetchMatchCenterCandidates,
  type MatchCenterRow,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { AuthResponse } from "@/lib/api";

type DistOption = { id_distribuidor: number; nombre_dist: string };

function canAccessMatchCenter(user: AuthResponse): boolean {
  if (user.is_superadmin || user.rol === "superadmin") return true;
  if (["directorio", "compania"].includes(user.rol)) return true;
  if (user.id_distribuidor === 4 && ["admin", "supervisor"].includes(user.rol)) return true;
  return false;
}

function vendorText(v: MatchCenterRow["current_vendor"] | MatchCenterRow["suggested_vendor"]) {
  if (!v) return "—";
  return `${v.nombre_erp} · ${v.sucursal_nombre}`;
}

export default function MatchCenterPage() {
  const { user } = useAuth();
  const [distOptions, setDistOptions] = useState<DistOption[]>([]);
  const [selectedDist, setSelectedDist] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [rows, setRows] = useState<MatchCenterRow[]>([]);
  const [stats, setStats] = useState<{ total: number; safe: number; blocked: number; review: number }>({
    total: 0,
    safe: 0,
    blocked: 0,
    review: 0,
  });
  const [testIds, setTestIds] = useState<number[]>([]);

  useEffect(() => {
    if (!user || !canAccessMatchCenter(user)) return;
    fetchDistribuidores(false)
      .then((data: any) => {
        const normalized = (data || []).map((d: any) => ({
          id_distribuidor: Number(d.id_distribuidor ?? d.id),
          nombre_dist: String(d.nombre_dist ?? d.nombre ?? `Dist ${d.id_distribuidor ?? d.id}`),
        }));
        setDistOptions(normalized);
        if (normalized.length > 0 && !selectedDist) {
          setSelectedDist(normalized[0].id_distribuidor);
        }
      })
      .catch((e) => {
        console.error(e);
        toast.error("No se pudieron cargar distribuidores.");
      });
  }, [user, selectedDist]);

  const load = async () => {
    if (!selectedDist) return;
    setLoading(true);
    try {
      const payload = await fetchMatchCenterCandidates(selectedDist);
      setRows(payload.rows || []);
      setStats(payload.stats || { total: 0, safe: 0, blocked: 0, review: 0 });
      setTestIds(payload.test_telegram_user_ids || []);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cargar Match Center.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDist) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDist]);

  const safeRows = useMemo(() => rows.filter((r) => r.can_apply && r.suggested_vendor), [rows]);

  const applyOne = async (row: MatchCenterRow) => {
    if (!row.suggested_vendor) return;
    try {
      await applyMatchCenterRow(selectedDist, row.id_integrante, row.suggested_vendor.id_vendedor_v2);
      toast.success(`Aplicado: ${row.nombre_integrante}`);
      await load();
    } catch (e) {
      console.error(e);
      toast.error(`No se pudo aplicar ${row.nombre_integrante}`);
    }
  };

  const applySafeAll = async () => {
    if (!selectedDist) return;
    setApplyingAll(true);
    try {
      const res = await applyMatchCenterSafe(selectedDist);
      toast.success(`Match Center aplicó ${res.applied} ajustes seguros.`);
      await load();
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron aplicar los ajustes seguros.");
    } finally {
      setApplyingAll(false);
    }
  };

  if (!user || !canAccessMatchCenter(user)) return null;

  return (
    <div className="h-screen bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-violet-600" />
                Match Center
              </h1>
              <p className="text-sm text-[var(--shelfy-muted)]">
                Wizard superadmin para saneo Telegram ↔ vendedor ERP con criterio exacto.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-10 rounded-lg border px-3 bg-white"
                value={selectedDist || ""}
                onChange={(e) => setSelectedDist(Number(e.target.value))}
              >
                {distOptions.map((d) => (
                  <option key={d.id_distribuidor} value={d.id_distribuidor}>
                    {d.nombre_dist}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Recargar
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={applySafeAll}
                disabled={applyingAll || safeRows.length === 0}
              >
                {applyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Aplicar seguros ({safeRows.length})
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Total: {stats.total}</Badge>
            <Badge className="bg-emerald-100 text-emerald-700">Safe: {stats.safe}</Badge>
            <Badge className="bg-amber-100 text-amber-700">Review: {stats.review}</Badge>
            <Badge className="bg-red-100 text-red-700">Blocked: {stats.blocked}</Badge>
            <Badge variant="outline">Test IDs: {testIds.join(", ") || "—"}</Badge>
          </div>

          <div className="overflow-auto rounded-2xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-violet-50 text-left">
                <tr>
                  <th className="p-3">Integrante</th>
                  <th className="p-3">Telegram</th>
                  <th className="p-3">Grupo</th>
                  <th className="p-3">Actual</th>
                  <th className="p-3">Binding</th>
                  <th className="p-3">Sugerido</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id_integrante} className="border-t align-top">
                    <td className="p-3">
                      <div className="font-semibold">{r.nombre_integrante || "Sin nombre"}</div>
                      <div className="text-xs text-[var(--shelfy-muted)]">ID integrante: {r.id_integrante}</div>
                    </td>
                    <td className="p-3">
                      <div>{r.telegram_user_id ?? "—"}</div>
                      <div className="text-xs text-[var(--shelfy-muted)]">role: {r.rol_telegram || "—"}</div>
                    </td>
                    <td className="p-3">
                      <div>{r.nombre_grupo || "—"}</div>
                      <div className="text-xs text-[var(--shelfy-muted)]">{r.telegram_group_id ?? "—"}</div>
                    </td>
                    <td className="p-3">
                      <div>{vendorText(r.current_vendor)}</div>
                      <div className="text-xs text-[var(--shelfy-muted)]">{r.id_vendedor_erp_legacy || "—"}</div>
                    </td>
                    <td className="p-3">{vendorText(r.binding_vendor)}</td>
                    <td className="p-3">{vendorText(r.suggested_vendor)}</td>
                    <td className="p-3">
                      <Badge variant={r.status === "safe" ? "default" : r.status === "blocked" ? "destructive" : "secondary"}>
                        {r.reason}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!r.can_apply}
                        onClick={() => applyOne(r)}
                      >
                        Aplicar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}

