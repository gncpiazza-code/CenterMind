"use client";

import { Link2, Link2Off, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/Card";
import type { GrupoBindingStatus } from "@/lib/api";

interface Props {
  grupo: GrupoBindingStatus;
}

function statusBadge(status: string) {
  if (status === "linked") {
    return (
      <Badge className="bg-green-100 text-green-800">
        <Link2 className="h-3 w-3 mr-1" />
        Vinculado
      </Badge>
    );
  }
  if (status === "review") {
    return (
      <Badge className="bg-amber-100 text-amber-800">
        <AlertCircle className="h-3 w-3 mr-1" />
        Revisar
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Link2Off className="h-3 w-3 mr-1" />
      Sin vincular
    </Badge>
  );
}

export function GrupoBindingCard({ grupo }: Props) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-sm truncate max-w-[60%]">
            {grupo.nombre_grupo || `Grupo ${grupo.telegram_chat_id}`}
          </h3>
          {statusBadge(grupo.binding_status)}
        </div>
        {grupo.nombre_erp ? (
          <p className="text-sm text-muted-foreground">
            Vendedor:{" "}
            <span className="font-medium text-foreground">{grupo.nombre_erp}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">Sin vendedor asignado</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>
            {grupo.integrantes_count} integrante
            {grupo.integrantes_count !== 1 ? "s" : ""}
          </span>
          {grupo.bound_by && <span>por {grupo.bound_by}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
