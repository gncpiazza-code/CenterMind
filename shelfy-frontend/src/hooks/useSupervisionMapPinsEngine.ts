"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import type { CuentasSupervision, VendedorSupervision } from "@/lib/api";
import {
  buildSupervisionMapPines,
  supervisionMapPinsSyncKey,
} from "@/lib/supervisionMapPinesBuilder";
import { useSupervisionStore } from "@/store/useSupervisionStore";

const CACHE_DEBOUNCE_MS = 250;

interface UseSupervisionMapPinsEngineOptions {
  distId: number | undefined;
  vendedores: VendedorSupervision[];
  cuentasData: CuentasSupervision | null;
  getVendorColor: (vendorId: number, idx: number) => string;
}

export function useSupervisionMapPinsEngine({
  distId,
  vendedores,
  cuentasData,
  getVendorColor,
}: UseSupervisionMapPinsEngineOptions) {
  const queryClient = useQueryClient();
  const setMapPins = useSupervisionStore((s) => s.setMapPins);
  const { visibleVends, visibleRutas, visibleClientes, vendorColorOverrides } = useSupervisionStore(
    useShallow((s) => ({
      visibleVends: s.visibleVends,
      visibleRutas: s.visibleRutas,
      visibleClientes: s.visibleClientes,
      vendorColorOverrides: s.vendorColorOverrides,
    })),
  );

  const visibilityKey = useMemo(
    () =>
      [
        [...visibleVends].sort((a, b) => a - b).join(","),
        [...visibleRutas].sort((a, b) => a - b).join(","),
        [...visibleClientes].sort((a, b) => a - b).join(","),
      ].join("|"),
    [visibleVends, visibleRutas, visibleClientes],
  );

  const vendorColorsKey = useMemo(
    () => Object.entries(vendorColorOverrides).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join("|"),
    [vendorColorOverrides],
  );

  const lastSyncKeyRef = useRef("");

  const recompute = useCallback(() => {
    if (!distId) {
      if (lastSyncKeyRef.current !== "") {
        lastSyncKeyRef.current = "";
        setMapPins([]);
      }
      return;
    }
    const pins = buildSupervisionMapPines({
      distId,
      vendedores,
      visibleVends,
      visibleRutas,
      visibleClientes,
      cuentasData,
      queryClient,
      getVendorColor,
    });
    const syncKey = `${visibilityKey}::${vendorColorsKey}::${supervisionMapPinsSyncKey(pins)}`;
    if (syncKey === lastSyncKeyRef.current) return;
    lastSyncKeyRef.current = syncKey;
    setMapPins(pins);
  }, [
    distId,
    vendedores,
    cuentasData,
    visibilityKey,
    vendorColorsKey,
    visibleVends,
    visibleRutas,
    visibleClientes,
    queryClient,
    getVendorColor,
    setMapPins,
  ]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    if (!distId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      const qk = event.query?.queryKey;
      if (!Array.isArray(qk) || qk[1] !== distId) return;
      if (qk[0] !== "supervision-clientes" && qk[0] !== "supervision-rutas") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(recompute, CACHE_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [distId, queryClient, recompute]);
}
