import type { Query, QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PORTAL_BUNDLE_PREFIX, PERSIST_MAX_AGE_MS, PERSIST_STORAGE_KEY } from "@/lib/portal-cache-config";
import { resetPortalWarmSession } from "@/lib/portal-cache-warm";
import type { AvanceVentasResponse, BundleMeta } from "@/lib/api";

const SUPERVISION_PANEL_PREFIX = "supervision-panel" as const;
const AVANCE_VENTAS_SEGMENT = "avance-ventas" as const;

let queryClientRef: QueryClient | null = null;

function bundleHasPersistableData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  const meta = row.meta as BundleMeta | undefined;
  if (!meta?.revalidating) return true;
  const kpis = row.kpis as { total?: number } | undefined;
  if ((kpis?.total ?? 0) > 0) return true;
  if (Array.isArray(row.ranking) && row.ranking.length > 0) return true;
  if (Array.isArray(row.cartas) && row.cartas.length > 0) return true;
  if (Array.isArray(row.pendientes) && row.pendientes.length > 0) return true;
  const cuentas = row.cuentas as { vendedores?: unknown[] } | undefined;
  if (Array.isArray(cuentas?.vendedores) && cuentas.vendedores.length > 0) return true;
  return false;
}

function avanceVentasHasPersistableData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const row = data as AvanceVentasResponse;
  if (Array.isArray(row.ranking_skus) && row.ranking_skus.length > 0) return true;
  if (row.metadatos && (row.metadatos.comprobantes > 0 || row.metadatos.skus_catalogo > 0)) {
    return true;
  }
  return false;
}

export function registerShelfyQueryClient(client: QueryClient): void {
  queryClientRef = client;
}

export function getShelfyQueryClient(): QueryClient | null {
  return queryClientRef;
}

/**
 * Persistir snapshots portal:
 * - bundles (`bundle/*`) — desembarco dashboard/CC/estadísticas/visor
 * - avance ventas (`supervision-panel/avance-ventas/*`) — desembarco modo avance
 */
export function shouldDehydratePortalQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length < 2) return false;
  if (query.state.status !== "success") return false;

  if (key[0] === PORTAL_BUNDLE_PREFIX) {
    return bundleHasPersistableData(query.state.data);
  }

  if (
    key[0] === SUPERVISION_PANEL_PREFIX &&
    key[1] === AVANCE_VENTAS_SEGMENT &&
    key.length >= 7
  ) {
    return avanceVentasHasPersistableData(query.state.data);
  }

  return false;
}

export function createPortalPersister() {
  if (typeof window === "undefined") {
    return createSyncStoragePersister({
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
      key: PERSIST_STORAGE_KEY,
    });
  }
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_STORAGE_KEY,
    serialize: JSON.stringify,
    deserialize: (s) => JSON.parse(s),
  });
}

export const portalPersistOptions = {
  maxAge: PERSIST_MAX_AGE_MS,
  buster: process.env.NEXT_PUBLIC_APP_VERSION ?? "shelfy-portal-v2",
  dehydrateOptions: {
    shouldDehydrateQuery: shouldDehydratePortalQuery,
  },
};

export function clearPortalBundleCache(client?: QueryClient | null): void {
  const qc = client ?? queryClientRef;
  if (qc) {
    void qc.removeQueries({ queryKey: [PORTAL_BUNDLE_PREFIX] });
  }
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(PERSIST_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  resetPortalWarmSession();
}
