"use client";

import { GitBranch } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";

interface SucursalSelectorProps {
  sucursales: string[];
}

export function SucursalSelector({ sucursales }: SucursalSelectorProps) {
  const { filterSucursal, setFilterSucursal } = useEstadisticasStore();

  if (sucursales.length <= 1) {
    return null;
  }

  const value = filterSucursal ?? "__all__";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Select
        value={value}
        onValueChange={(v) => setFilterSucursal(v === "__all__" ? null : v)}
      >
        <SelectTrigger
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(168,85,247,0.25)",
            background: filterSucursal ? "rgba(168,85,247,0.08)" : "white",
            minWidth: 160,
            height: "auto",
            fontSize: 13,
            fontWeight: 600,
            color: filterSucursal ? "#7C3AED" : "var(--shelfy-muted)",
          }}
        >
          <GitBranch size={14} color="#a855f7" style={{ flexShrink: 0 }} />
          <SelectValue placeholder="Sucursal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todas las sucursales</SelectItem>
          {sucursales.map((suc) => (
            <SelectItem key={suc} value={suc}>
              {suc}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filterSucursal && (
        <span style={{ fontSize: 10, color: "var(--shelfy-muted)", paddingLeft: 2 }}>
          Filtrando por {filterSucursal}
        </span>
      )}
    </div>
  );
}
