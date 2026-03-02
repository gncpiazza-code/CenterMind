"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback } from "react";
import {
  fetchBonoConfig, guardarBonoConfig, bloquearBonoConfig,
  fetchLiquidacion, fetchBonoDetalle,
  type BonoConfig, type PuestoRanking, type LiquidacionVendedor, type DetalleExhibicion,
} from "@/lib/api";
import { ChevronLeft, ChevronRight, Lock, Unlock, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const INPUT_CLS =
  "w-full rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

// ── Detalle expandible de vendedor ────────────────────────────────────────────

function DetalleRow({
  v, distId, anio, mes,
}: {
  v: LiquidacionVendedor;
  distId: number;
  anio: number;
  mes: number;
}) {
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<DetalleExhibicion[]>([]);
  const [loading, setLoading] = useState(false);
  const medals = ["👑", "🥈", "🥉"];

  async function toggleDetalle() {
    if (!open && detalle.length === 0) {
      setLoading(true);
      try {
        const data = await fetchBonoDetalle(distId, 0, anio, mes);
        setDetalle(data);
      } catch {
        // silencioso
      } finally {
        setLoading(false);
      }
    }
    setOpen((x) => !x);
  }

  const ESTADO_COLOR: Record<string, string> = {
    Aprobado:  "text-green-700",
    Destacado: "text-purple-700",
    Rechazado: "text-red-600",
  };

  return (
    <>
      <tr
        className="border-b border-[var(--shelfy-border)] hover:bg-[var(--shelfy-bg)] cursor-pointer transition-colors"
        onClick={toggleDetalle}
      >
        <td className="py-2.5 pr-3 text-center">
          <span className="text-base">{medals[v.puesto - 1] ?? `#${v.puesto}`}</span>
        </td>
        <td className="py-2.5 pr-3 text-[var(--shelfy-text)] font-medium">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronUp size={12} className="text-[var(--shelfy-muted)]" /> : <ChevronDown size={12} className="text-[var(--shelfy-muted)]" />}
            {v.vendedor}
          </div>
        </td>
        <td className="py-2.5 pr-3 text-center text-[var(--shelfy-text)] font-bold tabular-nums">{v.puntos}</td>
        <td className="py-2.5 pr-3 text-center text-green-700 tabular-nums">{v.aprobadas}</td>
        <td className="py-2.5 pr-3 text-center text-purple-700 tabular-nums">{v.destacadas}</td>
        <td className="py-2.5 pr-3 text-center">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.llego_umbral ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
            {v.llego_umbral ? "✓ Sí" : "✗ No"}
          </span>
        </td>
        <td className="py-2.5 text-right font-bold tabular-nums" style={{ color: v.llego_umbral ? "var(--shelfy-success)" : "var(--shelfy-warning)" }}>
          ${v.bono.toFixed(2)}
        </td>
      </tr>
      {open && (
        <tr className="bg-[var(--shelfy-bg)]">
          <td colSpan={7} className="px-4 py-3">
            {loading ? (
              <p className="text-xs text-[var(--shelfy-muted)] py-2">Cargando detalle...</p>
            ) : detalle.length === 0 ? (
              <p className="text-xs text-[var(--shelfy-muted)] py-2">Sin detalle disponible</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--shelfy-muted)]">
                    <th className="text-left pb-1 pr-3">Fecha</th>
                    <th className="text-left pb-1 pr-3">Estado</th>
                    <th className="text-left pb-1 pr-3">Cliente</th>
                    <th className="text-left pb-1">Tipo PDV</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d) => (
                    <tr key={d.id_exhibicion}>
                      <td className="pr-3 py-0.5 text-[var(--shelfy-muted)]">{d.fecha}</td>
                      <td className={`pr-3 py-0.5 font-medium ${ESTADO_COLOR[d.estado] ?? ""}`}>{d.estado}</td>
                      <td className="pr-3 py-0.5 text-[var(--shelfy-muted)]">{d.nro_cliente || "—"}</td>
                      <td className="py-0.5 text-[var(--shelfy-muted)]">{d.tipo_pdv || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function BonosPage() {
  const { user } = useAuth();

  // Período
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes,  setMes]  = useState(now.getMonth() + 1);

  // Config
  const [config, setConfig]     = useState<BonoConfig | null>(null);
  const [umbral, setUmbral]     = useState(0);
  const [bonoFijo, setBonoFijo] = useState(0);
  const [porPunto, setPorPunto] = useState(0);
  const [puestos, setPuestos]   = useState<PuestoRanking[]>([]);
  const [saving, setSaving]     = useState(false);
  const [locking, setLocking]   = useState(false);

  // Liquidación
  const [liquidacion, setLiquidacion] = useState<{ umbral: number; vendedores: LiquidacionVendedor[] } | null>(null);
  const [loadingLiq, setLoadingLiq]   = useState(false);

  const [error, setError]    = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Cargar config ──
  const cargarConfig = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const cfg = await fetchBonoConfig(user.id_distribuidor, anio, mes);
      setConfig(cfg);
      setUmbral(cfg.umbral);
      setBonoFijo(cfg.monto_bono_fijo);
      setPorPunto(cfg.monto_por_punto);
      setPuestos(cfg.puestos);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [user, anio, mes]);

  // ── Cargar liquidación ──
  const cargarLiquidacion = useCallback(async () => {
    if (!user) return;
    setLoadingLiq(true);
    try {
      const liq = await fetchLiquidacion(user.id_distribuidor, anio, mes);
      setLiquidacion(liq);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingLiq(false);
    }
  }, [user, anio, mes]);

  useEffect(() => {
    cargarConfig();
    cargarLiquidacion();
  }, [cargarConfig, cargarLiquidacion]);

  // ── Navegación de mes ──
  function prevMes() {
    if (mes === 1) { setMes(12); setAnio((a) => a - 1); }
    else setMes((m) => m - 1);
  }
  function nextMes() {
    if (mes === 12) { setMes(1); setAnio((a) => a + 1); }
    else setMes((m) => m + 1);
  }

  // ── Puestos ──
  function addPuesto() {
    setPuestos((p) => [...p, { puesto: p.length + 1, premio_si_llego: 0, premio_si_no_llego: 0 }]);
  }
  function removePuesto(i: number) {
    setPuestos((p) => p.filter((_, j) => j !== i).map((x, j) => ({ ...x, puesto: j + 1 })));
  }
  function updatePuesto(i: number, field: keyof PuestoRanking, value: number) {
    setPuestos((p) => p.map((x, j) => j === i ? { ...x, [field]: value } : x));
  }

  // ── Guardar ──
  async function handleGuardar() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await guardarBonoConfig(user.id_distribuidor, {
        anio, mes, umbral, monto_bono_fijo: bonoFijo, monto_por_punto: porPunto, puestos,
      });
      await cargarConfig();
      await cargarLiquidacion();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // ── Bloquear/desbloquear ──
  async function handleBloquear(bloquear: 0 | 1) {
    if (!user) return;
    setLocking(true);
    try {
      await bloquearBonoConfig(user.id_distribuidor, anio, mes, bloquear);
      await cargarConfig();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLocking(false);
    }
  }

  const bloqueado = config?.edicion_bloqueada === 1;
  const isSuperadmin = user?.rol === "superadmin";

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Bonos" />

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
          {/* ── Selector de período ── */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={prevMes} className="w-8 h-8 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] flex items-center justify-center text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-[var(--shelfy-text)] font-semibold text-lg min-w-[160px] text-center">
                {MESES[mes - 1]} {anio}
              </span>
              <button onClick={nextMes} className="w-8 h-8 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] flex items-center justify-center text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>

            {bloqueado && (
              <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                <Lock size={11} /> Edición bloqueada
              </span>
            )}
          </div>

          {error && <p className="text-[var(--shelfy-error)] text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
          {loading && <PageSpinner />}

          {!loading && (
            <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
              {/* ── IZQUIERDA: Configuración ── */}
              <div className="flex flex-col gap-4">
                <Card>
                  <h2 className="text-[var(--shelfy-text)] font-semibold mb-4">Configuración</h2>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5">Umbral (puntos mínimos para bono fijo)</label>
                      <input type="number" min={0} value={umbral} disabled={bloqueado}
                        onChange={(e) => setUmbral(Number(e.target.value))}
                        className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5">Bono fijo si llega al umbral ($)</label>
                      <input type="number" min={0} step={0.01} value={bonoFijo} disabled={bloqueado}
                        onChange={(e) => setBonoFijo(Number(e.target.value))}
                        className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5">Monto por punto si no llega ($)</label>
                      <input type="number" min={0} step={0.01} value={porPunto} disabled={bloqueado}
                        onChange={(e) => setPorPunto(Number(e.target.value))}
                        className={INPUT_CLS} />
                    </div>
                  </div>

                  {/* Puestos */}
                  <div className="mt-5">
                    <h3 className="text-xs text-[var(--shelfy-muted)] uppercase tracking-widest font-semibold mb-3">
                      Premios por puesto
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mb-3">
                        <thead>
                          <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                            <th className="pb-2 pr-2 text-xs">#</th>
                            <th className="pb-2 pr-2 text-xs">Si llegó</th>
                            <th className="pb-2 pr-2 text-xs">Si no llegó</th>
                            {!bloqueado && <th className="pb-2 text-xs"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {puestos.map((p, i) => (
                            <tr key={i} className="border-b border-[var(--shelfy-border)]">
                              <td className="py-1.5 pr-2 text-[var(--shelfy-muted)] font-bold w-8">
                                {["👑","🥈","🥉"][i] ?? `#${p.puesto}`}
                              </td>
                              <td className="py-1.5 pr-2">
                                <input type="number" min={0} step={0.01} value={p.premio_si_llego} disabled={bloqueado}
                                  onChange={(e) => updatePuesto(i, "premio_si_llego", Number(e.target.value))}
                                  className="w-20 rounded border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--shelfy-primary)]" />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input type="number" min={0} step={0.01} value={p.premio_si_no_llego} disabled={bloqueado}
                                  onChange={(e) => updatePuesto(i, "premio_si_no_llego", Number(e.target.value))}
                                  className="w-20 rounded border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--shelfy-primary)]" />
                              </td>
                              {!bloqueado && (
                                <td className="py-1.5">
                                  <button onClick={() => removePuesto(i)} className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] transition-colors p-1">
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                          {puestos.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-3 text-center text-xs text-[var(--shelfy-muted)]">
                                Sin puestos configurados
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {!bloqueado && (
                      <button onClick={addPuesto}
                        className="flex items-center gap-1.5 text-xs text-[var(--shelfy-primary)] hover:opacity-80 transition-opacity">
                        <Plus size={12} /> Agregar puesto
                      </button>
                    )}
                  </div>

                  {/* Botones */}
                  <div className="flex gap-2 mt-5 pt-4 border-t border-[var(--shelfy-border)]">
                    {!bloqueado && (
                      <Button onClick={handleGuardar} loading={saving} size="sm">
                        Guardar configuración
                      </Button>
                    )}
                    {isSuperadmin && (
                      <Button
                        variant="ghost" size="sm"
                        loading={locking}
                        onClick={() => handleBloquear(bloqueado ? 0 : 1)}
                      >
                        {bloqueado ? <><Unlock size={13} /> Desbloquear</> : <><Lock size={13} /> Bloquear</>}
                      </Button>
                    )}
                  </div>
                </Card>

                {/* Info fórmula */}
                <Card>
                  <h3 className="text-xs text-[var(--shelfy-muted)] uppercase tracking-widest font-semibold mb-3">Fórmula de puntos</h3>
                  <div className="space-y-1.5 text-sm text-[var(--shelfy-muted)]">
                    <p>• Aprobado = <span className="text-green-700 font-mono">1 punto</span></p>
                    <p>• Destacado = <span className="text-purple-700 font-mono">2 puntos</span></p>
                    <p className="pt-2 border-t border-[var(--shelfy-border)]">
                      Si puntos ≥ umbral:<br/>
                      <span className="font-mono text-[var(--shelfy-text)]">bono = fijo + premio_llegó[puesto]</span>
                    </p>
                    <p>Si puntos &lt; umbral:<br/>
                      <span className="font-mono text-[var(--shelfy-text)]">bono = pts × por_punto + premio_no_llegó[puesto]</span>
                    </p>
                  </div>
                </Card>
              </div>

              {/* ── DERECHA: Liquidación ── */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[var(--shelfy-text)] font-semibold">
                    Liquidación · {MESES[mes - 1]} {anio}
                  </h2>
                  <button onClick={cargarLiquidacion}
                    className="text-xs text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)] rounded-lg px-2 py-1 transition-colors">
                    Recalcular
                  </button>
                </div>

                {loadingLiq ? (
                  <PageSpinner />
                ) : !liquidacion || liquidacion.vendedores.length === 0 ? (
                  <div className="text-center py-12 text-[var(--shelfy-muted)]">
                    <p className="text-sm">Sin datos para este período.</p>
                    <p className="text-xs mt-1 opacity-60">Asegurate de tener exhibiciones evaluadas en {MESES[mes - 1]}.</p>
                  </div>
                ) : (
                  <>
                    {/* Resumen */}
                    <div className="flex gap-3 mb-4 flex-wrap">
                      <span className="text-xs px-3 py-1 rounded-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] text-[var(--shelfy-muted)]">
                        Umbral: <strong className="text-[var(--shelfy-text)]">{liquidacion.umbral} pts</strong>
                      </span>
                      <span className="text-xs px-3 py-1 rounded-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] text-[var(--shelfy-muted)]">
                        Total bonos: <strong className="text-green-700">
                          ${liquidacion.vendedores.reduce((s, v) => s + v.bono, 0).toFixed(2)}
                        </strong>
                      </span>
                      <span className="text-xs px-3 py-1 rounded-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] text-[var(--shelfy-muted)]">
                        Llegaron: <strong className="text-green-700">
                          {liquidacion.vendedores.filter((v) => v.llego_umbral).length}
                        </strong> / {liquidacion.vendedores.length}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                            <th className="pb-2 pr-3 w-10">#</th>
                            <th className="pb-2 pr-3">Vendedor</th>
                            <th className="pb-2 pr-3 text-center">Pts</th>
                            <th className="pb-2 pr-3 text-center">Ap</th>
                            <th className="pb-2 pr-3 text-center">Dest</th>
                            <th className="pb-2 pr-3 text-center">Umbral</th>
                            <th className="pb-2 text-right">Bono</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liquidacion.vendedores.map((v, i) => (
                            <DetalleRow key={`${v.vendedor}-${i}`} v={v} distId={user?.id_distribuidor ?? 0} anio={anio} mes={mes} />
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[var(--shelfy-border)]">
                            <td colSpan={6} className="pt-3 text-xs text-[var(--shelfy-muted)] font-semibold uppercase">Total</td>
                            <td className="pt-3 text-right font-black text-green-700">
                              ${liquidacion.vendedores.reduce((s, v) => s + v.bono, 0).toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
