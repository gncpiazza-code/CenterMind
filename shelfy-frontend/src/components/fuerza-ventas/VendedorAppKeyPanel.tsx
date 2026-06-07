"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Smartphone,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  Loader2,
  KeyRound,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchVendedorAppKeys,
  createVendedorAppKey,
  revokeVendedorAppKey,
  fetchFuerzaVentasVendedores,
  type VendedorAppKey,
  type VendedorAppKeyCreated,
  type FuerzaVentasVendedor,
} from "@/lib/api";
import {
  VendedorAppKeyVendorPicker,
  VendedorAppKeyVendorSummary,
  vendorMetaLine,
} from "@/components/fuerza-ventas/VendedorAppKeyVendorPicker";

interface Props {
  distId: number;
}

function KeyRow({
  appKey,
  vendedor,
  onRevoke,
}: {
  appKey: VendedorAppKey;
  vendedor?: FuerzaVentasVendedor;
  onRevoke: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {vendedor?.nombre_erp ?? appKey.label ?? `Key #${appKey.id}`}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {vendedor ? vendorMetaLine(vendedor) : `Vendedor #${appKey.id_vendedor}`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {appKey.label ? `${appKey.label} · ` : ""}
            <span className="inline-flex items-center gap-1">
              <Smartphone className="h-3 w-3" />
              {appKey.device_count} dispositivo{appKey.device_count !== 1 ? "s" : ""}
            </span>{" "}
            · Creada {new Date(appKey.created_at).toLocaleDateString("es-AR")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {appKey.activo ? (
          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
            Activa
          </Badge>
        ) : (
          <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50 text-xs">
            Revocada
          </Badge>
        )}
        {appKey.activo && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onRevoke(appKey.id)}
            title="Revocar key"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function NewKeyDialog({
  distId,
  open,
  onClose,
  onCreated,
}: {
  distId: number;
  open: boolean;
  onClose: () => void;
  onCreated: (result: VendedorAppKeyCreated) => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);

  const { data: vendedores = [], isLoading: vendedoresLoading } = useQuery({
    queryKey: ["fuerza-ventas-vendedores", distId],
    queryFn: () => fetchFuerzaVentasVendedores(distId),
    enabled: open && distId > 0,
    staleTime: 60_000,
  });

  const selectedVendor = useMemo(
    () => vendedores.find((v) => String(v.id_vendedor) === vendorId),
    [vendedores, vendorId],
  );

  useEffect(() => {
    if (!open) {
      setVendorId("");
      setLabel("");
      setLabelTouched(false);
    }
  }, [open]);

  useEffect(() => {
    if (selectedVendor && !labelTouched) {
      setLabel(selectedVendor.nombre_erp);
    }
  }, [selectedVendor, labelTouched]);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createVendedorAppKey(distId, Number(vendorId), label || undefined),
    onSuccess: (result) => {
      onCreated(result);
      setVendorId("");
      setLabel("");
      setLabelTouched(false);
    },
    onError: () => toast.error("No se pudo crear la key"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva key de acceso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Vendedor</label>
            <VendedorAppKeyVendorPicker
              vendedores={vendedores}
              value={vendorId}
              onChange={setVendorId}
              loading={vendedoresLoading}
            />
            <p className="text-xs text-muted-foreground">
              Buscá por nombre, sucursal, ID vendedor o ID ERP.
            </p>
          </div>

          {selectedVendor ? <VendedorAppKeyVendorSummary vendedor={selectedVendor} /> : null}

          <div className="space-y-1">
            <label className="text-sm font-medium">Etiqueta (opcional)</label>
            <Input
              placeholder="Ej: iPhone Juan Pérez"
              value={label}
              onChange={(e) => {
                setLabelTouched(true);
                setLabel(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Solo para identificar la key en el listado del portal.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutate()}
            disabled={!vendorId || isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Generar key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShowKeyDialog({
  result,
  onClose,
}: {
  result: VendedorAppKeyCreated | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Key generada
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Copiá esta key ahora — no se va a mostrar de nuevo.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted rounded p-2 font-mono break-all select-all">
              {result?.key}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopy} title="Copiar">
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Entregá esta key al vendedor. Puede activarla en la app SHELFYAPP.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Listo, ya la copié
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VendedorAppKeyPanel({ distId }: Props) {
  const qc = useQueryClient();
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<VendedorAppKeyCreated | null>(null);

  const { data: keys = [], isLoading } = useQuery<VendedorAppKey[]>({
    queryKey: ["vendedor-app-keys", distId],
    queryFn: () => fetchVendedorAppKeys(distId),
    enabled: distId > 0,
    staleTime: 30_000,
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ["fuerza-ventas-vendedores", distId],
    queryFn: () => fetchFuerzaVentasVendedores(distId),
    enabled: distId > 0,
    staleTime: 60_000,
  });

  const vendedorById = useMemo(() => {
    const map = new Map<number, FuerzaVentasVendedor>();
    for (const v of vendedores) map.set(v.id_vendedor, v);
    return map;
  }, [vendedores]);

  const revokeMutation = useMutation({
    mutationFn: (keyId: number) => revokeVendedorAppKey(keyId, distId),
    onSuccess: () => {
      toast.success("Key revocada");
      qc.invalidateQueries({ queryKey: ["vendedor-app-keys", distId] });
    },
    onError: () => toast.error("No se pudo revocar la key"),
  });

  const activeKeys = keys.filter((k) => k.activo);
  const revokedKeys = keys.filter((k) => !k.activo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Keys de acceso para la app móvil SHELFYAPP
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeKeys.length} activa{activeKeys.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => setNewKeyOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva key
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : activeKeys.length === 0 && revokedKeys.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Smartphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay keys generadas todavía.</p>
          <p className="text-xs mt-1">Generá una para que el vendedor active la app.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeKeys.map((k) => (
            <KeyRow
              key={k.id}
              appKey={k}
              vendedor={vendedorById.get(k.id_vendedor)}
              onRevoke={(id) => revokeMutation.mutate(id)}
            />
          ))}
          {revokedKeys.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground pt-2">Revocadas</p>
              {revokedKeys.map((k) => (
                <KeyRow
                  key={k.id}
                  appKey={k}
                  vendedor={vendedorById.get(k.id_vendedor)}
                  onRevoke={() => {}}
                />
              ))}
            </>
          )}
        </div>
      )}

      <NewKeyDialog
        distId={distId}
        open={newKeyOpen}
        onClose={() => setNewKeyOpen(false)}
        onCreated={(result) => {
          setNewKeyOpen(false);
          setCreatedKey(result);
          qc.invalidateQueries({ queryKey: ["vendedor-app-keys", distId] });
        }}
      />

      <ShowKeyDialog
        result={createdKey}
        onClose={() => setCreatedKey(null)}
      />
    </div>
  );
}
