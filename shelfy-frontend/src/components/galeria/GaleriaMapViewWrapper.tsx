"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { GaleriaMapView } from "./GaleriaMapView";
import {
  getGoogleMapsApiKey,
  hasGoogleMapsApiKey,
  isGoogleMapsAlreadyLoaded,
  isGoogleMapsAuthFailed,
  subscribeGoogleMapsAuthFailure,
  ensureGoogleMapsConfigured,
} from "@/lib/googleMapsLoader";
import type { GaleriaMapaPin } from "@/lib/api";

const GaleriaGoogleMapView = dynamic(
  () =>
    import("./GaleriaGoogleMapView").then((m) => ({
      default: m.GaleriaGoogleMapView,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Cargando mapa...
      </div>
    ),
  },
);

export interface GaleriaMapViewWrapperProps {
  vendedorId: number;
  distId: number;
  desde?: string;
  hasta?: string;
  estado?: string;
  onPinSelect: (pin: GaleriaMapaPin) => void;
  sinCoordsCount?: number;
  onOpenSinCoords?: () => void;
  onPinsChange?: (pins: GaleriaMapaPin[]) => void;
  disableMapKeyboard?: boolean;
  className?: string;
}

type MapEngine = "pending" | "google" | "maplibre";

/**
 * Prefiere Google Maps si hay API key; si falla auth (dominio no autorizado), cae a MapLibre.
 */
export function GaleriaMapViewWrapper(props: GaleriaMapViewWrapperProps) {
  const [engine, setEngine] = useState<MapEngine>("pending");

  useEffect(() => {
    ensureGoogleMapsConfigured();
    if (!hasGoogleMapsApiKey() || isGoogleMapsAuthFailed()) {
      setEngine("maplibre");
      return;
    }
    setEngine("google");
    return subscribeGoogleMapsAuthFailure(() => setEngine("maplibre"));
  }, []);

  if (engine === "pending") {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Cargando mapa...
      </div>
    );
  }

  if (engine === "google") {
    return (
      <GaleriaGoogleMapView
        {...props}
        onAuthFailure={() => setEngine("maplibre")}
      />
    );
  }

  const hasKey = Boolean(getGoogleMapsApiKey());
  const hint = !hasKey && !isGoogleMapsAlreadyLoaded();

  return (
    <div className="relative h-full w-full flex flex-col min-h-0">
      {hint && (
        <div className="shrink-0 z-20 mx-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Mapa con Carto (sin Google). Para Google Maps como en Modo Mapa, agregá{" "}
          <code className="bg-white/80 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> en{" "}
          <code className="bg-white/80 px-1 rounded">shelfy-frontend/.env.local</code> y reiniciá{" "}
          <code className="bg-white/80 px-1 rounded">npm run dev</code>.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <GaleriaMapView
          vendedorId={props.vendedorId}
          distId={props.distId}
          desde={props.desde}
          hasta={props.hasta}
          estado={props.estado}
          onPinSelect={props.onPinSelect}
          sinCoordsCount={props.sinCoordsCount}
          onOpenSinCoords={props.onOpenSinCoords}
          onPinsChange={props.onPinsChange}
        />
      </div>
    </div>
  );
}
