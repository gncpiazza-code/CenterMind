const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://xjwadmzuuzctxbrvgopx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqd2FkbXp1dXpjdHhicnZnb3B4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3NjcwNywiZXhwIjoyMDg4MjUyNzA3fQ.z-cGNAnn6Nz1u2tWGW9rsxDRWgwHKoNw-bvT8c1qDt4';
const sb = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Auditoria de datos...');
  
  const { data: vendedores } = await sb.from('vendedores_v2').select('id_vendedor, nombre_erp, id_sucursal').eq('id_distribuidor', 3);
  const vendMap = {};
  if (vendedores) {
    vendedores.forEach(v => {
      vendMap[v.id_vendedor] = { nombre: v.nombre_erp };
    });
  }

  const { data: integrantes } = await sb.from('integrantes_grupo').select('id_integrante, id_vendedor_v2, nombre_integrante').eq('id_distribuidor', 3);
  const intMap = {};
  if (integrantes) {
    integrantes.forEach(i => {
      intMap[i.id_integrante] = {
        id_vendedor: i.id_vendedor_v2,
        nombre: i.nombre_integrante
      };
    });
  }

  let allExhibiciones = [];
  let pageIdx = 0;
  let pageSize = 1000;
  let hasMore = true;

  while(hasMore) {
    const { data: exPage, error } = await sb.from('exhibiciones').select('id_exhibicion, id_integrante, id_cliente, estado, fecha_evaluacion, timestamp_subida')
      .eq('id_distribuidor', 3)
      .gte('timestamp_subida', '2026-03-01T00:00:00Z')
      .lte('timestamp_subida', '2026-03-31T23:59:59Z')
      .range(pageIdx * pageSize, (pageIdx + 1) * pageSize - 1);
      
    if (error) break;
    if (!exPage || exPage.length === 0) {
      hasMore = false;
    } else {
      allExhibiciones = allExhibiciones.concat(exPage);
      pageIdx++;
      if (exPage.length < pageSize) hasMore = false;
    }
  }

  const performance = {}; 
  const ricardoRecords = [];
  
  const uniqueEstados = new Set();

  allExhibiciones.forEach(ex => {
    uniqueEstados.add(ex.estado);
    const integrante = intMap[ex.id_integrante];
    if (!integrante) return;
    
    const vendedor = vendMap[integrante.id_vendedor];
    if (!vendedor) return;
    
    let nombreVendedor = vendedor.nombre;
    
    if (nombreVendedor.includes('MATIAS') && nombreVendedor.includes('WUTHRICH')) {
       nombreVendedor = 'IVAN WUTRICH';
    }
    if (nombreVendedor.includes('IVAN SOTO')) {
       const nomInt = integrante.nombre.toLowerCase();
       if (nomInt.includes('monchi')) {
         nombreVendedor = 'MONCHI AYALA';
       } else if (nomInt.includes('coronel') || nomInt.includes('jorge')) {
         nombreVendedor = 'JORGE CORONEL';
       } else {
         return; 
       }
    }
    
    if (nombreVendedor.includes('RICARDO') && nombreVendedor.includes('ALVAREZ')) {
      ricardoRecords.push(ex);
    }
    
    if (!performance[nombreVendedor]) {
      performance[nombreVendedor] = { aprobadas: 0, destacadas: 0, rechazadas: 0, pendientes: 0, puntos: 0, puntosPotenciales: 0 };
    }
    
    const est = (ex.estado || '').toLowerCase();
    const isAprob = est.includes('aprobado') || est.includes('aprobada');
    const isDest = est.includes('destacado') || est.includes('destacada');
    const isRechazado = est.includes('rechazado');
    const isPendiente = !isAprob && !isDest && !isRechazado; // Assuming anything else is pending
    
    if (isAprob) {
      performance[nombreVendedor].aprobadas++;
      performance[nombreVendedor].puntos += 1;
    } else if (isDest) {
      performance[nombreVendedor].destacadas++;
      performance[nombreVendedor].puntos += 2;
    } else if (isPendiente) {
      performance[nombreVendedor].pendientes++;
    }
  });
  
  console.log("=== ESTADOS EXISTENTES ===");
  console.log(Array.from(uniqueEstados));

  console.log("\\n=== AUDITORIA RICARDO ALVAREZ ===");
  console.log("Total registros asignados a Ricardo:", ricardoRecords.length);
  
  // Find dupes (exact same timestamp and customer)
  const duplicates = [];
  const recMap = {};
  ricardoRecords.forEach(r => {
    const key = r.id_cliente + '_' + r.timestamp_subida;
    if (recMap[key]) {
      duplicates.push(r);
    } else {
      recMap[key] = true;
    }
  });
  console.log("Duplicados exactos (mismo cliente y timestamp):", duplicates.length);
  
  // Find mapped integrantes for Ricardo
  const ricInts = new Set();
  ricardoRecords.forEach(r => ricInts.add(r.id_integrante + ' - ' + intMap[r.id_integrante].nombre));
  console.log("Cuentas (integrantes) de Ricardo:");
  console.log(Array.from(ricInts));
  
  console.log("\\n=== VENDEDORES CON PENDIENTES QUE PASAN 100 PUNTOS ===");
  Object.keys(performance).forEach(name => {
    const p = performance[name];
    if (name.includes('OSVALDO') && name.includes('LOPEZ')) {
      console.log(`* ${name}: Puntos: ${p.puntos}, Pendientes: ${p.pendientes}. Total Potencial: ${p.puntos + p.pendientes}`);
    } else if (p.puntos < 100 && (p.puntos + p.pendientes) >= 100) {
      console.log(`* ${name}: Puntos actuales: ${p.puntos}, Pendientes: ${p.pendientes}. Total Potencial: ${p.puntos + p.pendientes}`);
    }
  });

}

main().catch(console.error);
