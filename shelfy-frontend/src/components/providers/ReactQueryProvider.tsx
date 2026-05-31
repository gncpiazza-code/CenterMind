"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// staleTime constants — import these in useQuery calls for bundle queries,
// since TanStack Query v5 does not support per-key staleTime in defaultOptions.
export const BUNDLE_STALE_MS = 5 * 60 * 1000;  // 5 min — bundles with backend snapshot
export const BUNDLE_GC_MS = 30 * 60 * 1000;    // 30 min — bundle garbage collection

const DEFAULT_STALE = 60 * 1000;  // 1 min — all other queries

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: DEFAULT_STALE,
            gcTime: 30 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
