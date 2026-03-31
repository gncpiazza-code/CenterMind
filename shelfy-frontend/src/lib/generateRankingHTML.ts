import {
  type VendedorRanking,
  type KPIs,
  type EvolucionTiempo,
  type SucursalStats,
  type RankingHistoricoEntry,
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
  rankingHistorico?: RankingHistoricoEntry[];
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
  const maxAprobadas = Math.max(...ranking.map((v) => v.aprobadas), 1);

  return ranking
    .map((v, i) => {
      const total = v.aprobadas + v.rechazadas;
      const pct = tasa(v.aprobadas, total);
      const barPct = pct; // bar width = approval %, not relative volume
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

// ── Race chart section ────────────────────────────────────────────────────────

function buildRaceChartSection(historico: RankingHistoricoEntry[]): string {
  if (!historico || historico.length === 0) return "";

  // Embed data as JSON for the JS runtime
  const dataJSON = JSON.stringify(historico);

  return `
  <p class="section-title">La Pel&iacute;cula del Mes &mdash; Evoluci&oacute;n del Ranking</p>
  <div class="race-chart-section" style="background:#0a111e; border:1px solid #1e293b; border-radius:20px; padding:24px; margin-bottom:48px;">
    <!-- Controls -->
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
      <button id="rc-play" style="background:#7c3aed; color:white; border:none; border-radius:10px; padding:8px 18px; font-size:12px; font-weight:800; cursor:pointer; letter-spacing:.06em; text-transform:uppercase;">
        ▶ Play
      </button>
      <select id="rc-speed" style="background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:8px; padding:6px 10px; font-size:11px; font-weight:700;">
        <option value="1200">Lento</option>
        <option value="700" selected>Normal</option>
        <option value="350">R&aacute;pido</option>
      </select>
      <span id="rc-date" style="font-size:14px; font-weight:900; color:#a78bfa; margin-left:auto;"></span>
      <span id="rc-frame-info" style="font-size:10px; color:#475569; font-weight:700;"></span>
    </div>
    <!-- Scrubber -->
    <input id="rc-scrubber" type="range" min="0" max="0" value="0" style="width:100%; accent-color:#7c3aed; margin-bottom:16px;" />
    <!-- Bars container -->
    <div id="rc-bars" style="position:relative; min-height:320px;"></div>
  </div>

  <script>
  (function() {
    var data = ${dataJSON};
    var TOP_N = 10;
    var BAR_H = 28;
    var BAR_GAP = 4;
    var COLORS = ['#7c3aed','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316','#8b5cf6','#06b6d4','#84cc16','#e11d4d'];

    // Group by date
    var dateMap = {};
    data.forEach(function(r) {
      if (!dateMap[r.fecha]) dateMap[r.fecha] = [];
      dateMap[r.fecha].push(r);
    });
    var dates = Object.keys(dateMap).sort();
    if (!dates.length) return;

    // Assign stable colors
    var allVendors = [];
    data.forEach(function(r) { if (allVendors.indexOf(r.vendedor) === -1) allVendors.push(r.vendedor); });
    var colorMap = {};
    allVendors.forEach(function(v, i) { colorMap[v] = COLORS[i % COLORS.length]; });

    var container = document.getElementById('rc-bars');
    var dateLabel = document.getElementById('rc-date');
    var frameInfo = document.getElementById('rc-frame-info');
    var playBtn = document.getElementById('rc-play');
    var speedSel = document.getElementById('rc-speed');
    var scrubber = document.getElementById('rc-scrubber');

    scrubber.max = String(dates.length - 1);
    var currentFrame = 0;
    var playing = false;
    var timer = null;

    function renderFrame(idx) {
      currentFrame = idx;
      scrubber.value = String(idx);
      var fecha = dates[idx];
      var rows = dateMap[fecha].slice().sort(function(a, b) { return b.puntos_acumulados - a.puntos_acumulados; });
      var top = rows.slice(0, TOP_N);
      var maxPts = top.length ? top[0].puntos_acumulados : 1;

      dateLabel.textContent = fecha;
      frameInfo.textContent = 'D\\u00eda ' + (idx + 1) + ' de ' + dates.length;

      // Build/update bars
      var existing = container.querySelectorAll('.rc-bar-row');
      // Remove excess
      while (existing.length > top.length) {
        container.removeChild(existing[existing.length - 1]);
        existing = container.querySelectorAll('.rc-bar-row');
      }

      top.forEach(function(entry, pos) {
        var row = existing[pos];
        if (!row) {
          row = document.createElement('div');
          row.className = 'rc-bar-row';
          row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:' + BAR_GAP + 'px; transition: transform 0.4s ease;';
          row.innerHTML =
            '<div class="rc-name" style="width:120px; text-align:right; font-size:11px; font-weight:800; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>' +
            '<div style="flex:1; height:' + BAR_H + 'px; background:#1e293b; border-radius:6px; overflow:hidden; position:relative;">' +
              '<div class="rc-fill" style="height:100%; border-radius:6px; transition: width 0.4s ease; display:flex; align-items:center; justify-content:flex-end; padding-right:8px;"></div>' +
            '</div>' +
            '<div class="rc-pts" style="width:50px; font-size:13px; font-weight:900; color:#f8fafc; text-align:left;"></div>';
          container.appendChild(row);
        }

        var pct = maxPts > 0 ? Math.max(2, Math.round((entry.puntos_acumulados / maxPts) * 100)) : 2;
        row.querySelector('.rc-name').textContent = entry.vendedor;
        var fill = row.querySelector('.rc-fill');
        fill.style.width = pct + '%';
        fill.style.background = colorMap[entry.vendedor] || '#7c3aed';
        row.querySelector('.rc-pts').textContent = String(entry.puntos_acumulados);
        row.style.transform = 'translateY(' + (pos * (BAR_H + BAR_GAP + 4)) + 'px)';
      });

      container.style.height = (top.length * (BAR_H + BAR_GAP + 4)) + 'px';
    }

    function getSpeed() { return parseInt(speedSel.value, 10); }

    function play() {
      if (playing) return;
      playing = true;
      playBtn.textContent = '⏸ Pausa';
      function advance() {
        if (!playing) return;
        if (currentFrame < dates.length - 1) {
          renderFrame(currentFrame + 1);
          timer = setTimeout(advance, getSpeed());
        } else {
          stop();
        }
      }
      timer = setTimeout(advance, getSpeed());
    }

    function stop() {
      playing = false;
      playBtn.textContent = '▶ Play';
      if (timer) { clearTimeout(timer); timer = null; }
    }

    playBtn.addEventListener('click', function() {
      if (playing) { stop(); }
      else {
        if (currentFrame >= dates.length - 1) currentFrame = 0;
        play();
      }
    });

    scrubber.addEventListener('input', function() {
      stop();
      renderFrame(parseInt(scrubber.value, 10));
    });

    // Initial render
    renderFrame(0);
  })();
  </script>`;
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
    rankingHistorico,
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
  const raceChartHTML = buildRaceChartSection(rankingHistorico || []);
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

    @media print {
      body { background: white !important; color: #333 !important; }
      .race-chart-section, canvas, svg { display: none !important; }
      table { border-collapse: collapse !important; width: 100% !important; }
      th, td { border: 1px solid #999 !important; padding: 6px 8px !important; color: #000 !important; background: white !important; }
      .bar-fill { background: #333 !important; }
      @page { margin: 1.5cm; }
    }
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

  <!-- ── Race chart ── -->
  ${raceChartHTML}

  <!-- ── Ranking ── -->
  <p class="section-title">Ranking &mdash; ${ranking.length} vendedores</p>
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
