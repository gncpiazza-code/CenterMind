"""
=============================================================================
DH-2 — GENERAR PDF (VERSIÓN DES-HARDCODEADA)
=============================================================================

QUE HACE:
  Versión genérica del generador de PDF. Lee la configuración del tenant
  (colores, logos, nombres) para generar un informe personalizado.

USO:
  1. Proveer archivo procesado (.pkl) con la config incrustada
  2. Ejecutar: python DH-2_generar_pdf.py
=============================================================================
"""

import pandas as pd
import numpy as np
import pickle
import os
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Image
)

def generar_pdf_tenant(df_all, config, output_path):
    """
    Genera el PDF usando la configuración del tenant.
    """
    
    # ── CONFIG CLIENTE ────────────────────────────────────────────────────────
    empresa_name = config.get('empresa', 'SISTEMA SHELFY')
    mes_label    = config.get('mes_reporte', 'Reporte')
    colores_suc  = config.get('colores_sucursales', {})
    sucs_orden   = config.get('sucs_orden', sorted(df_all['SUC'].unique()))
    
    # Colores principales del Tenant
    primary_color = colors.HexColor(config.get('branding', {}).get('primary', '#1A3A5C'))
    secondary_color = colors.HexColor(config.get('branding', {}).get('secondary', '#2E6DA4'))
    accent_green    = colors.HexColor(config.get('branding', {}).get('accent_green', '#1D9E75'))
    
    # ── PALETA Y ESTILOS ──────────────────────────────────────────────────────
    GRIS_OSC = colors.HexColor('#444444')
    GRIS_MED = colors.HexColor('#888888')
    GRIS_CLR = colors.HexColor('#F4F4F4')
    GRIS_BRD = colors.HexColor('#DDDDDD')
    BLANCO   = colors.white
    
    PW, PH   = landscape(A4)
    CONT_W   = PW - 30*mm

    def mk(name, **kw):
        d = dict(fontName='Helvetica', textColor=GRIS_OSC, leading=12, fontSize=9)
        d.update(kw)
        return ParagraphStyle(name, **d)

    ST = {
        'titulo': mk('ti', fontName='Helvetica-Bold', fontSize=20, textColor=BLANCO,  leading=26, alignment=TA_CENTER),
        'subtit': mk('su', fontSize=11, textColor=colors.HexColor('#FFFFFF'), leading=15, alignment=TA_CENTER),
        'h2':     mk('h2', fontName='Helvetica-Bold', fontSize=10, textColor=secondary_color,  leading=14, spaceBefore=5, spaceAfter=2),
        'th':     mk('th',  fontName='Helvetica-Bold', fontSize=7.5, textColor=BLANCO, alignment=TA_CENTER, leading=9),
        'td':     mk('td',  fontSize=7.5, alignment=TA_LEFT,   leading=9),
        'td_r':   mk('tdr', fontSize=7.5, alignment=TA_RIGHT,  leading=9),
        'td_c':   mk('tdc', fontSize=7.5, alignment=TA_CENTER, leading=9),
        'td_b':   mk('tdb', fontName='Helvetica-Bold', fontSize=7.5, alignment=TA_LEFT,  leading=9),
        'td_br':  mk('tdbr',fontName='Helvetica-Bold', fontSize=7.5, alignment=TA_RIGHT, leading=9),
        'nota':   mk('nt',  fontName='Helvetica-Oblique', fontSize=7, textColor=GRIS_MED),
    }

    def P(txt, sty='td'):   return Paragraph(str(txt), ST[sty])
    def fmt(v):             return '—' if (v == 0 or pd.isna(v)) else f'{v:.2f}'
    def pct(v, t):          return '—' if not t else f'{v/t*100:.1f}%'

    # ── COMPONENTES ──────────────────────────────────────────────────────────
    def banner(titulo, col):
        t = Table([[P(titulo, 'titulo')]], colWidths=[CONT_W])
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),col), ('ROUNDEDCORNERS',[5])]))
        return t

    def std_tbl(rows, cws, hcol=primary_color):
        t = Table(rows, colWidths=cws, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0), hcol),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[BLANCO,GRIS_CLR]),
            ('GRID',(0,0),(-1,-1),0.3,GRIS_BRD),
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ]))
        return t

    # ── CONSTRUCCIÓN DEL STORY ───────────────────────────────────────────────
    story = []
    
    # Portada Dinámica
    story.append(Spacer(1, 20*mm))
    story.append(banner(empresa_name, primary_color))
    story.append(Spacer(1, 10*mm))
    story.append(banner(f"INFORME DE GESTION - {mes_label}", secondary_color))
    story.append(PageBreak())

    # Iterar por Sucursales configuradas
    for suc in sucs_orden:
        d = df_all[df_all['SUC'] == suc]
        if len(d) == 0: continue
        
        suc_col = colors.HexColor(colores_suc.get(suc, config.get('branding', {}).get('primary', '#1A3A5C')))
        story.append(banner(f"SUCURSAL: {suc}", suc_col))
        
        # Tabla Resumen Vendedores
        deq = d[d['VENDEDOR'] != 'Sin Vendedor']
        vends = sorted(deq['VENDEDOR'].unique())
        
        hdr = [P(c,'th') for c in ['Vendedor', 'Total Bultos', '% Participación', 'Clientes']]
        rows = [hdr]
        eq_tot = deq['TOTAL'].sum()
        
        for v in vends:
            dv = deq[deq['VENDEDOR'] == v]
            vt = dv['TOTAL'].sum()
            rows.append([P(v, 'td_b'), P(fmt(vt), 'td_r'), P(pct(vt, eq_tot), 'td_c'), P(str(dv['CLIENTE'].nunique()), 'td_c')])
            
        story.append(Spacer(1, 5*mm))
        story.append(P("Resumen de ventas por equipo de ruta", "h2"))
        story.append(std_tbl(rows, [80*mm, 40*mm, 40*mm, 40*mm], suc_col))
        story.append(PageBreak())

    # Build PDF
    doc = SimpleDocTemplate(output_path, pagesize=landscape(A4))
    doc.build(story)
    print(f"PDF generado exitosamente en: {output_path}")

if __name__ == '__main__':
    # Cargar datos procesados por DH-1
    pkl_path = 'output/datos_processed_DH.pkl'
    if os.path.exists(pkl_path):
        with open(pkl_path, 'rb') as f:
            data = pickle.load(f)
        
        generar_pdf_tenant(data['df'], data['config'], 'output/informe_DH_final.pdf')
    else:
        print("Error: No se encontró el archivo procesado de DH-1.")
