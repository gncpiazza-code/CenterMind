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
}

export function ReporteriaCharts({ data }: Props) {
  const serieFormatted = (data.serie_temporal ?? []).map((s) => ({
    ...s,
    fecha_label: formatDate(s.fecha),
  }));

  const topVendedores = (data.top_vendedores ?? []).slice(0, 8);

  const topClientes = (data.top_clientes ?? [])
    .slice(0, 5)
    .map((c) => ({ name: c.nombre_cliente, value: c.importe_total }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Serie temporal */}
      <ChartCard
        title="Evolución temporal"
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
              tickFormatter={formatARS}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              formatter={(v) => [formatARS(Number(v)), "Importe"]}
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

      {/* Top vendedores */}
      {topVendedores.length > 0 && (
        <ChartCard title="Ranking vendedores" subtitle="Por importe acumulado">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              layout="vertical"
              data={topVendedores}
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={formatARS}
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
                width={90}
              />
              <Tooltip
                formatter={(v) => [formatARS(Number(v)), "Importe"]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="valor" radius={[0, 6, 6, 0]} animationDuration={1000}>
                {topVendedores.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Top clientes pie */}
      {topClientes.length > 0 && (
        <ChartCard title="Top 5 clientes" subtitle="Distribución por importe">
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
                  `${(name as string).split(" ")[0]} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {topClientes.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [formatARS(Number(v)), "Importe"]}
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
