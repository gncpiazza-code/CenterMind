"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wand2, Save, Loader2, User, CalendarDays, Wifi, Upload } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";

import {
  fetchFuerzaVentasVendedor,
  fetchTelegramGruposFuerzaVentas,
  fetchTelegramUsuariosGrupoFuerzaVentas,
  fetchLocations,
  type Location,
  autocompletarFuerzaVentas,
  adoptarLegacyBindingFuerzaVentas,
  updateFuerzaVentasVendedor,
  uploadFotoFuerzaVentas,
  type FuerzaVentasVendedorDetalle,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface VendedorEditSheetProps {
  idVendedor: number | null;
  distId: number;
  open: boolean;
  onClose: () => void;
}

export function VendedorEditSheet({ idVendedor, distId, open, onClose }: VendedorEditSheetProps) {
  const { hasPermiso } = useAuth();
  const canEdit = hasPermiso("action_edit_fuerza_ventas");
  const qc = useQueryClient();

  // Datos del vendedor
  const { data: vendedor, isLoading } = useQuery<FuerzaVentasVendedorDetalle>({
    queryKey: ["fv-vendedor", idVendedor],
    queryFn: () => fetchFuerzaVentasVendedor(idVendedor!),
    enabled: open && idVendedor != null,
    staleTime: 30_000,
  });

  // Grupos Telegram
  const { data: grupos = [] } = useQuery({
    queryKey: ["fv-grupos", distId],
    queryFn: () => fetchTelegramGruposFuerzaVentas(distId),
    enabled: open && canEdit,
    staleTime: 60_000,
  });

  // Ciudades/localidades del tenant
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["fv-locations", distId],
    queryFn: () => fetchLocations(distId),
    enabled: open && canEdit,
    staleTime: 60_000,
  });

  // Form state
  const [fotoUrl, setFotoUrl] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [activo, setActivo] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [adoptingLegacy, setAdoptingLegacy] = useState(false);

  // Usuarios del grupo seleccionado
  const { data: usuarios = [] } = useQuery({
    queryKey: ["fv-usuarios", distId, selectedGroupId],
    queryFn: () => fetchTelegramUsuariosGrupoFuerzaVentas(distId, selectedGroupId ?? undefined),
    enabled: open && canEdit && selectedGroupId != null,
    staleTime: 30_000,
  });

  // Populate form when vendedor loads
  useEffect(() => {
    if (vendedor) {
      setFotoUrl(vendedor.foto_url ?? "");
      setCiudad(vendedor.ciudad ?? "");
      setLocalidad(vendedor.localidad ?? "");
      setFechaIngreso(vendedor.fecha_ingreso ?? "");
      setActivo(vendedor.activo ?? true);
      setSelectedGroupId(vendedor.telegram_group_id ?? null);
      setSelectedUserId(vendedor.telegram_user_id ?? null);
    }
  }, [vendedor]);

  // Autocompletar
  const [autoLoading, setAutoLoading] = useState(false);
  const ciudadesBase = Array.from(
    new Set(
      locations
        .map((loc) => (loc.ciudad ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const ciudades = ciudad && !ciudadesBase.includes(ciudad) ? [...ciudadesBase, ciudad] : ciudadesBase;

  const localidadesBase = Array.from(
    new Set(
      locations
        .filter((loc) => (loc.ciudad ?? "").trim() === ciudad)
        .map((loc) => (loc.label ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const localidades = localidad && !localidadesBase.includes(localidad) ? [...localidadesBase, localidad] : localidadesBase;

  useEffect(() => {
    if (!ciudad) {
      setLocalidad("");
      return;
    }
    if (localidad && !localidades.includes(localidad)) {
      setLocalidad("");
    }
  }, [ciudad, localidad, localidades]);

  const handleAutocompletar = useCallback(async () => {
    if (!idVendedor) return;
    setAutoLoading(true);
    try {
      const sug = await autocompletarFuerzaVentas(idVendedor);
      if (sug.score < 0.3) {
        toast.warning("No se encontró coincidencia suficiente para autocompletar.");
        return;
      }
      const confianzaLabel = { alta: "Alta", media: "Media", baja: "Baja" }[sug.confianza];
      if (sug.sugerencia_telegram_user_id) {
        setSelectedUserId(sug.sugerencia_telegram_user_id);
      }
      if (sug.sugerencia_telegram_group_id) {
        setSelectedGroupId(sug.sugerencia_telegram_group_id);
      }
      toast.success(
        `Autocompletado (confianza ${confianzaLabel} · ${Math.round(sug.score * 100)}%): ${sug.nombre_usuario_sugerido ?? "—"}`
      );
    } catch {
      toast.error("Error al autocompletar. Intenta manualmente.");
    } finally {
      setAutoLoading(false);
    }
  }, [idVendedor]);

  // Guardar
  const mutation = useMutation({
    mutationFn: () =>
      updateFuerzaVentasVendedor(
        idVendedor!,
        { foto_url: fotoUrl || undefined, ciudad: ciudad || undefined, localidad: localidad || undefined, fecha_ingreso: fechaIngreso || undefined, activo },
        selectedUserId != null ? { telegram_user_id: selectedUserId, telegram_group_id: selectedGroupId ?? undefined } : undefined,
      ),
    onSuccess: () => {
      toast.success("Perfil guardado correctamente");
      qc.invalidateQueries({ queryKey: ["fv-vendedores", distId] });
      qc.invalidateQueries({ queryKey: ["fv-vendedor", idVendedor] });
      onClose();
    },
    onError: () => toast.error("Error al guardar el perfil"),
  });

  const initials = vendedor?.nombre_erp
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() ?? "?";

  const handleFotoFile = useCallback(async (file?: File) => {
    if (!file || !idVendedor) return;
    setUploadingFoto(true);
    try {
      const res = await uploadFotoFuerzaVentas(idVendedor, file);
      setFotoUrl(res.foto_url);
      toast.success("Foto subida correctamente");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setUploadingFoto(false);
    }
  }, [idVendedor]);

  const handleAdoptLegacy = useCallback(async () => {
    if (!idVendedor) return;
    setAdoptingLegacy(true);
    try {
      const res = await adoptarLegacyBindingFuerzaVentas(idVendedor);
      setSelectedGroupId(res.telegram_group_id ?? null);
      setSelectedUserId(res.telegram_user_id ?? null);
      toast.success("Se copió la configuración de /admin al nuevo binding");
      qc.invalidateQueries({ queryKey: ["fv-vendedores", distId] });
      qc.invalidateQueries({ queryKey: ["fv-vendedor", idVendedor] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo copiar el mapping legacy");
    } finally {
      setAdoptingLegacy(false);
    }
  }, [idVendedor, qc, distId]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--shelfy-border)" }}>
          <div className="flex items-center gap-3">
            <Avatar className="size-12 rounded-xl shrink-0">
              {fotoUrl && <AvatarImage src={fotoUrl} alt={vendedor?.nombre_erp} className="object-cover" />}
              <AvatarFallback className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white font-black">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="text-base font-black" style={{ color: "var(--shelfy-text)" }}>
                {isLoading ? "Cargando..." : vendedor?.nombre_erp ?? "Vendedor"}
              </SheetTitle>
              <SheetDescription className="text-xs" style={{ color: "var(--shelfy-muted)" }}>
                {vendedor?.sucursal_nombre ?? "—"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin" style={{ color: "var(--shelfy-primary)" }} />
          </div>
        ) : (
          <div className="px-6 py-5 flex flex-col gap-6">
            {/* Perfil */}
            <section>
              <h3 className="text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--shelfy-muted)" }}>
                <User size={12} />
                Perfil
              </h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="foto_url" className="text-xs font-semibold" style={{ color: "var(--shelfy-muted)" }}>
                    Foto del vendedor
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      id="foto_url"
                      value={fotoUrl}
                      onChange={(e) => setFotoUrl(e.target.value)}
                      placeholder="URL pública (opcional)"
                      disabled={!canEdit}
                      className="h-9 text-sm"
                    />
                    {canEdit && (
                      <label className="inline-flex">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFotoFile(e.target.files?.[0])}
                          disabled={uploadingFoto}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingFoto}
                          className="h-9 gap-1.5"
                        >
                          {uploadingFoto ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                          Subir
                        </Button>
                      </label>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ciudad" className="text-xs font-semibold" style={{ color: "var(--shelfy-muted)" }}>
                      Ciudad
                    </Label>
                    <Select
                      value={ciudad || "__none__"}
                      onValueChange={(v) => setCiudad(v === "__none__" ? "" : v)}
                      disabled={!canEdit || ciudades.length === 0}
                    >
                      <SelectTrigger id="ciudad" className="mt-1 h-9 text-sm">
                        <SelectValue placeholder={ciudades.length === 0 ? "Sin ciudades disponibles" : "Seleccionar ciudad"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin asignar</SelectItem>
                        {ciudades.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="localidad" className="text-xs font-semibold" style={{ color: "var(--shelfy-muted)" }}>
                      Localidad
                    </Label>
                    <Select
                      value={localidad || "__none__"}
                      onValueChange={(v) => setLocalidad(v === "__none__" ? "" : v)}
                      disabled={!canEdit || !ciudad || localidades.length === 0}
                    >
                      <SelectTrigger id="localidad" className="mt-1 h-9 text-sm">
                        <SelectValue
                          placeholder={!ciudad ? "Primero elegi ciudad" : localidades.length === 0 ? "Sin localidades disponibles" : "Seleccionar localidad"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin asignar</SelectItem>
                        {localidades.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="fecha_ingreso" className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--shelfy-muted)" }}>
                    <CalendarDays size={11} />
                    Fecha de Ingreso
                  </Label>
                  <div className="mt-1">
                    <DatePicker
                      value={fechaIngreso}
                      onChange={setFechaIngreso}
                      placeholder="Seleccionar fecha"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--shelfy-border)" }}>
                  <Label htmlFor="activo" className="text-sm font-semibold cursor-pointer" style={{ color: "var(--shelfy-text)" }}>
                    Vendedor activo
                  </Label>
                  <Switch
                    id="activo"
                    checked={activo}
                    onCheckedChange={setActivo}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </section>

            <Separator style={{ backgroundColor: "var(--shelfy-border)" }} />

            {/* Binding Telegram */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--shelfy-muted)" }}>
                  <Wifi size={12} />
                  Binding Telegram
                </h3>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    {vendedor?.binding_source === "legacy_admin" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAdoptLegacy}
                        disabled={adoptingLegacy}
                        className="h-7 text-xs font-bold gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                      >
                        {adoptingLegacy ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
                        Mantener Admin Set
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutocompletar}
                      disabled={autoLoading}
                      className="h-7 text-xs font-bold gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
                    >
                      {autoLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      Autocompletar con IA
                    </Button>
                  </div>
                )}
              </div>

              {/* Estado actual */}
              <div className="rounded-xl border px-3 py-2 mb-3 flex items-center gap-2" style={{ borderColor: "var(--shelfy-border)" }}>
                <span className="text-xs font-semibold" style={{ color: "var(--shelfy-muted)" }}>Estado actual:</span>
                {vendedor?.tiene_binding ? (
                  <Badge className="text-[10px] bg-green-100 text-green-700 border border-green-200">
                    {vendedor.binding_source === "legacy_admin" ? "Vinculado (Legacy Admin)" : "Vinculado (Fuerza de Ventas)"}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Sin vincular</Badge>
                )}
                {vendedor?.telegram_user_id && (
                  <span className="text-xs ml-auto" style={{ color: "var(--shelfy-muted)" }}>UID: {vendedor.telegram_user_id}</span>
                )}
              </div>

              {canEdit && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold" style={{ color: "var(--shelfy-muted)" }}>Grupo Telegram</Label>
                    <Select
                      value={selectedGroupId?.toString() ?? ""}
                      onValueChange={(v) => { setSelectedGroupId(Number(v)); setSelectedUserId(null); }}
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="Seleccionar grupo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {grupos.map((g) => (
                          <SelectItem key={g.id} value={g.id.toString()} className="text-sm">
                            {g.nombre_grupo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold" style={{ color: "var(--shelfy-muted)" }}>Usuario Telegram</Label>
                    <Select
                      value={selectedUserId?.toString() ?? ""}
                      onValueChange={(v) => setSelectedUserId(Number(v))}
                      disabled={!selectedGroupId}
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder={selectedGroupId ? "Seleccionar usuario..." : "Primero elige grupo"} />
                      </SelectTrigger>
                      <SelectContent>
                        {usuarios.map((u) => (
                          <SelectItem key={u.id} value={(u.telegram_user_id ?? u.id).toString()} className="text-sm">
                            {u.nombre_integrante}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </section>

            {/* Actions */}
            {canEdit && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                  disabled={mutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-2 font-bold"
                  style={{ background: "var(--shelfy-primary)" }}
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Guardar
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
