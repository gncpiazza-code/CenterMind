import type { VendorCartaResumen } from "@/lib/api";

/** Top 2 localidades desde carta o raw_kpis (snapshots legacy solo en raw). */
export function resolveTopLocalidades(vendor: VendorCartaResumen): string {
  return (
    vendor.top_localidades?.trim() ||
    vendor.raw_kpis?.top_localidades?.trim() ||
    ""
  );
}
