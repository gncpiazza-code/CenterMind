const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const puppeteer = require('puppeteer');

const supabaseUrl = 'https://xjwadmzuuzctxbrvgopx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqd2FkbXp1dXpjdHhicnZnb3B4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3NjcwNywiZXhwIjoyMDg4MjUyNzA3fQ.z-cGNAnn6Nz1u2tWGW9rsxDRWgwHKoNw-bvT8c1qDt4';
const sb = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching data from Supabase for PDF Generation...');
  
  const { data: v } = await sb.from('vendedores_v2').select('*').eq('id_distribuidor', 3);
  const { data: i } = await sb.from('integrantes_grupo').select('*').eq('id_distribuidor', 3);
  const { data: s } = await sb.from('sucursales_v2').select('*').eq('id_distribuidor', 3);
  const { data: ex } = await sb.from('exhibiciones').select('*').eq('id_distribuidor', 3).gte('timestamp_subida', '2026-03-01').lte('timestamp_subida', '2026-03-31');
  
  const iMap = {}; i.forEach(x => iMap[x.id_integrante] = x);
  const vMap = {}; v.forEach(x => vMap[x.id_vendedor] = x);
  const sMap = {}; s.forEach(x => sMap[x.id_sucursal] = x.nombre_erp);
  
  const results = {};

  ex.forEach(e => {
    const int = iMap[e.id_integrante];
    if (!int) return;
    const vId = int.id_vendedor_v2;
    if (vId === null) return;
    const vend = vMap[vId];
    if (!vend) return;

    let vName = vend.nombre_erp;
    const sName = sMap[vend.id_sucursal] || 'SUCURSAL DESCONOCIDA';

    if (vId === 58) vName = 'IVAN WUTRICH';
    if (vId === 30) {
      if (int.nombre_integrante.match(/monchi/i)) vName = 'MONCHI AYALA';
      else if (int.nombre_integrante.match(/jorge|coronel/i)) vName = 'JORGE CORONEL';
      else return;
    }

    if (!results[vName]) results[vName] = { nombre: vName, sucursal: sName, aprobadas: 0, destacadas: 0, puntos: 0 };
    
    const st = (e.estado || '').toLowerCase();
    if (st.includes('aprobado')) {
      results[vName].aprobadas++;
      results[vName].puntos += 1;
    } else if (st.includes('destacado')) {
      results[vName].destacadas++;
      results[vName].puntos += 2;
    }
  });

  const ranking = Object.values(results).sort((a,b) => b.puntos - a.puntos || b.aprobadas - a.aprobadas);
  
  const dateStr = new Date().toLocaleDateString('es-AR');
  let rowsHtmlTop10 = '';
  let rowsHtmlAll = '';
  
  ranking.forEach((r, idx) => {
    const isTop = r.puntos > 100;
    const highlightStyles = isTop ? 'background: rgba(124, 58, 237, 0.15); font-weight: bold; border-left: 4px solid #7c3aed;' : 'border-left: 4px solid transparent;';
    const num = idx + 1;
    const medal = num === 1 ? '🥇' : num === 2 ? '🥈' : num === 3 ? '🥉' : num;
    
    // Top 10
    if (idx < 10) {
      rowsHtmlTop10 += `
        <tr style="${highlightStyles} transition: background .2s;">
          <td style="padding:14px; text-align:center; font-size:18px;">${medal}</td>
          <td style="padding:14px;">
             <div style="font-weight: ${isTop ? '900' : '700'}; color: #f8fafc; font-size: 15px;">${r.nombre}</div>
             <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px;">⭐ ${r.sucursal}</div>
          </td>
          <td style="padding:14px; text-align:center; font-size: 14px; font-weight: ${isTop ? '800' : '600'}; color: #10b981;">${r.aprobadas}</td>
          <td style="padding:14px; text-align:center; font-size: 14px; font-weight: ${isTop ? '800' : '600'}; color: #f59e0b;">${r.destacadas}</td>
          <td style="padding:14px; text-align:center; font-size: 18px; font-weight: 900; color: ${isTop ? '#a78bfa' : '#e2e8f0'};">${r.puntos}</td>
        </tr>
      `;
    }

    // All (Minimalist B&W)
    const isTopBW = r.puntos > 100;
    const fontWeightBW = isTopBW ? 'font-weight: 900;' : 'font-weight: 500;';
    const bgBW = isTopBW ? 'background: #f1f5f9;' : 'background: transparent;';
    
    rowsHtmlAll += `
      <tr style="${bgBW}">
        <td style="padding:8px; text-align:center; font-size:13px; ${fontWeightBW} border-bottom: 1px solid #e2e8f0; color: #000;">${num}</td>
        <td style="padding:8px; border-bottom: 1px solid #e2e8f0; color: #000;">
           <div style="${fontWeightBW} font-size: 13px;">${r.nombre}</div>
           <div style="font-size: 10px; color: #475569; text-transform: uppercase; margin-top: 2px;">${r.sucursal}</div>
        </td>
        <td style="padding:8px; text-align:center; font-size: 13px; ${fontWeightBW} border-bottom: 1px solid #e2e8f0; color: #000;">${r.aprobadas}</td>
        <td style="padding:8px; text-align:center; font-size: 13px; ${fontWeightBW} border-bottom: 1px solid #e2e8f0; color: #000;">${r.destacadas}</td>
        <td style="padding:8px; text-align:center; font-size: 14px; ${fontWeightBW} border-bottom: 1px solid #e2e8f0; color: #000;">${r.puntos}</td>
      </tr>
    `;
  });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ranking Marzo 2026 - Tabaco & Hnos</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    @page { margin: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: white;
    }
    * { box-sizing: border-box; }
    .page-break { page-break-before: always; }
    
    /* ---- PAGE 1 (RICH DARK MODE) ---- */
    .page-1 {
      background: #0f172a;
      color: #e2e8f0;
      min-height: 297mm;
      padding: 60px 40px;
    }
    .page-1 header {
      text-align: center;
      margin-bottom: 40px;
      position: relative;
    }
    .page-1 header::after {
      content: '';
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      width: 100px;
      height: 4px;
      background: linear-gradient(90deg, #7c3aed, #ec4899);
      border-radius: 4px;
    }
    .page-1 h1 {
      font-size: 36px;
      font-weight: 900;
      margin: 0 0 10px 0;
      color: #f8fafc;
      letter-spacing: -1px;
    }
    .page-1 h2 {
      font-size: 20px;
      color: #a78bfa;
      font-weight: 600;
      margin: 0 0 5px 0;
      letter-spacing: 0.5px;
    }
    .page-1 .subtitle {
      font-size: 13px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .page-1 .info-box {
      background: rgba(124, 58, 237, 0.1);
      border: 1px solid rgba(124, 58, 237, 0.3);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 30px;
      text-align: center;
      font-size: 13px;
      color: #cbd5e1;
    }
    .page-1 table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
    }
    .page-1 th {
      background: #0a0f1a;
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 16px 14px;
      text-align: left;
      font-weight: 800;
      border-bottom: 1px solid #334155;
    }
    .page-1 th.center { text-align: center; }
    .page-1 tbody tr:not(:last-child) td {
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
    }
    .page-1 footer {
      margin-top: 40px;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      border-top: 1px solid #1e293b;
      padding-top: 20px;
    }

    /* ---- PAGE 2 (MINIMALIST LIGHT MODE) ---- */
    .page-2 {
      background: white;
      color: black;
      min-height: 297mm;
      padding: 40px;
    }
    .page-2 header {
      text-align: left;
      margin-bottom: 30px;
      border-bottom: 2px solid #000;
      padding-bottom: 15px;
    }
    .page-2 h1 {
      font-size: 24px;
      font-weight: 800;
      margin: 0;
      color: #000;
    }
    .page-2 h2 {
      font-size: 14px;
      color: #475569;
      font-weight: 600;
      margin: 5px 0 0 0;
      text-transform: uppercase;
    }
    .page-2 table {
      width: 100%;
      border-collapse: collapse;
      background: transparent;
    }
    .page-2 th {
      background: transparent;
      color: #000;
      font-size: 11px;
      text-transform: uppercase;
      padding: 10px;
      text-align: left;
      font-weight: 800;
      border-bottom: 2px solid #000;
    }
    .page-2 th.center { text-align: center; }
    .page-2 footer {
      margin-top: 30px;
      text-align: left;
      font-size: 10px;
      color: #475569;
      border-top: 1px solid #cbd5e1;
      padding-top: 10px;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: TOP 10 -->
  <div class="page-1">
    <div style="max-width: 900px; margin: 0 auto;">
      <header>
        <h2>TABACO & HNOS</h2>
        <h1>TOP 10 VENDEDORES</h1>
        <div class="subtitle">MARZO 2026</div>
      </header>
      
      <div class="info-box">
         Vendedores resaltados superaron la meta de <b>100 puntos</b>.<br/>
         <i>Nota: Aprobadas suman 1 pto, Destacadas suman 2 ptos. En caso de empate, gana quien tenga más aprobadas.</i>
      </div>

      <table>
        <thead>
          <tr>
            <th class="center" style="width: 50px;">Pos</th>
            <th>Vendedor / Sucursal</th>
            <th class="center" style="width: 110px;">Aprobadas</th>
            <th class="center" style="width: 110px;">Destacadas</th>
            <th class="center" style="width: 100px;">Puntos</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtmlTop10}
        </tbody>
      </table>
      
      <footer>
        Generado el ${dateStr} | Sistema Shelfy | Confidencial
      </footer>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 2: FULL LIST -->
  <div class="page-2">
    <header>
      <h1>REPORTE COMPLETO DE VENDEDORES</h1>
      <h2>TABACO & HNOS - MARZO 2026</h2>
    </header>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 50px;">Pos</th>
          <th>Vendedor / Sucursal</th>
          <th class="center" style="width: 90px;">Aprobadas</th>
          <th class="center" style="width: 90px;">Destacadas</th>
          <th class="center" style="width: 90px;">Puntos</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtmlAll}
      </tbody>
    </table>
    
    <footer>
      Generado el ${dateStr} | Sistema Shelfy | Confidencial
    </footer>
  </div>

</body>
</html>`;

  const htmlPath = require('path').join(__dirname, 'Ranking_Marzo_2026.html');
  fs.writeFileSync(htmlPath, html);
  console.log('HTML saved to', htmlPath);

  console.log('Generating PDF...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  const pdfPath = '/Users/ignaciopiazza/Desktop/Ranking_Tabaco_Marzo_2026.pdf';
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0cm', right: '0cm', bottom: '0cm', left: '0cm' }
  });

  await browser.close();
  console.log('PDF successfully generated at:', pdfPath);
}

main().catch(console.error);
