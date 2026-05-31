/** Tipos TypeScript para el módulo Repaso Comercial (snapshots quincenales). */

import type { VendorCartaResumen } from "./api";

export type RecapPeriodoTipo = "Q1" | "Q2" | "C";

export interface RecapPeriodoMeta {
  /** Ej: "2026-05-Q1" */
  periodo_key: string;
  /** "2026-05-01" */
  fecha_desde: string;
  /** "2026-05-15" */
  fecha_hasta: string;
  generated_at: string;
  status: "ok" | "partial" | "failed";
}

export interface RecapExhibiciones {
  total_logicas: number;
  aprobadas: number;
  destacadas: number;
  rechazadas: number;
  pendientes: number;
  puntos: number;
}

export interface RecapExhibicionEnviada {
  id_cliente_erp: string;
  id_cliente_pdv?: number | null;
  nombre: string;
  fecha: string;
  estado: string;
}

export interface RecapClienteSinExhibicion {
  id_cliente_erp: string;
  nombre: string;
  localidad: string;
}

export interface RecapExhibicionesDetalle {
  enviadas: RecapExhibicionEnviada[];
  sin_exhibicion: RecapClienteSinExhibicion[];
  sin_exhibicion_total: number;
}

export interface RecapAlta {
  id_cliente_erp: string;
  nombre: string;
  fecha_alta: string;
  localidad: string;
}

export interface RecapBultoTop {
  articulo: string;
  bultos: number;
}

export interface RecapInsight {
  kpi: string;
  delta: number | null;
  titulo?: string;
  mensaje_formal: string;
  tono?: "positivo" | "neutro" | "alerta";
  accion_numerica: string | null;
}

export interface RecapDataQuality {
  erp_sync_ok: boolean;
  telegram_binding_ok: boolean;
  warnings: string[];
}

export interface RecapStory extends RecapPeriodoMeta {
  carta: VendorCartaResumen | null;
  carta_anterior: VendorCartaResumen | null;
  carta_cierre_anterior: VendorCartaResumen | null;
  timeline_cierre: Array<{ periodo_key: string; carta: VendorCartaResumen | null }> | null;
  exhibiciones: RecapExhibiciones;
  exhibiciones_detalle?: RecapExhibicionesDetalle;
  altas: RecapAlta[];
  bultos_top: RecapBultoTop[];
  bultos_total: number;
  compradores: number;
  insights: RecapInsight[];
  data_quality: RecapDataQuality;
}

export interface RecapHistorialItem {
  periodo_key: string;
  generated_at: string;
  status: "ok" | "partial" | "failed";
}

/** Período pendiente de revisión a nivel distribuidora. */
export interface RecapPendienteItem {
  periodo_key: string;
  /** Vendedor con snapshot disponible para previsualizar el repaso. */
  id_vendedor: string;
}

/** Período disponible a nivel distribuidora (historial + pendientes). */
export interface RecapPeriodoDistItem {
  periodo_key: string;
  id_vendedor: string;
  generated_at: string;
  revisado: boolean;
  total_vendedores: number;
}

export interface RecapCarruselVendedor {
  id_vendedor: string;
  nombre: string;
  sucursal: string;
  score: number;
  delta: number | null;
  status: string;
}

export interface RecapCarruselResumen {
  total_vendedores: number;
  score_promedio: number;
  score_max: number;
  score_min: number;
  mejoras: number;
  bajadas: number;
  sin_cambio: number;
  exhibiciones_enviadas: number;
  bultos_total: number;
}

export interface RecapCarrusel {
  periodo_key: string;
  vendedores: RecapCarruselVendedor[];
  resumen: RecapCarruselResumen;
}

export interface RecapSession {
  carrusel: RecapCarrusel;
  story: RecapStory;
}

export interface RecapEvolucionStep {
  periodo_key: string;
  tipo: RecapPeriodoTipo;
  label: string;
  carta: VendorCartaResumen | null;
  available: boolean;
  status?: "ok" | "partial" | "failed" | null;
  generated_at?: string;
}

export interface RecapEvolucion {
  mes: string;
  id_vendedor: string;
  nombre: string;
  sucursal: string;
  steps: RecapEvolucionStep[];
}

export interface RecapEvolucionBundle {
  meta: {
    mes?: string;
    dist_id?: number;
    sucursal?: string | null;
    total?: number;
    cache_hit?: boolean;
    stale?: boolean;
    revalidating?: boolean;
    generated_at?: string;
    age_seconds?: number;
  };
  items: RecapEvolucion[];
}
