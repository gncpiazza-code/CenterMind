import type { Query, QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PORTAL_BUNDLE_PREFIX, PERSIST_MAX_AGE_MS, PERSIST_STORAGE_KEY } from "@/lib/portal-cache-config";
import { resetPortalWarmSession } from "@/lib/portal-cache-warm";

let queryClientRef: QueryClient | null = null;

export function registerShelfyQueryClient(client: QueryClient): void {
  queryClientRef = client;
}

export function getShelfyQueryClient(): QueryClient | null {
  return queryClientRef;
}

/** Solo persistir queries de bundles portal (no deudor, no legacy). */
export function shouldDehydratePortalQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length < 2) return false;
  if (key[0] !== PORTAL_BUNDLE_PREFIX) return false;
  if (query.state.status !== "success") return false;
  return true;
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
  buster: process.env.NEXT_PUBLIC_APP_VERSION ?? "shelfy-portal-v1",
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
