"use client";

import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/constants";

export type ShieldState = "healthy" | "degraded" | "open";

export interface SystemHealth {
  status: "online" | "degraded";
  supabase_ok: boolean;
  shield?: {
    state: ShieldState;
    failures_in_window?: number;
    open_remaining_seconds?: number;
    last_probe_ms?: number | null;
  };
}

async function fetchSystemHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!res.ok) {
    return { status: "degraded", supabase_ok: false, shield: { state: "open" } };
  }
  return res.json();
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: fetchSystemHealth,
    refetchInterval: (q) => {
      const st = q.state.data?.shield?.state;
      if (st === "open" || st === "degraded") return 15_000;
      return 60_000;
    },
    staleTime: 10_000,
    retry: 1,
  });
}
