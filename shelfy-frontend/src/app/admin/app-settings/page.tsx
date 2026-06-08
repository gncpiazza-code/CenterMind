"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Smartphone, Save, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  type AppSettings,
  type AppSettingsUpdate,
  fetchAppSettings,
  updateAppSettings,
  sendTestPush,
  fetchDistribuidores,
} from "@/lib/api";

const DIAS = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mié", value: 3 },
  { label: "Jue", value: 4 },
  { label: "Vie", value: 5 },
  { label: "Sáb", value: 6 },
];

export default function AppSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [distribuidores, setDistribuidores] = useState<{ id_distribuidor: number; nombre: string }[]>([]);
  const [selectedDist, setSelectedDist] = useState<number | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingPush, setSendingPush] = useState(false);

  // Form state
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushTime, setPushTime] = useState("08:00");
  const [pushDow, setPushDow] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [pushTemplate, setPushTemplate] = useState("");

  useEffect(() => {
    if (user && !user.is_superadmin) router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => {
    if (!user?.is_superadmin) return;
    fetchDistribuidores()
      .then((dists) => {
        setDistribuidores(dists);
        if (dists.length > 0) setSelectedDist(dists[0].id_distribuidor);
      })
      .catch(() => toast.error("Error cargando distribuidores"));
  }, [user]);

  useEffect(() => {
    if (!selectedDist) return;
    setLoading(true);
    fetchAppSettings(selectedDist)
      .then((s) => {
        setSettings(s);
        setPushEnabled(s.push_objetivos_enabled);
        setPushTime(s.push_objetivos_time_ar.slice(0, 5));
        setPushDow(s.push_objetivos_dow);
        setPushTemplate(s.push_template ?? "");
      })
      .catch(() => toast.error("Error cargando configuración"))
      .finally(() => setLoading(false));
  }, [selectedDist]);

  const handleSave = useCallback(async () => {
    if (!selectedDist) return;
    setSaving(true);
    const update: Partial<AppSettingsUpdate> = {
      push_objetivos_enabled: pushEnabled,
      push_objetivos_time_ar: pushTime,
      push_objetivos_dow: pushDow,
      push_template: pushTemplate || null,
    };
    try {
      const updated = await updateAppSettings(selectedDist, update);
      setSettings(updated);
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error guardando configuración");
    } finally {
      setSaving(false);
    }
  }, [selectedDist, pushEnabled, pushTime, pushDow, pushTemplate]);

  const handleTestPush = useCallback(async () => {
    if (!selectedDist) return;
    setSendingPush(true);
    try {
      const res = await sendTestPush(selectedDist);
      toast.success(res.message || "Push de prueba enviado");
    } catch {
      toast.error("Error enviando push de prueba");
    } finally {
      setSendingPush(false);
    }
  }, [selectedDist]);

  const toggleDow = (day: number) => {
    setPushDow((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  if (!user?.is_superadmin) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="App Settings" />

        <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8 overflow-auto w-full max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-start gap-3 mb-6">
            <div className="size-11 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <Smartphone className="size-5 text-[var(--shelfy-primary)]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight">
                App Settings
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Configuración de push y ajustes de la app móvil SHELFYAPP
              </p>
            </div>
          </div>

          {/* Selector de distribuidor */}
          {distribuidores.length > 1 && (
            <div className="mb-4">
              <Label className="text-xs text-muted-foreground mb-1 block">Distribuidor</Label>
              <select
                className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={selectedDist ?? ""}
                onChange={(e) => setSelectedDist(Number(e.target.value))}
              >
                {distribuidores.map((d) => (
                  <option key={d.id_distribuidor} value={d.id_distribuidor}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[var(--shelfy-primary)]" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Push de Objetivos */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Push de Objetivos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Habilitar recordatorio diario</Label>
                    <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hora (AR)</Label>
                    <Input
                      type="time"
                      value={pushTime}
                      onChange={(e) => setPushTime(e.target.value)}
                      className="w-36 rounded-xl"
                      disabled={!pushEnabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Días de envío</Label>
                    <div className="flex gap-2 flex-wrap">
                      {DIAS.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          disabled={!pushEnabled}
                          onClick={() => toggleDow(d.value)}
                          className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                            pushDow.includes(d.value)
                              ? "bg-[var(--shelfy-primary)] text-white border-[var(--shelfy-primary)]"
                              : "bg-background text-muted-foreground border-input"
                          } disabled:opacity-50`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Plantilla de mensaje{" "}
                      <span className="text-muted-foreground/60">(opcional)</span>
                    </Label>
                    <Textarea
                      value={pushTemplate}
                      onChange={(e) => setPushTemplate(e.target.value)}
                      placeholder="¡Buenos días! Revisá tus objetivos del día 📋"
                      rows={3}
                      className="rounded-xl resize-none text-sm"
                      disabled={!pushEnabled}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Acciones */}
              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl gap-2 flex-1"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Guardar cambios
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestPush}
                  disabled={sendingPush || !selectedDist}
                  className="rounded-xl gap-2"
                >
                  {sendingPush ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Test push
                </Button>
              </div>

              {settings && (
                <p className="text-[10px] text-muted-foreground text-right">
                  Última actualización: {new Date(settings.updated_at).toLocaleString("es-AR")}
                </p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
