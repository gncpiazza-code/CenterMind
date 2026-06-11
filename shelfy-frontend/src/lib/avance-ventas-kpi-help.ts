import type { AvanceVentasModo } from "@/lib/api";

/**
 * Textos centralizados de los tooltips `(?)` del Avance de Ventas (R7).
 * es-AR, lenguaje operativo del supervisor — sin jerga técnica.
 */
export const AVANCE_KPI_HELP = {
  intensidad:
    "Promedio de bultos netos por cliente que compró este SKU en el período. " +
    "Ej.: 100 bultos entre 10 clientes → intensidad 10.",
  penetracion:
    "Porcentaje de clientes de tu cartera (padrón visible según el filtro) " +
    "que compraron este SKU al menos una vez en el período.",
  deltaDia:
    "Variación de bultos netos respecto al período de referencia (WoW: mismo " +
    "día de la semana pasada · MoM: mismo día del mes pasado). Muestra «Sin " +
    "dato» si el período de referencia no tiene información.",
  deltaSemana:
    "Variación de bultos netos respecto a la semana anterior (lun–sáb). " +
    "Muestra «Sin dato» si la semana de referencia no tiene información.",
  deltaMes:
    "Variación de bultos netos respecto al mes anterior completo. Muestra " +
    "«Sin dato» si el mes de referencia no tiene información.",
  volumen:
    "Volumen del período: bultos netos (ventas menos devoluciones) y unidades " +
    "de líneas convertidas (cigarrillos, papelillos, mix) y encendedores. Los " +
    "deltas comparan solo bultos.",
  volumenCigarrillos:
    "Solo cigarrillos (agrupación CIGARRILLOS y mix exhibidores). No incluye " +
    "papelillos ni encendedores. El número grande es bultos equivalentes con " +
    "decimales (unidades ÷ 250). Debajo: bultos enteros + unidades sueltas del " +
    "mismo volumen. El delta compara esos bultos vs la semana o mes anterior.",
  bultos:
    "Bultos netos del período: ventas menos devoluciones. Cigarrillos y " +
    "convertidos se expresan en bultos equivalentes según las reglas de volumen.",
  volumenDesglose:
    "Bultos enteros + unidades restantes para líneas convertidas (cigarrillos, " +
    "papelillos, mix). Encendedores: 1 bulto = 1 unidad. Activa el modo arriba " +
    "«Bultos + unidades».",
  unidades:
    "Unidades de líneas convertidas (cigarrillos, papelillos, mix) y " +
    "encendedores (1 bulto = 1 unidad). El resto de los artículos no suma unidades.",
  clientes: "Clientes distintos con al menos una compra en el período y filtro activos.",
  skus: "SKUs con movimiento (venta o devolución) en el período y filtro activos.",
  coberturaPdvs:
    "Cobertura de PDVs: clientes con compra en el período sobre el universo de PDVs " +
    "del filtro. En modo Día el denominador son solo los PDVs con visita asignada " +
    "ese día (ruta del padrón); en Semana/Mes, toda la cartera del vendedor o sucursal.",
  convivencia:
    "Convivencia de SKUs: porcentaje del catálogo (SKUs vendidos por la distribuidora " +
    "en los últimos 12 meses) que tuvo al menos una venta en el período. Mide amplitud " +
    "del mix vendido, no cuántos PDVs compraron.",
  monoproducto:
    "Clientes que concentran todo su volumen del período en un solo SKU. " +
    "Riesgo de dependencia y oportunidad de ampliar mix.",
  mixBajo:
    "Clientes con compra en el período pero pocos SKUs distintos (2–3). " +
    "Oportunidad de cross-sell con el resto del catálogo.",
} as const;

/** Texto del tooltip Δ según el modo del período activo. */
export function deltaHelpText(modo: AvanceVentasModo): string {
  if (modo === "semana") return AVANCE_KPI_HELP.deltaSemana;
  if (modo === "mes") return AVANCE_KPI_HELP.deltaMes;
  return AVANCE_KPI_HELP.deltaDia;
}
