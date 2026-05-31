import type { AuthResponse, ClienteContacto, ERPContexto, GrupoPendiente } from "@/lib/api";
import {
  VISOR_MOCK_LANDSCAPE,
  VISOR_MOCK_PANORAMA,
  VISOR_MOCK_PORTRAIT,
  VISOR_MOCK_SQUARE,
} from "@/lib/visor-mock-images";

/** Usuario sintético para /visor/demo (sin login). */
export const VISOR_DEMO_USER: AuthResponse = {
  access_token: "demo",
  token_type: "bearer",
  usuario: "demo.visor",
  rol: "evaluador",
  id_usuario: 0,
  id_distribuidor: 1,
  nombre_empresa: "Demo · Auto-fit",
  usa_contexto_erp: true,
  usa_quarentena: false,
  usa_mapeo_vendedores: false,
  permisos: {},
};

export const VISOR_DEMO_STATS = {
  pendientes: 1,
  aprobadas: 12,
  rechazadas: 0,
  destacadas: 3,
  total: 16,
};

/** Grupo mock con 4 proporciones de imagen. */
export const VISOR_MOCK_GRUPOS: GrupoPendiente[] = [
  {
    vendedor: "García, Juan Pablo",
    sucursal: "CABA Norte",
    nro_cliente: "104502",
    tipo_pdv: "Kiosco",
    fecha_hora: new Date().toISOString(),
    fotos: [
      { id_exhibicion: 90001, drive_link: VISOR_MOCK_PORTRAIT, es_objetivo: true },
      { id_exhibicion: 90002, drive_link: VISOR_MOCK_LANDSCAPE },
      { id_exhibicion: 90003, drive_link: VISOR_MOCK_SQUARE },
      { id_exhibicion: 90004, drive_link: VISOR_MOCK_PANORAMA },
    ],
  },
];

const DEMO_FECHA_COMPRA = new Date(Date.now() - 8 * 86_400_000).toISOString();

export const VISOR_DEMO_PDV: ClienteContacto = {
  id_cliente: 0,
  id_cliente_erp: "104502",
  nombre_fantasia: "Kiosco Don Pepe",
  nombre_razon_social: "Don Pepe S.R.L.",
  domicilio: "Av. Corrientes 4521",
  localidad: "CABA",
  provincia: "Buenos Aires",
  canal: "Tradicional",
  telefono: "11 4555-1200",
  celular: "11 6123-8899",
  latitud: -34.6037,
  longitud: -58.437,
  fecha_ultima_compra: DEMO_FECHA_COMPRA,
  estado: "Activo",
  activo_comercial: true,
  padron_anulado: false,
  ultimo_comprobante: {
    fecha: DEMO_FECHA_COMPRA,
    tipo_documento: "Factura A",
    numero_documento: "00038421",
    importe_final: 184_250.5,
    nombre_vendedor: "García, Juan Pablo",
    label: "FA 00038421",
  },
  ultima_compra_articulos_resumen: "Marlboro Box 20u · 12 bultos · Quilmes 1L · 6 bultos",
  ultima_compra_articulos: [
    { descripcion: "Marlboro Box 20u", bultos_total: 12, importe_final: 98_400 },
    { descripcion: "Quilmes 1L x6", bultos_total: 6, importe_final: 42_100 },
  ],
};

export const VISOR_DEMO_ERP: ERPContexto = {
  encontrado: true,
  nombre: "Kiosco Don Pepe",
  nombre_fantasia: "Kiosco Don Pepe",
  razon_social: "Don Pepe S.R.L.",
  ultima_compra: DEMO_FECHA_COMPRA,
  vendedor_erp: "García, Juan Pablo",
  sucursal_erp: "CABA Norte",
  total_30d: 312_400,
  promedio_factura: 156_200,
  cant_facturas: 2,
  deuda_total: 45_800,
  nro_ruta: "12",
  dia_visita: "Mar · Vie",
  domicilio: "Av. Corrientes 4521",
  localidad: "CABA",
  canal: "Tradicional",
  telefono: "11 4555-1200",
  celular: "11 6123-8899",
  activo_comercial: true,
  padron_anulado: false,
  ultimo_comprobante: VISOR_DEMO_PDV.ultimo_comprobante ?? null,
  ultima_compra_articulos: VISOR_DEMO_PDV.ultima_compra_articulos ?? null,
  ultima_compra_articulos_resumen: VISOR_DEMO_PDV.ultima_compra_articulos_resumen ?? null,
};
