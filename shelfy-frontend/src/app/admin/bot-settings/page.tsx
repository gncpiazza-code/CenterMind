"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BotSettingsMessagesTab } from "@/components/admin/BotSettingsMessagesTab";
import { BotSettingsCommandsTab } from "@/components/admin/BotSettingsCommandsTab";
import { BotSettingsCustomTab } from "@/components/admin/BotSettingsCustomTab";
import { refreshBotMenuCommands } from "@/lib/api";
import { toast } from "sonner";
import { Bot, RefreshCw, Loader2 } from "lucide-react";

export default function BotSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user && !user.is_superadmin) router.replace("/dashboard");
  }, [user, router]);

  if (!user?.is_superadmin) return null;

  async function handleRefreshMenu() {
    setRefreshing(true);
    try {
      await refreshBotMenuCommands();
      toast.success("Menú Telegram actualizado correctamente.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar el menú.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Bot Settings" />

        <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8 overflow-auto w-full max-w-[1200px] mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex items-start gap-3 min-w-0">
              <div className="size-11 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                <Bot className="size-5 text-[var(--shelfy-primary)]" />
              </div>
              <div>
                <h1 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight">
                  Bot Settings
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
                  Configuración global de mensajes y comandos del bot Telegram
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl gap-2 shrink-0"
              onClick={handleRefreshMenu}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Actualizar menú Telegram
            </Button>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="messages" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="messages">Mensajes</TabsTrigger>
              <TabsTrigger value="commands">Comandos built-in</TabsTrigger>
              <TabsTrigger value="custom">Comandos custom</TabsTrigger>
            </TabsList>

            <TabsContent value="messages">
              <BotSettingsMessagesTab />
            </TabsContent>

            <TabsContent value="commands">
              <BotSettingsCommandsTab />
            </TabsContent>

            <TabsContent value="custom">
              <BotSettingsCustomTab />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
