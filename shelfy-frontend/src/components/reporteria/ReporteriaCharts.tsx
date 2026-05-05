"use client";

import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import type { ReporteriaSerie, ReporteriaExploreResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

const VIOLET = "#a855f7";
const BLUE   = "#3b82f6";
const COLORS = ["#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function formatARS(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function formatCount(v: number) {
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function makeFormatter(source: string) {
  return source === "comprobantes" ? formatARS : formatCount;
}

function serieLabel(source: string) {
  if (source === "sigo")         return "Visitados";
  if (source === "comprobantes") return "Importe";
  return "Bultos";
}

function rankingLabel(source: string) {
  if (source === "sigo")         return "% Cobertura";
  if (source === "comprobantes") return "Importe";
  return "Bultos";
}

function rankingTitle(source: string) {
  if (source === "sigo")   return "Cobertura por vendedor";
  if (source === "bultos") return "Top artículos por bultos";
  return "Ranking vendedores";
}

function formatDate(str: string) {
  if (!str) return "";
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, subtitle, children, className }: ChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn("bg-white border border-[var(--shelfy-border)] rounded-2xl p-5 shadow-sm", className)}
    >
      <div className="mb-4">
        <h3 className="text-[13px] font-black text-[var(--shelfy-text)] tracking-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-[var(--shelfy-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  );
}

interface Props {
  data: ReporteriaExploreResponse;
  viewMode?: "resumen" | "tendencias";
  onVendorClick?: (nombre: string) => void;
}

export function ReporteriaCharts({ data, viewMode = "resumen", onVendorClick }: Props) {
  const fmt = makeFormatter(data.source);

  const serieFormatted = (data.serie_temporal ?? []).map((s) => ({
    ...s,
    fecha_label: formatDate(s.fecha),
  }));

  const topVendedores = (data.top_vendedores ?? []).slice(0, 8);

  const topClientes = (data.top_clientes ?? [])
    .slice(0, 5)
    .map((c) => ({ name: c.nombre_cliente.split(" ").slice(0, 2).join(" "), value: c.importe_total }));

  const sLabel = serieLabel(data.source);
  const rLabel = rankingLabel(data.source);

  // Tendencias: only temporal evolution chart
  if (viewMode === "tendencias") {
    return (
      <div className="space-y-4">
        <ChartCard
          title={data.source === "sigo" ? "Evolución de visitas" : data.source === "bultos" ? "Evolución de bultos" : "Evolución de facturación"}
          subtitle={`Tendencia diaria · ${data.date_from} → ${data.date_to}`}
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={serieFormatted} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="rptGradTend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BLUE} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="fecha_label"
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                formatter={(v) => [fmt(Number(v)), sLabel]}
                labelFormatter={(l) => `Fecha: ${l}`}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 12,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                }}
              />
              <Area
                type="monotone"
                dataKey="valor"
                stroke={BLUE}
                strokeWidth={2.5}
                fill="url(#rptGradTend)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: BLUE }}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  }

  // Resumen: area chart + ranking bar + pie
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Serie temporal */}
      <ChartCard
        title={data.source === "sigo" ? "Visitados por día" : data.source === "bultos" ? "Bultos por día" : "Evolución temporal"}
        subtitle={`${data.date_from} → ${data.date_to}`}
        className="lg:col-span-2"
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={serieFormatted} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="rptGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={VIOLET} stopOpacity={0.18} />
                <stop offset="95%" stopColor={VIOLET} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="fecha_label"
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmt}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              formatter={(v) => [fmt(Number(v)), sLabel]}
              labelFormatter={(l) => `Fecha: ${l}`}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid rgba(0,0,0,0.08)",
                fontSize: 12,
                boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              }}
            />
            <Area
              type="monotone"
              dataKey="valor"
              stroke={VIOLET}
              strokeWidth={2.5}
              fill="url(#rptGrad)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0, fill: VIOLET }}
              animationDuration={1200}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top vendedores / artículos */}
      {topVendedores.length > 0 && (
        <ChartCard title={rankingTitle(data.source)} subtitle={`Por ${rLabel.toLowerCase()}${onVendorClick ? " · clic para ver detalle" : ""}`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              layout="vertical"
              data={topVendedores}
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
              className={onVendorClick ? "cursor-pointer" : ""}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={fmt}
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                tick={{ fontSize: 10, fill: "#0f172a", fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={data.source === "bultos" ? 110 : 90}
              />
              <Tooltip
                formatter={(v) => [fmt(Number(v)), rLabel]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="valor"
                radius={[0, 6, 6, 0]}
                animationDuration={1000}
                cursor={onVendorClick ? "pointer" : "default"}
                onClick={(entry) => {
                  if (!onVendorClick) return;
                  // recharts passes original data point; payload holds the source object
                  const p = (entry as unknown as { payload?: { nombre?: string }; nombre?: string });
                  const nombre = p.payload?.nombre ?? p.nombre;
                  if (nombre) onVendorClick(nombre);
                }}
              >
                {topVendedores.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Pie top clientes/PDV */}
      {topClientes.length > 0 && (
        <ChartCard
          title={data.source === "sigo" ? "Top vendedores — cobertura" : data.source === "bultos" ? "Top PDVs por bultos" : "Top 5 clientes"}
          subtitle={data.source === "sigo" ? "% cobertura" : data.source === "bultos" ? "Promedio semanal" : "Por importe"}
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={topClientes}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                animationBegin={200}
                animationDuration={900}
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {topClientes.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [fmt(Number(v)), rLabel]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
