/**
 * SQL para tablas tenant al dar de alta un distribuidor.
 * Mantener alineado con CenterMind/core/tenant_tables.py → build_tenant_tables_sql
 */

export const TENANT_TABLE_BLUEPRINTS = [
  "sucursales_v2",
  "vendedores_v2",
  "rutas_v2",
  "clientes_pdv_v2",
  "ventas_enriched_v2",
] as const;

export function buildTenantTablesSql(distId: number, distNombre?: string): string {
  const header = distNombre?.trim()
    ? `-- Tenant: ${distNombre.trim()} (ID: ${distId})`
    : `-- Tenant ID: ${distId}`;

  const lines = [
    "-- Ejecutar en el SQL Editor de Supabase",
    header,
    "-- Crea tablas *_d{N} clonando el esquema de las tablas blueprint.",
    "-- NO usar: CREATE TABLE ... PARTITION OF ... (error 42P17: tabla no particionada).",
    "",
  ];

  for (const base of TENANT_TABLE_BLUEPRINTS) {
    const target = `${base}_d${distId}`;
    lines.push(
      `CREATE TABLE IF NOT EXISTS public.${target} (LIKE public.${base} INCLUDING ALL);`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
