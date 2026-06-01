"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState } from "react";
import {
  createPortalPersister,
  portalPersistOptions,
  registerShelfyQueryClient,
} from "@/lib/portal-cache-persist";
import {
  BUNDLE_GC_MS,
  DEFAULT_QUERY_STALE_MS,
} from "@/lib/query-cache-constants";

// Re-export for backward compatibility
export { BUNDLE_STALE_MS, BUNDLE_GC_MS } from "@/lib/query-cache-constants";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_QUERY_STALE_MS,
        gcTime: BUNDLE_GC_MS,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = makeQueryClient();
    registerShelfyQueryClient(client);
    return client;
  });

  const [persister] = useState(() => createPortalPersister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        ...portalPersistOptions,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
