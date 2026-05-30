"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { resolveBindingSuggestion, type BindingSuggestion } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  suggestions: BindingSuggestion[];
  distId: number;
  onApplied?: () => void;
}

function scoreColor(score: number): string {
  if (score >= 0.9) return "bg-green-100 text-green-800";
  if (score >= 0.7) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export function BindingAlertInbox({ suggestions, distId, onApplied }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const username = user?.usuario || "portal";

  const resolveMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "apply" | "reject" }) =>
      resolveBindingSuggestion(id, action, username),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["binding-suggestions", distId] });
      qc.invalidateQueries({ queryKey: ["binding-health", distId] });
      qc.invalidateQueries({ queryKey: ["binding-grupos", distId] });
      onApplied?.();
    },
    onError: () => toast.error("Error al procesar sugerencia"),
  });

  if (!suggestions.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
        <p className="font-medium">Sin alertas pendientes</p>
        <p className="text-sm">Todos los grupos están correctamente vinculados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s) => (
        <Card key={s.id} className="border-l-4 border-l-amber-400">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                <AlertTriangle className="inline h-4 w-4 text-amber-500 mr-1" />
                {s.nombre_grupo || `Grupo ${s.telegram_chat_id}`}
              </CardTitle>
              <Badge className={scoreColor(s.score)}>
                <TrendingUp className="h-3 w-3 mr-1" />
                {Math.round(s.score * 100)}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm mb-2">
              Candidato: <strong>{s.nombre_erp || `Vendedor #${s.id_vendedor_v2}`}</strong>
            </p>
            {s.reasons.length > 0 && (
              <ul className="text-xs text-muted-foreground mb-3 list-disc list-inside">
                {s.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => resolveMutation.mutate({ id: s.id, action: "apply" })}
                disabled={resolveMutation.isPending}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolveMutation.mutate({ id: s.id, action: "reject" })}
                disabled={resolveMutation.isPending}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Rechazar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
