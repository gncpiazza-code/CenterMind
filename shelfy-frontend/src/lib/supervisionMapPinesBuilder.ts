import type { QueryClient } from "@tanstack/react-query";
import type { PinCliente } from "@/components/admin/MapaRutas";
import type {
  ClienteSupervision,
  CuentasSupervision,
  RutaSupervision,
  VendedorSupervision,
} from "@/lib/api";
import { isInactivo30, normalizeFechaPadrón } from "@/lib/supervisionMapHelpers";

interface PinDedupeRow {
  pin: PinCliente;
  estadoPdv: string | null | undefined;
  fechaUc: string | null;
  idCliente: number;
}

function fmt(date: string | null): string | null {
  if (!date) return null;
  const n = normalizeFechaPadrón(date);
  if (!n) return null;
  const [y, m, d] = n.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function pickBetterPinRow(a: PinDedupeRow, b: PinDedupeRow): PinDedupeRow {
  const aAct = a.estadoPdv === "activo";
  const bAct = b.estadoPdv === "activo";
  if (aAct !== bAct) return aAct ? a : b;

  const fa = normalizeFechaPadrón(a.fechaUc) ?? "";
  const fb = normalizeFechaPadrón(b.fechaUc) ?? "";
  if (fa && !fb) return a;
  if (fb && !fa) return b;
  if (fa && fb && fa !== fb) return fa > fb ? a : b;

  const aRecent = !isInactivo30(a.fechaUc);
  const bRecent = !isInactivo30(b.fechaUc);
  if (aRecent !== bRecent) return aRecent ? a : b;

  const fra = a.fechaUc ?? "";
  const frb = b.fechaUc ?? "";
  if (fra !== frb) return fra > frb ? a : b;

  return a.idCliente > b.idCliente ? a : b;
}

export function dedupePinsByClienteErp(rows: PinDedupeRow[]): PinCliente[] {
  const m = new Map<string, PinDedupeRow>();
  for (const row of rows) {
    const erp = row.pin.idClienteErp?.trim();
    const key = erp || `__pk_${row.idCliente}`;
    const prev = m.get(key);
    if (!prev) {
      m.set(key, row);
      continue;
    }
    m.set(key, pickBetterPinRow(prev, row));
  }
  return Array.from(m.values()).map((r) => r.pin);
}

export function hasValidCoords(lat: number | null, lng: number | null): boolean {
  if (!lat || !lng) return false;
  return lat >= -55 && lat <= -21 && lng >= -74 && lng <= -53;
}

/** Hash estable para decidir si hay que repintar markers en Google Maps. */
export function supervisionMapPinsSyncKey(pins: PinCliente[]): string {
  if (pins.length === 0) return "";
  return pins
    .map((p) => `${p.id}:${p.lat}:${p.lng}:${p.color}:${p.activo ? 1 : 0}:${p.conExhibicion ? 1 : 0}`)
    .join("|");
}

export function buildSupervisionMapPines(params: {
  distId: number;
  vendedores: VendedorSupervision[];
  visibleVends: Set<number>;
  visibleRutas: Set<number>;
  visibleClientes: Set<number>;
  cuentasData: CuentasSupervision | null;
  queryClient: QueryClient;
  getVendorColor: (vendorId: number, idx: number) => string;
}): PinCliente[] {
  const {
    distId,
    vendedores,
    visibleVends,
    visibleRutas,
    visibleClientes,
    cuentasData,
    queryClient,
    getVendorColor,
  } = params;

  const normErpId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    let s = String(id).trim();
    if (s.endsWith(".0")) s = s.slice(0, -2);
    s = s.replace(/^0+/, "") || "0";
    return s.toLowerCase();
  };

  const normName = (s: string | null | undefined): string => {
    if (!s) return "";
    let n = s.trim().toUpperCase();
    n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    n = n.replace(/[^A-Z0-9 ]/g, "");
    n = n.replace(/\s+/g, " ").trim();
    return n;
  };

  const deudaByErpId = new Map<string, { deuda: number; antiguedad: number }>();
  const deudaByNombre = new Map<string, { deuda: number; antiguedad: number }>();
  const deudaById = new Map<number, { deuda: number; antiguedad: number }>();
  const deudaByVendorClient = new Map<string, { deuda: number; antiguedad: number }>();

  if (cuentasData) {
    cuentasData.vendedores.forEach((v) => {
      const vId: number | null = v.id_vendedor ?? null;
      v.clientes.forEach((c) => {
        const entry = { deuda: c.deuda_total ?? 0, antiguedad: c.antiguedad ?? 0 };
        const normErp = normErpId(c.id_cliente_erp);
        if (normErp) deudaByErpId.set(normErp, entry);
        if (c.id_cliente) deudaById.set(Number(c.id_cliente), entry);
        if (c.cliente) {
          deudaByNombre.set(c.cliente.toLowerCase().trim(), entry);
          const nn = normName(c.cliente);
          if (nn) deudaByNombre.set(nn, entry);
          if (vId && nn) deudaByVendorClient.set(`${vId}:${nn}`, entry);
        }
      });
    });
  }

  const result: PinDedupeRow[] = [];

  vendedores.forEach((v, idx) => {
    if (!visibleVends.has(v.id_vendedor)) return;
    const color = getVendorColor(v.id_vendedor, idx);
    const vendRutas =
      queryClient.getQueryData<RutaSupervision[]>(["supervision-rutas", distId, v.id_vendedor]) ?? [];

    vendRutas.forEach((r) => {
      if (!visibleRutas.has(r.id_ruta)) return;
      const rutaClientes =
        queryClient.getQueryData<ClienteSupervision[]>(["supervision-clientes", distId, r.id_ruta]) ?? [];

      rutaClientes.forEach((c) => {
        if (!visibleClientes.has(c.id_cliente)) return;
        if (!hasValidCoords(c.latitud, c.longitud)) return;

        const erpId = normErpId(c.id_cliente_erp);
        const nombreFantasia = (c.nombre_fantasia || "").toLowerCase().trim();
        const nombreRazon = (c.nombre_razon_social || "").toLowerCase().trim();
        const normFantasia = normName(c.nombre_fantasia);
        const normRazon = normName(c.nombre_razon_social);
        const deudaInfo =
          deudaById.get(c.id_cliente) ??
          (v.id_vendedor && normFantasia ? deudaByVendorClient.get(`${v.id_vendedor}:${normFantasia}`) : null) ??
          (v.id_vendedor && normRazon ? deudaByVendorClient.get(`${v.id_vendedor}:${normRazon}`) : null) ??
          (erpId ? deudaByErpId.get(erpId) : null) ??
          (nombreFantasia ? deudaByNombre.get(nombreFantasia) : null) ??
          (normFantasia ? deudaByNombre.get(normFantasia) : null) ??
          (nombreRazon ? deudaByNombre.get(nombreRazon) : null) ??
          (normRazon ? deudaByNombre.get(normRazon) : null) ??
          null;

        const fucCanon = normalizeFechaPadrón(c.fecha_ultima_compra);

        result.push({
          pin: {
            id: c.id_cliente,
            lat: c.latitud!,
            lng: c.longitud!,
            nombre: c.nombre_fantasia || c.nombre_razon_social || "Sin nombre",
            razonSocial: c.nombre_razon_social ?? null,
            color,
            activo: !isInactivo30(c.fecha_ultima_compra),
            vendedor: v.nombre_vendedor,
            ultimaCompra: fucCanon ? fmt(fucCanon) : fmt(c.fecha_ultima_compra),
            conExhibicion: c.tiene_exhibicion_reciente === true,
            idClienteErp: c.id_cliente_erp ?? null,
            nroRuta: r.dia_semana ?? null,
            fechaUltimaCompra: fucCanon ?? c.fecha_ultima_compra ?? null,
            fechaUltimaExhibicion: c.fecha_ultima_exhibicion ?? null,
            urlExhibicion: c.url_ultima_exhibicion ?? null,
            deuda: deudaInfo?.deuda ?? null,
            antiguedadDias: deudaInfo?.antiguedad ?? null,
            totalExhibiciones: c.total_exhibiciones ?? 0,
            id_vendedor: v.id_vendedor,
          },
          estadoPdv: c.estado,
          fechaUc: c.fecha_ultima_compra ?? null,
          idCliente: c.id_cliente,
        });
      });
    });
  });

  return dedupePinsByClienteErp(result);
}
