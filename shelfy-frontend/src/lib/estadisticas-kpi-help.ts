/** Textos de ayuda para KPIs y vendedor ideal (Estadísticas). */

export type EstadisticasKpiKey =
  | "pdvs"
  | "altas"
  | "exhibiciones"
  | "compradores"
  | "bultos"
  | "cobertura"
  | "objetivos";

export interface EstadisticasKpiHelpItem {
  key: EstadisticasKpiKey;
  label: string;
  description: string;
}

export const ESTADISTICAS_KPI_HELP: EstadisticasKpiHelpItem[] = [
  {
    key: "pdvs",
    label: "PDVs",
    description:
      "Cantidad de clientes activos en padrón asignados a las rutas del vendedor. Son los puntos de venta que tiene en cartera hoy.",
  },
  {
    key: "altas",
    label: "Altas",
    description:
      "Clientes nuevos dados de alta en padrón durante el período seleccionado (según fecha de alta en el ERP).",
  },
  {
    key: "exhibiciones",
    label: "Exhibic.",
    description:
      "Exhibiciones lógicas del vendedor: como máximo una por cliente y día calendario (AR). Si hay varias fotos el mismo día, cuenta la de mejor estado (Destacado > Aprobado > Rechazado > Pendiente).",
  },
  {
    key: "compradores",
    label: "Compradores",
    description:
      "PDVs distintos que compraron al menos una vez en el período. Se excluyen recaudaciones, devoluciones y comprobantes anulados.",
  },
  {
    key: "bultos",
    label: "Bultos",
    description:
      "Total de bultos vendidos en el período, sumando facturas válidas del vendedor (sin anulados ni devoluciones).",
  },
  {
    key: "cobertura",
    label: "Cobertura",
    description:
      "Porcentaje de PDVs activos del vendedor que tuvieron al menos una exhibición lógica en el período. Mide qué parte de la cartera fue exhibida.",
  },
  {
    key: "objetivos",
    label: "Objetivos",
    description:
      "Porcentaje de objetivos activos cumplidos del vendedor en el período. Solo cuenta objetivos ya lanzados y vigentes (fecha objetivo ≥ hoy).",
  },
];

export const VENDEDOR_IDEAL_HELP =
  "El vendedor ideal es el perfil de referencia contra el que se compara cada vendedor. Define metas (PDVs en cartera, exhibiciones, bultos, etc.) y cuánto pesa cada KPI en el score OVR. Puede configurarse a nivel compañía y/o distribuidora.";

export const OVERLAY_IDEAL_HELP =
  "El overlay dibuja en el radar la forma objetivo (100% en cada eje). Comparalo con el polígono del vendedor para ver en qué KPIs está por encima o por debajo del ideal.";

export const OVERLAY_MODE_HELP: Record<
  "none" | "compania" | "distribuidor" | "ambos",
  string
> = {
  none: "Solo se muestra el rendimiento real del vendedor, sin línea de referencia.",
  compania: "Superpone las metas globales definidas por la compañía.",
  distribuidor: "Superpone las metas propias de esta distribuidora.",
  ambos: "Muestra compañía y distribuidora a la vez para comparar ambos estándares.",
};
