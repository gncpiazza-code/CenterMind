"use client";

import { Link2, Link2Off, AlertCircle, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/Card";
import type { GrupoBindingStatus } from "@/lib/api";

interface Props {
  grupo: GrupoBindingStatus;
  onConfigure: (grupo: GrupoBindingStatus) => void;
}

function statusBadge(status: string) {
  if (status === "linked") {
    return (
      <Badge className="bg-green-100 text-green-800 shrink-0">
        <Link2 className="h-3 w-3 mr-1" />
        Vinculado
      </Badge>
    );
  }
  if (status === "review") {
    return (
      <Badge className="bg-amber-100 text-amber-800 shrink-0">
        <AlertCircle className="h-3 w-3 mr-1" />
        Revisar
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0">
      <Link2Off className="h-3 w-3 mr-1" />
      Sin vincular
    </Badge>
  );
}

export function GrupoBindingCard({ grupo, onConfigure }: Props) {
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => onConfigure(grupo)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onConfigure(grupo);
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-medium text-sm line-clamp-2 flex-1">
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
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>
            {grupo.integrantes_count ?? 0} integrante
            {(grupo.integrantes_count ?? 0) !== 1 ? "s" : ""}
            {grupo.dominant_uploader_uid != null && (
              <> · UID {grupo.dominant_uploader_uid}</>
            )}
          </span>
          <span className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            <Settings2 className="h-3 w-3" />
            Configurar
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
          {grupo.telegram_chat_id}
        </p>
      </CardContent>
    </Card>
  );
}
