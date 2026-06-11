"use client";

import { useCallback, useSyncExternalStore } from "react";

export type VolumenModo = "bultos" | "desglose";

const STORAGE_KEY = "avance-ventas-volumen-modo";
const EVENT = "avance-volumen-modo";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): VolumenModo {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "desglose" ? "desglose" : "bultos";
  } catch {
    return "bultos";
  }
}

function getServerSnapshot(): VolumenModo {
  return "bultos";
}

/**
 * Preferencia global Bultos ↔ Bultos + unidades (R2), persistida en
 * localStorage y sincronizada entre componentes de la misma pestaña.
 */
export function useVolumenModo(): [VolumenModo, (m: VolumenModo) => void] {
  const modo = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setModo = useCallback((m: VolumenModo) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* storage no disponible */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [modo, setModo];
}
