"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  Users,
  Bell,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/hooks/useAuth";
import {
  fetchBindingHealth,
  fetchBindingSuggestions,
  fetchBindingGrupos,
  fetchFuerzaVentasVendedores,
  triggerBindingScan,
  type BindingHealthKPIs,
  type AuthResponse,
  type FuerzaVentasVendedor,
} from "@/lib/api";
import { BindingAlertInbox } from "@/components/fuerza-ventas/BindingAlertInbox";
import { GrupoBindingCard } from "@/components/fuerza-ventas/GrupoBindingCard";
import { VendedorCard } from "@/components/fuerza-ventas/VendedorCard";
import { VendedorEditSheet } from "@/components/fuerza-ventas/VendedorEditSheet";

function canAccessFV(user: AuthResponse): boolean {
  if (user.is_superadmin || user.rol === "superadmin") return true;
  if (user.rol === "directorio") return true;
  if (user.id_distribuidor === 4 && ["admin", "supervisor"].includes(user.rol)) return true;
  return false;
}

function KpiChip({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success";
}) {
  const colors: Record<string, string> = {
    default: "bg-muted",
    warning: "bg-amber-50 border border-amber-200",
    success: "bg-green-50 border border-green-200",
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 ${colors[variant]}`}>
      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-2xl font-bold leading-none">{value ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function FuerzaVentasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const distId = user?.id_distribuidor ?? 0;
  const qc = useQueryClient();

  useEffect(() => {
    if (user && !canAccessFV(user)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const [activeTab, setActiveTab] = useState("alertas");
  const [scanning, setScanning] = useState(false);
  const [selectedVendedorId, setSelectedVendedorId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: health, isLoading: healthLoading } = useQuery<BindingHealthKPIs>({
    queryKey: ["binding-health", distId],
    queryFn: () => fetchBindingHealth(distId),
    enabled: distId > 0,
    staleTime: 60_000,
  });

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ["binding-suggestions", distId],
    queryFn: () => fetchBindingSuggestions(distId),
    enabled: distId > 0 && activeTab === "alertas",
    staleTime: 30_000,
  });

  const { data: grupos = [], isLoading: gruposLoading } = useQuery({
    queryKey: ["binding-grupos", distId],
    queryFn: () => fetchBindingGrupos(distId),
    enabled: distId > 0 && activeTab === "grupos",
    staleTime: 60_000,
  });

  const { data: vendedores = [], isLoading: vendedoresLoading } = useQuery<FuerzaVentasVendedor[]>({
    queryKey: ["fv-vendedores", distId],
    queryFn: () => fetchFuerzaVentasVendedores(distId),
    enabled: distId > 0 && activeTab === "vendedores",
    staleTime: 60_000,
  });

  async function handleScan() {
    if (!distId) return;
    setScanning(true);
    try {
      await triggerBindingScan(distId);
      qc.invalidateQueries({ queryKey: ["binding-health", distId] });
      qc.invalidateQueries({ queryKey: ["binding-suggestions", distId] });
      qc.invalidateQueries({ queryKey: ["binding-grupos", distId] });
    } finally {
      setScanning(false);
    }
  }

  if (!user) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fuerza de Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de vinculaciones Telegram ↔ Vendedor ERP
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Escanear ahora
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {healthLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))
        ) : (
          <>
            <KpiChip label="Grupos totales" value={health?.grupos_total} icon={Users} />
            <KpiChip
              label="Vinculados"
              value={health?.grupos_vinculados}
              icon={CheckCircle2}
              variant="success"
            />
            <KpiChip
              label="Con alerta"
              value={health?.grupos_review}
              icon={AlertTriangle}
              variant="warning"
            />
            <KpiChip
              label="Cola pendiente"
              value={health?.sugerencias_pendientes}
              icon={Bell}
              variant={health?.sugerencias_pendientes ? "warning" : "default"}
            />
          </>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="alertas" className="relative">
            Alertas
            {(health?.sugerencias_pendientes ?? 0) > 0 && (
              <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0 h-5">
                {health!.sugerencias_pendientes}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="grupos">
            <Link2 className="h-4 w-4 mr-1.5" />
            Grupos
          </TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
        </TabsList>

        <TabsContent value="alertas" className="mt-4">
          {suggestionsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : (
            <BindingAlertInbox suggestions={suggestions} distId={distId} />
          )}
        </TabsContent>

        <TabsContent value="grupos" className="mt-4">
          {gruposLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : grupos.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">
              No hay grupos registrados.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grupos.map((g) => (
                <GrupoBindingCard key={g.telegram_chat_id} grupo={g} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="vendedores" className="mt-4">
          {vendedoresLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : vendedores.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">
              No hay vendedores disponibles.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {vendedores.map((v) => (
                <VendedorCard
                  key={v.id_vendedor}
                  vendedor={v}
                  onClick={() => {
                    setSelectedVendedorId(v.id_vendedor);
                    setSheetOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <VendedorEditSheet
        idVendedor={selectedVendedorId}
        distId={distId}
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSelectedVendedorId(null);
        }}
      />
    </div>
  );
}
