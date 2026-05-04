"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Pencil, Trash2, ChevronRight, Check, X,
  UserCheck, Building2, Loader2, Crown,
} from "lucide-react";
import { toast } from "sonner";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  fetchSupervisores, createSupervisor, updateSupervisor, deleteSupervisor,
  fetchSupervisorVendedores, setSupervisorVendedores,
  type Supervisor, type SupervisorVendedor,
} from "@/lib/api";

const ALLOWED_ROLES = ["superadmin", "admin", "directorio"];

// ─── SupervisorCard ───────────────────────────────────────────────────────────

function SupervisorCard({
  sup,
  onEdit,
  onDelete,
  onManageVendedores,
}: {
  sup: Supervisor;
  onEdit: (s: Supervisor) => void;
  onDelete: (s: Supervisor) => void;
  onManageVendedores: (s: Supervisor) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex items-center gap-4">
      <div
        className="size-10 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-sm"
        style={{ background: "var(--shelfy-primary)" }}
      >
        {sup.nombre_display.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--shelfy-text)] truncate">{sup.nombre_display}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {sup.usuario_portal && (
            <span className="text-[10px] text-violet-400 flex items-center gap-1">
              <UserCheck className="w-2.5 h-2.5" />
              {sup.usuario_portal}
            </span>
          )}
          <span className="text-[10px] text-[var(--shelfy-muted)] flex items-center gap-1">
            <Users className="w-2.5 h-2.5" />
            {sup.cantidad_vendedores} vendedor{sup.cantidad_vendedores !== 1 ? "es" : ""}
          </span>
          {!sup.activo && (
            <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-400">Inactivo</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-[var(--shelfy-muted)] hover:text-violet-400"
          title="Asignar vendedores"
          onClick={() => onManageVendedores(sup)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
          title="Editar"
          onClick={() => onEdit(sup)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-[var(--shelfy-muted)] hover:text-rose-400"
          title="Desactivar"
          onClick={() => onDelete(sup)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── VendedorRow ──────────────────────────────────────────────────────────────

function VendedorRow({
  v,
  checked,
  onToggle,
}: {
  v: SupervisorVendedor;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
        checked
          ? "bg-violet-500/10 border border-violet-500/30"
          : "bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] hover:border-violet-500/20"
      }`}
    >
      <div className={`size-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
        checked ? "bg-violet-500 border-violet-500" : "border-[var(--shelfy-border)]"
      }`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--shelfy-text)] truncate">{v.nombre_erp}</p>
        {v.sucursal_nombre && (
          <p className="text-[10px] text-[var(--shelfy-muted)] flex items-center gap-1">
            <Building2 className="w-2.5 h-2.5" />
            {v.sucursal_nombre}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupervisoresPage() {
  const { user, effectiveDistribuidorId } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const distId = effectiveDistribuidorId ?? 0;

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.rol)) router.replace("/dashboard");
  }, [user, router]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<Supervisor | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formNombre, setFormNombre] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Supervisor | null>(null);

  const [vendedoresTarget, setVendedoresTarget] = useState<Supervisor | null>(null);
  const [vendedoresSearch, setVendedoresSearch] = useState("");
  const [selectedVendedores, setSelectedVendedores] = useState<Set<number>>(new Set());

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: supervisores = [], isLoading } = useQuery<Supervisor[]>({
    queryKey: ["supervisores", distId],
    queryFn: () => fetchSupervisores(distId),
    enabled: !!distId,
    staleTime: 60_000,
  });

  const { data: vendedoresList = [], isLoading: loadingVendedores } = useQuery<SupervisorVendedor[]>({
    queryKey: ["supervisor-vendedores", distId, vendedoresTarget?.id],
    queryFn: () => fetchSupervisorVendedores(distId, vendedoresTarget!.id),
    enabled: !!distId && !!vendedoresTarget,
    staleTime: 30_000,
  });

  // Sync selection when list loads
  useEffect(() => {
    if (vendedoresList.length) {
      setSelectedVendedores(new Set(vendedoresList.filter(v => v.asignado).map(v => v.id_vendedor)));
    }
  }, [vendedoresList]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["supervisores", distId] });

  const createMut = useMutation({
    mutationFn: () => createSupervisor(distId, { nombre_display: formNombre }),
    onSuccess: () => { toast.success("Supervisor creado"); setCreateOpen(false); setFormNombre(""); invalidate(); },
    onError: () => toast.error("Error al crear supervisor"),
  });

  const updateMut = useMutation({
    mutationFn: () => updateSupervisor(distId, editTarget!.id, { nombre_display: formNombre }),
    onSuccess: () => { toast.success("Supervisor actualizado"); setEditTarget(null); setFormNombre(""); invalidate(); },
    onError: () => toast.error("Error al actualizar supervisor"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSupervisor(distId, deleteTarget!.id),
    onSuccess: () => { toast.success("Supervisor desactivado"); setDeleteTarget(null); invalidate(); },
    onError: () => toast.error("Error al desactivar"),
  });

  const assignMut = useMutation({
    mutationFn: () => setSupervisorVendedores(distId, vendedoresTarget!.id, Array.from(selectedVendedores)),
    onSuccess: (d) => {
      toast.success(`${d.asignados} vendedor${d.asignados !== 1 ? "es" : ""} asignado${d.asignados !== 1 ? "s" : ""}`);
      setVendedoresTarget(null);
      invalidate();
    },
    onError: () => toast.error("Error al guardar asignación"),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openEdit = (s: Supervisor) => { setEditTarget(s); setFormNombre(s.nombre_display); };
  const openCreate = () => { setFormNombre(""); setCreateOpen(true); };
  const openVendedores = (s: Supervisor) => { setVendedoresTarget(s); setVendedoresSearch(""); setSelectedVendedores(new Set()); };

  const filteredVendedores = vendedoresList.filter(v =>
    v.nombre_erp.toLowerCase().includes(vendedoresSearch.toLowerCase()) ||
    (v.sucursal_nombre || "").toLowerCase().includes(vendedoresSearch.toLowerCase())
  );

  if (!user || !ALLOWED_ROLES.includes(user.rol)) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Supervisores" />

        <main className="flex-1 p-4 md:p-6 pb-28 md:pb-8 overflow-auto">
          <div className="max-w-2xl mx-auto flex flex-col gap-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-[var(--shelfy-text)] tracking-tight flex items-center gap-2">
                  <Crown className="w-5 h-5 text-violet-400" />
                  Supervisores
                </h2>
                <p className="text-xs text-[var(--shelfy-muted)] mt-1">
                  Gestión de supervisores y asignación de vendedores por tenant
                </p>
              </div>
              <Button className="gap-2" onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Nuevo
              </Button>
            </div>

            {/* Lista */}
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
              </div>
            ) : supervisores.length === 0 ? (
              <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-10 flex flex-col items-center gap-2 text-[var(--shelfy-muted)]">
                <Users className="w-8 h-8 opacity-20" />
                <p className="text-sm text-center">No hay supervisores. Creá el primero con el botón de arriba.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {supervisores.map(s => (
                  <SupervisorCard
                    key={s.id}
                    sup={s}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onManageVendedores={openVendedores}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Dialog: Crear ────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo supervisor</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input
              placeholder="Nombre del supervisor..."
              value={formNombre}
              onChange={e => setFormNombre(e.target.value)}
              onKeyDown={e => e.key === "Enter" && formNombre.trim() && createMut.mutate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button disabled={!formNombre.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar ───────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar supervisor</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input
              placeholder="Nombre del supervisor..."
              value={formNombre}
              onChange={e => setFormNombre(e.target.value)}
              onKeyDown={e => e.key === "Enter" && formNombre.trim() && updateMut.mutate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button disabled={!formNombre.trim() || updateMut.isPending} onClick={() => updateMut.mutate()}>
              {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar desactivar ─────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar supervisor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--shelfy-muted)] py-2">
            ¿Desactivar a <strong className="text-[var(--shelfy-text)]">{deleteTarget?.nombre_display}</strong>? No se elimina, solo se marca como inactivo.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="outline"
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> Desactivar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Asignar vendedores ───────────────────────────────────────── */}
      <Dialog open={!!vendedoresTarget} onOpenChange={v => !v && setVendedoresTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              Vendedores — {vendedoresTarget?.nombre_display}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <Input
              placeholder="Buscar vendedor o sucursal..."
              value={vendedoresSearch}
              onChange={e => setVendedoresSearch(e.target.value)}
            />
            <div className="flex items-center justify-between text-[10px] text-[var(--shelfy-muted)] px-1">
              <span>{selectedVendedores.size} seleccionado{selectedVendedores.size !== 1 ? "s" : ""}</span>
              <button
                className="hover:text-[var(--shelfy-text)] transition-colors"
                onClick={() => setSelectedVendedores(new Set())}
              >
                <X className="w-3 h-3 inline mr-0.5" />Limpiar
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1">
              {loadingVendedores ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)
              ) : filteredVendedores.length === 0 ? (
                <p className="text-xs text-[var(--shelfy-muted)] text-center py-6">Sin resultados</p>
              ) : (
                filteredVendedores.map(v => (
                  <VendedorRow
                    key={v.id_vendedor}
                    v={v}
                    checked={selectedVendedores.has(v.id_vendedor)}
                    onToggle={() => {
                      setSelectedVendedores(prev => {
                        const next = new Set(prev);
                        next.has(v.id_vendedor) ? next.delete(v.id_vendedor) : next.add(v.id_vendedor);
                        return next;
                      });
                    }}
                  />
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendedoresTarget(null)}>Cancelar</Button>
            <Button disabled={assignMut.isPending} onClick={() => assignMut.mutate()}>
              {assignMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Guardar asignación</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
