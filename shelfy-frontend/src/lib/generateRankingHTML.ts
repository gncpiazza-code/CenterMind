import {
  type VendedorRanking,
  type KPIs,
  type EvolucionTiempo,
  type SucursalStats,
} from "@/lib/api";

export interface ReportInput {
  distId: number;
  nombreEmpresa: string;
  periodo: string;        // "2026-03" o "mes" etc.
  periodoLabel: string;   // "Marzo 2026" formateado para mostrar
  ranking: VendedorRanking[];
  kpis: KPIs;
  evolucion: EvolucionTiempo[];
  sucursales: SucursalStats[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tasa(aprobadas: number, total: number): number {
  if (!total) return 0;
  return Math.round((aprobadas / total) * 100);
}

function semaforo(pct: number): string {
  if (pct >= 75) return "#10b981";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

function medal(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1}`;
}

// ── SVG bar chart ──────────────────────────────────────────────────────────────

function buildEvolucionSVG(evolucion: EvolucionTiempo[]): string {
  if (!evolucion.length) return "";

  const W = 700;
  const H = 160;
  const PADDING = { top: 12, right: 16, bottom: 36, left: 36 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const maxTotal = Math.max(...evolucion.map((e) => e.total), 1);
  const barW = Math.max(4, Math.floor((chartW / evolucion.length) * 0.7));
  const gap = chartW / evolucion.length;

  const bars = evolucion
    .map((e, i) => {
      const x = PADDING.left + i * gap + (gap - barW) / 2;
      const totalH = (e.total / maxTotal) * chartH;
      const aprobH = (e.aprobadas / maxTotal) * chartH;
      const rechH = (e.rechazadas / maxTotal) * chartH;
      const yTotal = PADDING.top + chartH - totalH;

      // Stacked: rechazadas on top of aprobadas
      const yAprob = PADDING.top + chartH - aprobH;
      const yRech = yAprob - rechH;

      // Label — short date
      const label = e.fecha.length >= 7 ? e.fecha.slice(5) : e.fecha;

      return `
        <rect x="${x}" y="${yAprob.toFixed(1)}" width="${barW}" height="${aprobH.toFixed(1)}"
              fill="#10b981" rx="2" opacity="0.85">
          <title>${e.fecha}: ${e.aprobadas} aprobadas</title>
        </rect>
        ${rechH > 0.5 ? `
        <rect x="${x}" y="${yRech.toFixed(1)}" width="${barW}" height="${rechH.toFixed(1)}"
              fill="#ef4444" rx="2" opacity="0.7">
          <title>${e.fecha}: ${e.rechazadas} rechazadas</title>
        </rect>` : ""}
        <text x="${(x + barW / 2).toFixed(1)}" y="${(H - PADDING.bottom + 14).toFixed(1)}"
              text-anchor="middle" font-size="8" fill="#94a3b8">${label}</text>
        ${e.total > 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(yTotal - 3).toFixed(1)}"
              text-anchor="middle" font-size="8" fill="#cbd5e1">${e.total}</text>` : ""}
      `;
    })
    .join("");

  // Y axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1]
    .map((frac) => {
      const val = Math.round(maxTotal * frac);
      const y = PADDING.top + chartH - frac * chartH;
      return `<text x="${PADDING.left - 4}" y="${y.toFixed(1)}" text-anchor="end" font-size="8" fill="#64748b" dominant-baseline="middle">${val}</text>
              <line x1="${PADDING.left}" y1="${y.toFixed(1)}" x2="${W - PADDING.right}" y2="${y.toFixed(1)}" stroke="#1e293b" stroke-width="0.5" />`;
    })
    .join("");

  return `
  <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    ${yLabels}
    ${bars}
    <!-- X axis -->
    <line x1="${PADDING.left}" y1="${PADDING.top + chartH}" x2="${W - PADDING.right}" y2="${PADDING.top + chartH}" stroke="#334155" stroke-width="1" />
  </svg>`;
}

// ── Ranking rows ───────────────────────────────────────────────────────────────

function buildRankingRows(ranking: VendedorRanking[]): string {
  const top15 = ranking.slice(0, 15);
  const maxAprobadas = Math.max(...top15.map((v) => v.aprobadas), 1);

  return top15
    .map((v, i) => {
      const total = v.aprobadas + v.rechazadas;
      const pct = tasa(v.aprobadas, total);
      const barPct = Math.round((v.aprobadas / maxAprobadas) * 100);
      const color = semaforo(pct);
      const rowBg =
        i === 0
          ? "background: rgba(245,158,11,0.08); border-left: 3px solid #f59e0b;"
          : i === 1
          ? "background: rgba(148,163,184,0.06); border-left: 3px solid #94a3b8;"
          : i === 2
          ? "background: rgba(234,88,12,0.06); border-left: 3px solid #ea580c;"
          : "background: rgba(255,255,255,0.02); border-left: 3px solid transparent;";

      return `
      <tr class="rank-row" style="${rowBg}" data-idx="${i}">
        <td style="padding:10px 12px; font-size:18px; width:44px; text-align:center;">${medal(i)}</td>
        <td style="padding:10px 8px;">
          <div style="font-weight:800; font-size:14px; color:#f1f5f9;">${v.vendedor}</div>
          ${v.sucursal ? `<div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.08em; margin-top:2px;">${v.sucursal}</div>` : ""}
        </td>
        <td style="padding:10px 8px; text-align:right; font-size:13px; font-weight:700; color:#94a3b8;">${v.aprobadas + v.rechazadas}</td>
        <td style="padding:10px 8px; text-align:right; font-size:13px; font-weight:700; color:#10b981;">${v.aprobadas}</td>
        <td style="padding:10px 16px;">
          <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end;">
            <div style="width:60px; height:6px; background:#1e293b; border-radius:3px; overflow:hidden;">
              <div class="progress-bar" style="height:100%; border-radius:3px; background:${color}; width:0%;" data-target="${barPct}"></div>
            </div>
            <span style="font-size:12px; font-weight:900; color:${color}; min-width:36px; text-align:right;">${pct}%</span>
          </div>
        </td>
        <td style="padding:10px 12px; text-align:right; font-size:16px; font-weight:900; color:#e2e8f0;">${v.puntos}</td>
      </tr>`;
    })
    .join("");
}

// ── Main generator ─────────────────────────────────────────────────────────────

export function generateRankingHTML(input: ReportInput): string {
  const {
    distId,
    nombreEmpresa,
    periodo,
    periodoLabel,
    ranking,
    kpis,
    evolucion,
  } = input;

  const generadoEn = new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const tasaAprobacion = tasa(kpis.aprobadas, kpis.total);
  const evolucionSVG = buildEvolucionSVG(evolucion);
  const rankingRows = buildRankingRows(ranking);
  const hasRanking = ranking.length > 0;
  const hasEvolucion = evolucion.length > 0;

  return `<!DOCTYPE html>
<html lang="es">
<!--
  distId: ${distId}
  empresa: ${nombreEmpresa}
  periodo: ${periodo}
  generadoEn: ${new Date().toISOString()}
-->
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Informe Shelfy — ${nombreEmpresa} — ${periodoLabel}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 0;
    }

    .page {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px 80px;
    }

    /* ── Header ── */
    .header {
      text-align: center;
      padding: 48px 24px 40px;
      border-bottom: 1px solid #1e293b;
      margin-bottom: 48px;
      position: relative;
    }
    .header::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 60% 80% at 50% 0%, rgba(124,58,237,0.15), transparent);
      pointer-events: none;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(124,58,237,0.15);
      border: 1px solid rgba(124,58,237,0.3);
      border-radius: 999px;
      padding: 6px 16px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #a78bfa;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: clamp(24px, 5vw, 40px);
      font-weight: 900;
      letter-spacing: -.03em;
      color: #f8fafc;
      line-height: 1.1;
    }
    .header h2 {
      font-size: clamp(14px, 2.5vw, 18px);
      font-weight: 500;
      color: #7c3aed;
      margin-top: 8px;
    }
    .header .meta {
      font-size: 11px;
      color: #475569;
      margin-top: 16px;
      letter-spacing: .04em;
    }

    /* ── Section title ── */
    .section-title {
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #1e293b;
    }

    /* ── KPI cards ── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-bottom: 48px;
    }
    .kpi-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 24px 20px;
      position: relative;
      overflow: hidden;
    }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
    }
    .kpi-card.amber::before  { background: #f59e0b; }
    .kpi-card.green::before  { background: #10b981; }
    .kpi-card.red::before    { background: #ef4444; }
    .kpi-card.purple::before { background: #7c3aed; }
    .kpi-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .15em;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 12px;
    }
    .kpi-value {
      font-size: 40px;
      font-weight: 900;
      letter-spacing: -.04em;
      line-height: 1;
      color: #f8fafc;
    }
    .kpi-card.amber  .kpi-value { color: #f59e0b; }
    .kpi-card.green  .kpi-value { color: #10b981; }
    .kpi-card.red    .kpi-value { color: #ef4444; }
    .kpi-card.purple .kpi-value { color: #a78bfa; }

    /* ── Ranking table ── */
    .ranking-wrap {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 20px;
      overflow: hidden;
      margin-bottom: 48px;
    }
    .ranking-wrap table {
      width: 100%;
      border-collapse: collapse;
    }
    .ranking-wrap thead th {
      padding: 12px 12px;
      font-size: 9px;
      font-weight: 900;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: #475569;
      text-align: left;
      background: #0a111e;
      border-bottom: 1px solid #1e293b;
    }
    .rank-row {
      transition: background .15s;
    }
    .rank-row td {
      border-bottom: 1px solid rgba(30,41,59,0.6);
      vertical-align: middle;
    }
    .empty-state {
      text-align: center;
      padding: 64px 24px;
      color: #475569;
      font-size: 14px;
      font-weight: 600;
    }

    /* ── Evolution chart ── */
    .chart-wrap {
      background: #0a111e;
      border: 1px solid #1e293b;
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 48px;
    }
    .legend {
      display: flex;
      gap: 20px;
      margin-top: 12px;
      justify-content: flex-end;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      letter-spacing: .05em;
    }
    .legend-dot {
      width: 10px; height: 10px; border-radius: 2px;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      font-size: 11px;
      color: #334155;
      padding-top: 32px;
      border-top: 1px solid #1e293b;
    }
    .footer strong { color: #475569; }

    /* ── Animations ── */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .anim { animation: fadeUp .5s ease both; }
    .anim-d1 { animation-delay: .05s; }
    .anim-d2 { animation-delay: .10s; }
    .anim-d3 { animation-delay: .15s; }
    .anim-d4 { animation-delay: .20s; }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Header ── -->
  <header class="header anim">
    <div class="logo-badge">⚡ Shelfy · Informe de Desempeño</div>
    <h1>${nombreEmpresa}</h1>
    <h2>${periodoLabel}</h2>
    <p class="meta">Generado el ${generadoEn}</p>
  </header>

  <!-- ── KPIs ── -->
  <p class="section-title">Resumen del período</p>
  <div class="kpi-grid">
    <div class="kpi-card amber anim anim-d1">
      <div class="kpi-label">Total enviadas</div>
      <div class="kpi-value" data-counter="${kpis.total}">0</div>
    </div>
    <div class="kpi-card green anim anim-d2">
      <div class="kpi-label">Aprobadas</div>
      <div class="kpi-value" data-counter="${kpis.aprobadas}">0</div>
    </div>
    <div class="kpi-card red anim anim-d3">
      <div class="kpi-label">Rechazadas</div>
      <div class="kpi-value" data-counter="${kpis.rechazadas}">0</div>
    </div>
    <div class="kpi-card purple anim anim-d4">
      <div class="kpi-label">% Tasa aprobación</div>
      <div class="kpi-value" data-counter="${tasaAprobacion}" data-suffix="%">0</div>
    </div>
  </div>

  <!-- ── Ranking ── -->
  <p class="section-title">Ranking Top ${Math.min(ranking.length, 15)}</p>
  <div class="ranking-wrap anim">
    ${hasRanking ? `
    <table>
      <thead>
        <tr>
          <th style="width:44px;">Pos</th>
          <th>Vendedor</th>
          <th style="text-align:right;">Enviadas</th>
          <th style="text-align:right;">Aprobadas</th>
          <th style="text-align:right; min-width:120px;">% Aprobación</th>
          <th style="text-align:right;">Puntos</th>
        </tr>
      </thead>
      <tbody>
        ${rankingRows}
      </tbody>
    </table>` : `<div class="empty-state">Sin datos para el período seleccionado</div>`}
  </div>

  <!-- ── Evolución diaria ── -->
  ${hasEvolucion ? `
  <p class="section-title">Evolución de actividad</p>
  <div class="chart-wrap anim">
    ${evolucionSVG}
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#10b981;"></div>Aprobadas</div>
      <div class="legend-item"><div class="legend-dot" style="background:#ef4444;"></div>Rechazadas</div>
    </div>
  </div>` : ""}

  <!-- ── Footer ── -->
  <footer class="footer">
    <strong>Shelfy</strong> · Informe generado automáticamente · ${generadoEn}<br>
    <span style="font-size:10px; color:#1e293b; margin-top:4px; display:block;">distId:${distId} · ${periodo}</span>
  </footer>

</div>

<script>
  // ── Counter animation ──────────────────────────────────────────────────────
  (function() {
    var DURATION = 900;
    var els = document.querySelectorAll('[data-counter]');
    els.forEach(function(el) {
      var target = parseInt(el.getAttribute('data-counter'), 10);
      var suffix = el.getAttribute('data-suffix') || '';
      var start = null;
      function step(ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / DURATION, 1);
        // ease out cubic
        var ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * ease) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  })();

  // ── Progress bar animation ─────────────────────────────────────────────────
  (function() {
    var bars = document.querySelectorAll('.progress-bar');
    bars.forEach(function(bar, i) {
      var target = parseInt(bar.getAttribute('data-target'), 10);
      setTimeout(function() {
        bar.style.transition = 'width 0.8s cubic-bezier(.4,0,.2,1)';
        bar.style.width = target + '%';
      }, 100 + i * 30);
    });
  })();
</script>
</body>
</html>`;
}

// ── Export file name helper ────────────────────────────────────────────────────

export function reportFileName(nombreEmpresa: string, periodo: string): string {
  return `informe-${slug(nombreEmpresa)}-${periodo}.html`;
}
