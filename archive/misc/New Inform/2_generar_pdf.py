"""
=============================================================================
SCRIPT 2 — GENERAR PDF
Tabaco & Hnos — Real Distribucion
=============================================================================

QUE HACE:
  Lee el archivo procesado generado por el script 1 y produce
  el PDF del informe completo (portada + 3 páginas por sucursal
  + página de notas).

USO:
  1. Haber ejecutado primero: python 1_procesar_datos.py
  2. Ejecutar: python 2_generar_pdf.py
  3. El PDF se genera en 'output/informe_tabaco.pdf'

DEPENDENCIAS:
  pip install pandas reportlab

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
    PageBreak, HRFlowable
)

# =============================================================================
# CONFIG — editar aqui
# =============================================================================

INPUT_PKL  = 'output/datos_procesados.pkl'
OUTPUT_PDF = 'output/informe_tabaco.pdf'

EMPRESA    = 'TABACO & HNOS — REAL DISTRIBUCION'
MES_LABEL  = 'Marzo 2026'

# Color por sucursal (hex) — personalizar según identidad visual deseada
COLORES_SUC = {
    'RECONQUISTA': '#1A3A5C',
    'RESISTENCIA': '#1D6A72',
    'SAENZ PEÑA':  '#5A3472',
    'CORRIENTES':  '#72341A',
    'CORDOBA':     '#1A5C3A',
}

# =============================================================================
# CONSTANTES
# =============================================================================

SKUS_CIG  = ['L. Red','L. Green','L. Blue','L. Blue Pop','Pier Original',
             'Pier Green','Pier Caps','Dolch. Golden','Dolch. Silver','Corona']
SKUS_PAP  = ['Paper Natural','Paper Clasico']
SKUS_CONOCIDOS = SKUS_CIG + SKUS_PAP + ['MIX']

# =============================================================================
# PALETA DE COLORES
# =============================================================================

AZUL     = colors.HexColor('#1A3A5C')
AZUL_M   = colors.HexColor('#2E6DA4')
AZUL_CLR = colors.HexColor('#EAF1FB')
VERDE    = colors.HexColor('#1D9E75')
VERDE_CLR= colors.HexColor('#EAF6F1')
ROJO     = colors.HexColor('#C0392B')
AMAR     = colors.HexColor('#D4881A')
GRIS_OSC = colors.HexColor('#444444')
GRIS_MED = colors.HexColor('#888888')
GRIS_CLR = colors.HexColor('#F4F4F4')
GRIS_BRD = colors.HexColor('#DDDDDD')
BLANCO   = colors.white
MAY_HDR  = colors.HexColor('#0F2740')
MIN_HDR  = colors.HexColor('#0D4A30')

PW, PH   = landscape(A4)
CONT_W   = PW - 30*mm

# =============================================================================
# ESTILOS
# =============================================================================

def mk(name, **kw):
    d = dict(fontName='Helvetica', textColor=GRIS_OSC, leading=12, fontSize=9)
    d.update(kw)
    return ParagraphStyle(name, **d)

ST = {
    'titulo': mk('ti', fontName='Helvetica-Bold', fontSize=20, textColor=BLANCO,  leading=26, alignment=TA_CENTER),
    'subtit': mk('su', fontSize=11, textColor=colors.HexColor('#AECDE8'), leading=15, alignment=TA_CENTER),
    'h2':     mk('h2', fontName='Helvetica-Bold', fontSize=10, textColor=AZUL_M,  leading=14, spaceBefore=5, spaceAfter=2),
    'h3':     mk('h3', fontName='Helvetica-Bold', fontSize=9,  textColor=GRIS_OSC,leading=12, spaceBefore=3, spaceAfter=2),
    'nota':   mk('nt', fontName='Helvetica-Oblique', fontSize=7.5, textColor=GRIS_MED, leading=10, spaceAfter=2),
    'body':   mk('bd', fontSize=8, leading=12, spaceAfter=3),
    'th':     mk('th',  fontName='Helvetica-Bold', fontSize=7.5, textColor=BLANCO, alignment=TA_CENTER, leading=9),
    'th_l':   mk('thl', fontName='Helvetica-Bold', fontSize=7.5, textColor=BLANCO, alignment=TA_LEFT,   leading=9),
    'td':     mk('td',  fontSize=7.5, alignment=TA_LEFT,   leading=9),
    'td_r':   mk('tdr', fontSize=7.5, alignment=TA_RIGHT,  leading=9),
    'td_c':   mk('tdc', fontSize=7.5, alignment=TA_CENTER, leading=9),
    'td_b':   mk('tdb', fontName='Helvetica-Bold', fontSize=7.5, alignment=TA_LEFT,  leading=9),
    'td_br':  mk('tdbr',fontName='Helvetica-Bold', fontSize=7.5, alignment=TA_RIGHT, leading=9),
    'kpi_v':  mk('kv',  fontName='Helvetica-Bold', fontSize=15, textColor=AZUL, alignment=TA_CENTER, leading=19),
    'kpi_l':  mk('kl',  fontSize=7.5, textColor=GRIS_MED, alignment=TA_CENTER, leading=10),
    'sv_td':  mk('sv',  fontSize=7.5, textColor=GRIS_MED, alignment=TA_LEFT,  leading=9, fontName='Helvetica-Oblique'),
    'sv_r':   mk('svr', fontSize=7.5, textColor=GRIS_MED, alignment=TA_RIGHT, leading=9, fontName='Helvetica-Oblique'),
}

def P(txt, sty='td'):   return Paragraph(str(txt), ST[sty])
def HR():               return HRFlowable(width='100%', thickness=0.5, color=GRIS_BRD, spaceAfter=4, spaceBefore=4)
def SP(h=3):            return Spacer(1, h*mm)
def fmt(v):             return '—' if (v == 0 or pd.isna(v)) else f'{v:.2f}'
def pct(v, t):          return '—' if not t else f'{v/t*100:.1f}%'

def scw(cws):
    """Escala anchos de columna para que no superen el ancho de página."""
    tot = sum(cws)
    return [c * CONT_W / tot for c in cws] if tot > CONT_W + 0.5*mm else cws

def suc_color(suc):
    return colors.HexColor(COLORES_SUC.get(suc, '#1A3A5C'))

# =============================================================================
# COMPONENTES REUTILIZABLES
# =============================================================================

def banner(titulo, col):
    t = Table([[P(titulo, 'titulo')]], colWidths=[CONT_W])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),col),
        ('TOPPADDING',(0,0),(-1,-1),8), ('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('ROUNDEDCORNERS',[5])]))
    return t

def kpi_cards(items, bg=AZUL_CLR):
    n = len(items); cw = CONT_W / n
    t = Table([[P(v,'kpi_v') for v,_ in items],
               [P(l,'kpi_l') for _,l in items]], colWidths=[cw]*n)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),bg),
        ('GRID',(0,0),(-1,-1),0.4,GRIS_BRD),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    return t

def std_tbl(rows, cws, hcol=AZUL, sv_idx=None, tot_idx=None):
    """Tabla estándar con encabezado coloreado, fila de total y fila de Sin Vendedor."""
    cws = scw(cws)
    n   = len(rows)
    ti  = tot_idx if tot_idx is not None else (n-2 if sv_idx is not None else n-1)
    t   = Table(rows, colWidths=cws, repeatRows=1)
    style = [
        ('BACKGROUND',(0,0),(-1,0), hcol),
        ('FONTSIZE',(0,0),(-1,-1), 7.5),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[BLANCO,GRIS_CLR]),
        ('GRID',(0,0),(-1,-1),0.3,GRIS_BRD),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('BACKGROUND',(0,ti),(-1,ti),AZUL_CLR),
        ('FONTNAME',(0,ti),(-1,ti),'Helvetica-Bold'),
        ('LINEABOVE',(0,ti),(-1,ti),0.8,AZUL_M),
    ]
    if sv_idx:
        style += [('BACKGROUND',(0,sv_idx),(-1,sv_idx),GRIS_CLR),
                  ('LINEABOVE',(0,sv_idx),(-1,sv_idx),0.6,GRIS_BRD)]
    t.setStyle(TableStyle(style))
    return t

def tabla_canal_subcanal(deq, dsv, eq_, suc, col):
    """
    Tabla de bultos por vendedor con encabezado de dos niveles:
      Fila 0: MAYORISTA (span) | MINORISTA (span) | TOTAL | Cli. | %
      Fila 1: May.A | May.B | Subtotal | KA | KB | KC | [KCA] | Subtotal | ...
    Las columnas de subtotal tienen fondo diferenciado.
    """
    has_kca  = deq['KCA'].sum() > 0
    min_cols = ['KA','KB','KC'] + (['KCA'] if has_kca else [])
    min_lbls = ['Kiosco A','Kiosco B','Kiosco C'] + (['K. Cadena'] if has_kca else [])

    n_may = 3                   # May.A | May.B | Subtotal
    n_min = len(min_cols) + 1   # subcanales + Subtotal
    n_tot = 3                   # TOTAL | Cli. | %

    cw_vend   = 40*mm
    cw_sub    = 16*mm
    cw_subtot = 18*mm
    cw_tot    = 20*mm
    cw_cli    = 16*mm
    cw_pct    = 14*mm
    remaining = CONT_W - cw_vend - 2*cw_subtot - cw_tot - cw_cli - cw_pct
    cw_each   = max(remaining / (2 + len(min_cols)), 13*mm)

    cws = ([cw_vend] +
           [cw_each, cw_each, cw_subtot] +
           [cw_each]*len(min_cols) + [cw_subtot] +
           [cw_tot, cw_cli, cw_pct])
    cws = scw(cws)

    n_may_start = 1
    n_min_start = 1 + n_may
    n_tot_start = 1 + n_may + n_min
    c_may_sub   = 3
    c_min_sub   = 3 + len(min_cols) + 1

    # Fila 0: encabezados de canal
    row0 = ([P('Vendedor','th_l')] +
            [P('MAYORISTA','th')] + [P('','th')]*(n_may-1) +
            [P('MINORISTA','th')] + [P('','th')]*(n_min-1) +
            [P('TOTAL','th'), P('Cli.','th'), P('%','th')])

    # Fila 1: encabezados de subcanal
    row1 = ([P('','th')] +
            [P('May. A','th'), P('May. B','th'), P('Subtotal','th')] +
            [P(l,'th') for l in min_lbls] + [P('Subtotal','th')] +
            [P('','th'), P('','th'), P('','th')])

    def make_row(label, dv, is_sv=False):
        ma=dv['MAY_A'].sum(); mb=dv['MAY_B'].sum(); mt=dv['MAY_TOT'].sum()
        mins=[dv[c].sum() for c in min_cols]
        mi=dv['MIN_TOT'].sum(); tt=dv['TOTAL'].sum(); nc=dv['CLIENTE'].nunique()
        td  = 'sv_td' if is_sv else 'td_b'
        tdr = 'sv_r'  if is_sv else 'td_r'
        tbr = 'sv_r'  if is_sv else 'td_br'
        return ([P(label, td),
                 P(fmt(ma),tdr), P(fmt(mb),tdr), P(fmt(mt) if mt else '—', tdr)] +
                [P(fmt(v),tdr) for v in mins] +
                [P(fmt(mi) if mi else '—', tdr),
                 P(f'{tt:.2f}' if not is_sv else fmt(tt), tbr),
                 P(str(nc), 'sv_r' if is_sv else 'td_c'),
                 P(pct(tt,eq_), 'sv_r' if is_sv else 'td_c')])

    vends = sorted(deq['VENDEDOR'].unique())
    rows  = [row0, row1] + [make_row(v, deq[deq['VENDEDOR']==v]) for v in vends]
    rows.append(make_row('TOTAL EQUIPO', deq))
    sv_idx = len(rows)
    if dsv['TOTAL'].sum() > 0:
        rows.append(make_row('Sin Vendedor (mostrador)', dsv, is_sv=True))

    n  = len(rows)
    ti = sv_idx - 1
    style = [
        # Encabezado fila 0 por zonas de canal
        ('BACKGROUND',(0,0),(0,0), col),
        ('BACKGROUND',(n_may_start,0),(n_may_start+n_may-1,0), MAY_HDR),
        ('BACKGROUND',(n_min_start,0),(n_min_start+n_min-1,0), MIN_HDR),
        ('BACKGROUND',(n_tot_start,0),(n_tot_start+n_tot-1,0), col),
        # Encabezado fila 1
        ('BACKGROUND',(0,1),(0,1), col),
        ('BACKGROUND',(n_may_start,1),(n_may_start+n_may-1,1), MAY_HDR),
        ('BACKGROUND',(n_min_start,1),(n_min_start+n_min-1,1), MIN_HDR),
        ('BACKGROUND',(n_tot_start,1),(n_tot_start+n_tot-1,1), col),
        # Spans fila 0
        ('SPAN',(n_may_start,0),(n_may_start+n_may-1,0)),
        ('SPAN',(n_min_start,0),(n_min_start+n_min-1,0)),
        ('SPAN',(0,0),(0,1)),
        ('SPAN',(n_tot_start,0),(n_tot_start,1)),
        ('SPAN',(n_tot_start+1,0),(n_tot_start+1,1)),
        ('SPAN',(n_tot_start+2,0),(n_tot_start+2,1)),
        # Datos
        ('FONTSIZE',(0,0),(-1,-1),7.5),
        ('ROWBACKGROUNDS',(0,2),(-1,n-1),[BLANCO,GRIS_CLR]),
        ('GRID',(0,0),(-1,-1),0.3,GRIS_BRD),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        # Líneas divisorias entre canales
        ('LINEAFTER',(c_may_sub,0),(c_may_sub,-1),1.0,GRIS_BRD),
        ('LINEAFTER',(c_min_sub,0),(c_min_sub,-1),1.0,GRIS_BRD),
        # Fondo subtotales
        ('BACKGROUND',(c_may_sub,2),(c_may_sub,ti-1),colors.HexColor('#E8F0F8')),
        ('BACKGROUND',(c_min_sub,2),(c_min_sub,ti-1),colors.HexColor('#E8F5F0')),
        # Total equipo
        ('BACKGROUND',(0,ti),(-1,ti),AZUL_CLR),
        ('FONTNAME',(0,ti),(-1,ti),'Helvetica-Bold'),
        ('LINEABOVE',(0,ti),(-1,ti),0.8,AZUL_M),
    ]
    if dsv['TOTAL'].sum() > 0:
        style += [('BACKGROUND',(0,sv_idx),(-1,sv_idx),GRIS_CLR),
                  ('LINEABOVE',(0,sv_idx),(-1,sv_idx),0.6,GRIS_BRD)]
    t = Table(rows, colWidths=cws, repeatRows=2)
    t.setStyle(TableStyle(style))
    return t

# =============================================================================
# SECCIONES DEL PDF
# =============================================================================

def build_portada(df_all, sucs):
    story = []
    story.append(SP(5))
    for txt, sty, bg in [(EMPRESA,'titulo',AZUL),(f'Informe Bultos x Vendedor x Articulo — {MES_LABEL}','subtit',AZUL_M)]:
        t = Table([[P(txt, sty)]], colWidths=[CONT_W])
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),bg),
            ('TOPPADDING',(0,0),(-1,-1),12 if bg==AZUL else 7),
            ('BOTTOMPADDING',(0,0),(-1,-1),12 if bg==AZUL else 7),
            ('ROUNDEDCORNERS',[5 if bg==AZUL else 4])]))
        story.append(t); story.append(SP(2))
    story.append(SP(3))

    deq_all = df_all[df_all['VENDEDOR']!='Sin Vendedor']
    dsv_all = df_all[df_all['VENDEDOR']=='Sin Vendedor']
    tot=df_all['TOTAL'].sum(); eq_=deq_all['TOTAL'].sum(); sv_=dsv_all['TOTAL'].sum()
    ncli=deq_all['CLIENTE'].nunique(); nv=deq_all['VENDEDOR'].nunique()

    story.append(kpi_cards([
        (f'{tot:.0f}','Total cajas global'),(f'{eq_:.0f}','Cajas equipo ruta'),
        (f'{sv_:.0f}','Cajas Sin Vendedor'),(f'{nv}','Vendedores activos'),
        (f'{ncli:,}','Clientes compradores'),
    ]))
    story.append(SP(2))
    story.append(kpi_cards([
        (f'{deq_all["MAY_TOT"].sum():.0f}','Cajas mayorista'),
        (f'{deq_all["MIN_TOT"].sum():.0f}','Cajas minorista'),
        (pct(deq_all["MAY_TOT"].sum(),eq_),'% mayorista'),
        (pct(deq_all["MIN_TOT"].sum(),eq_),'% minorista'),
        (f'{eq_/nv:.0f}','Cajas prom./vendedor'),
    ], VERDE_CLR))
    story.append(SP(5)); story.append(HR())

    # Tabla resumen por sucursal
    story.append(P('Resumen por sucursal', 'h2'))
    hdr = [P(c,'th') for c in ['Sucursal','Vend.','Clientes','Cajas equipo','Cajas SV','Total','% May','% Min','Caj/cli']]
    rows = [hdr]
    for suc in sucs:
        d=df_all[df_all['SUC']==suc]; deq=d[d['VENDEDOR']!='Sin Vendedor']; dsv=d[d['VENDEDOR']=='Sin Vendedor']
        tot_s=d['TOTAL'].sum(); eq_s=deq['TOTAL'].sum(); sv_s=dsv['TOTAL'].sum()
        my=deq['MAY_TOT'].sum(); mi=deq['MIN_TOT'].sum()
        nc=deq['CLIENTE'].nunique(); nv_s=deq['VENDEDOR'].nunique()
        rows.append([P(suc,'td_b'),P(str(nv_s),'td_c'),P(f'{nc:,}','td_c'),
                     P(f'{eq_s:.1f}','td_r'),P(f'{sv_s:.1f}','td_r'),P(f'{tot_s:.1f}','td_br'),
                     P(pct(my,eq_s),'td_c'),P(pct(mi,eq_s),'td_c'),
                     P(f'{eq_s/nc:.2f}' if nc else '—','td_r')])
    rows.append([P('TOTAL','td_b'),P(str(nv),'td_c'),P(f'{ncli:,}','td_c'),
                 P(f'{eq_:.1f}','td_br'),P(f'{sv_:.1f}','td_br'),P(f'{tot:.1f}','td_br'),
                 P(pct(deq_all["MAY_TOT"].sum(),eq_),'td_c'),
                 P(pct(deq_all["MIN_TOT"].sum(),eq_),'td_c'),
                 P(f'{eq_/ncli:.2f}' if ncli else '—','td_r')])
    story.append(std_tbl(rows,[38*mm,16*mm,22*mm,28*mm,24*mm,26*mm,18*mm,18*mm,18*mm]))
    story.append(SP(4))

    # Mix global
    story.append(P('Mix de SKUs — equipo de ruta (todas las sucursales)', 'h2'))
    cig_all=deq_all[deq_all['SKU'].isin(SKUS_CIG)]; tot_cig=cig_all['TOTAL'].sum()
    items=[(s,v) for s,v in cig_all.groupby('SKU')['TOTAL'].sum().sort_values(ascending=False).items() if v>0]
    mid=( len(items)+1)//2
    hdr2=[P(c,'th') for c in ['SKU','Cajas','%','SKU','Cajas','%']]; rows2=[hdr2]
    for i in range(max(len(items[:mid]),len(items[mid:]))):
        r=[]
        for lst in [items[:mid],items[mid:]]:
            if i<len(lst): s,v=lst[i]; r+=[P(s,'td'),P(f'{v:.1f}','td_r'),P(pct(v,tot_cig),'td_c')]
            else: r+=[P('','td'),P('','td_r'),P('','td_c')]
        rows2.append(r)
    rows2.append([P('TOTAL CIG.','td_b'),P(f'{tot_cig:.1f}','td_br'),P('100%','td_c'),P('','td'),P('','td_r'),P('','td_c')])
    story.append(std_tbl(rows2,[38*mm,22*mm,16*mm,38*mm,22*mm,16*mm]))
    story.append(SP(3))
    story.append(P('1 caja = 25 bresas = 250 atados. Sin Vendedor = mostrador, excluido de promedios del equipo.','nota'))
    story.append(PageBreak())
    return story


def build_sucursal(df_all, suc):
    story = []
    col  = suc_color(suc)
    d    = df_all[df_all['SUC']==suc].copy()
    deq  = d[d['VENDEDOR']!='Sin Vendedor'].copy()
    dsv  = d[d['VENDEDOR']=='Sin Vendedor'].copy()
    vends= sorted(deq['VENDEDOR'].unique())
    eq_  = deq['TOTAL'].sum(); sv_=dsv['TOTAL'].sum()
    may_ = deq['MAY_TOT'].sum(); min_=deq['MIN_TOT'].sum()
    ncli = deq['CLIENTE'].nunique(); nv=len(vends)
    tot_cig_eq = deq[deq['SKU'].isin(SKUS_CIG)]['TOTAL'].sum()

    # ── PÁG 1: KPIs + Canal/Subcanal ─────────────────────────────────────────
    story.append(banner(f'SUCURSAL: {suc}', col)); story.append(SP(3))
    story.append(kpi_cards([
        (f'{eq_:.1f}','Cajas equipo ruta'),(f'{nv}','Vendedores activos'),
        (f'{ncli:,}','Clientes compradores'),
        (f'{eq_/nv:.1f}' if nv else '—','Cajas prom./vendedor'),
        (f'{eq_/ncli:.2f}' if ncli else '—','Cajas / cliente'),
    ]))
    story.append(SP(2))
    story.append(kpi_cards([
        (f'{may_:.1f}','Cajas mayorista'),(f'{min_:.1f}','Cajas minorista'),
        (pct(may_,eq_),'% mayorista'),(pct(min_,eq_),'% minorista'),(f'{sv_:.1f}','Cajas Sin Vendedor'),
    ], VERDE_CLR))
    story.append(SP(3))
    story.append(P('Bultos por vendedor — canal y subcanal','h2'))
    story.append(tabla_canal_subcanal(deq, dsv, eq_, suc, col))
    story.append(SP(2))
    story.append(P('Sin Vendedor = canal mostrador. No se incluye en promedios del equipo.','nota'))
    story.append(PageBreak())

    # ── PÁG 2: x Artículo ────────────────────────────────────────────────────
    story.append(banner(f'SUCURSAL: {suc}', col)); story.append(SP(3))
    story.append(P('Bultos por vendedor x articulo — Cigarrillos','h2'))
    story.append(P(f'Total cajas cigarrillos equipo: {tot_cig_eq:.1f} | 1 caja = 25 bresas = 250 atados','nota'))

    skus_p=[s for s in SKUS_CIG if deq[deq['SKU']==s]['TOTAL'].sum()>0]
    cw_v=36*mm; cw_t=18*mm; cw_s=max((CONT_W-cw_v-cw_t)/max(len(skus_p),1),14*mm)
    cws2=scw([cw_v]+[cw_s]*len(skus_p)+[cw_t])

    hdr2=[P('Vendedor','th_l')]+[P(s,'th') for s in skus_p]+[P('TOTAL','th')]
    rows2=[hdr2]
    for vend in vends:
        dv=deq[deq['VENDEDOR']==vend]; tt=dv[dv['SKU'].isin(SKUS_CIG)]['TOTAL'].sum()
        rows2.append([P(vend,'td_b')]+[P(fmt(dv[dv['SKU']==s]['TOTAL'].sum()),'td_r') for s in skus_p]+[P(f'{tt:.2f}','td_br')])
    tot_row=[P('TOTAL EQUIPO','td_b')]+[P(fmt(deq[deq['SKU']==s]['TOTAL'].sum()),'td_br') for s in skus_p]+[P(f'{tot_cig_eq:.2f}','td_br')]
    rows2.append(tot_row)
    pct_row=[P('% del total','td_b')]
    for s in skus_p:
        v=deq[deq['SKU']==s]['TOTAL'].sum(); p_=v/tot_cig_eq*100 if tot_cig_eq else 0
        col_p=ROJO if p_>50 else (AMAR if p_>45 else VERDE)
        pct_row.append(Paragraph(f'{p_:.1f}%',ParagraphStyle('pp',fontName='Helvetica-Bold',fontSize=7.5,textColor=col_p,alignment=TA_CENTER,leading=9)))
    pct_row.append(P('100%','td_c')); rows2.append(pct_row)
    sv_cig=dsv[dsv['SKU'].isin(SKUS_CIG)]['TOTAL'].sum()
    rows2.append([P('Sin Vendedor (mostrador)','sv_td')]+[P(fmt(dsv[dsv['SKU']==s]['TOTAL'].sum()),'sv_r') for s in skus_p]+[P(fmt(sv_cig),'sv_r')])

    t2=Table(rows2,colWidths=cws2,repeatRows=1); nr2=len(rows2)
    t2.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),col),('FONTSIZE',(0,0),(-1,-1),7.5),
        ('ROWBACKGROUNDS',(0,1),(-1,nr2-4),[BLANCO,GRIS_CLR]),('GRID',(0,0),(-1,-1),0.3,GRIS_BRD),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('BACKGROUND',(0,nr2-3),(-1,nr2-3),AZUL_CLR),('FONTNAME',(0,nr2-3),(-1,nr2-3),'Helvetica-Bold'),
        ('LINEABOVE',(0,nr2-3),(-1,nr2-3),0.8,AZUL_M),
        ('BACKGROUND',(0,nr2-2),(-1,nr2-2),colors.HexColor('#F0F7F0')),
        ('BACKGROUND',(0,nr2-1),(-1,nr2-1),GRIS_CLR),('LINEABOVE',(0,nr2-1),(-1,nr2-1),0.6,GRIS_BRD)]))
    story.append(t2); story.append(SP(3))

    # Otros productos
    otros=[s for s in d['SKU'].unique() if s not in SKUS_CONOCIDOS and deq[deq['SKU']==s]['TOTAL'].sum()>0]
    otros_conocidos=[s for s in ['MIX','Paper Natural','Paper Clasico'] if deq[deq['SKU']==s]['TOTAL'].sum()>0]
    todos_otros = otros_conocidos + otros
    if todos_otros:
        story.append(P('Otros productos — no incluidos en total cigarrillos','h3'))
        hdr_o=[P('Vendedor','th_l')]+[P(s,'th') for s in todos_otros]+[P('Total','th')]
        rows_o=[hdr_o]
        for vend in vends:
            dv=deq[deq['VENDEDOR']==vend]
            vals=[dv[dv['SKU']==s]['TOTAL'].sum() for s in todos_otros]
            if any(v>0 for v in vals):
                rows_o.append([P(vend,'td_b')]+[P(fmt(v),'td_r') for v in vals]+[P(fmt(sum(vals)),'td_br')])
        if len(rows_o)>1:
            rows_o.append([P('TOTAL EQUIPO','td_b')]+
                [P(fmt(deq[deq['SKU']==s]['TOTAL'].sum()),'td_br') for s in todos_otros]+
                [P(fmt(deq[deq['SKU'].isin(todos_otros)]['TOTAL'].sum()),'td_br')])
            nc_o=len(todos_otros)
            cws_o=[36*mm]+[max((CONT_W-54*mm)/max(nc_o,1),14*mm)]*nc_o+[18*mm]
            story.append(std_tbl(rows_o, cws_o, col))
    story.append(PageBreak())

    # ── PÁG 3: Análisis + Convivencia ────────────────────────────────────────
    story.append(banner(f'SUCURSAL: {suc}', col)); story.append(SP(3))
    story.append(P('Analisis por vendedor — participacion y mix','h2'))
    hdr4=[P(c,'th') for c in ['Vendedor','Cajas','% suc.','Clientes','Caj/cli','SKU principal','% SKU','Canal pred.']]
    rows4=[hdr4]
    for vend in vends:
        dv=deq[deq['VENDEDOR']==vend]; tt=dv['TOTAL'].sum(); nc=dv['CLIENTE'].nunique()
        dvc=dv[dv['SKU'].isin(SKUS_CIG)]
        if len(dvc) and dvc['TOTAL'].sum()>0:
            sku_p=dvc.groupby('SKU')['TOTAL'].sum().idxmax()
            sku_pt=pct(dvc.groupby('SKU')['TOTAL'].sum().max(),dvc['TOTAL'].sum())
        else: sku_p,sku_pt='—','—'
        ka=dv['KA'].sum(); kb=dv['KB'].sum(); kc=dv['KC'].sum()
        mt=dv['MAY_TOT'].sum(); mi=dv['MIN_TOT'].sum()
        if mt>=mi: canal='Mayorista'
        else: canal='Kiosco A' if ka>=kb and ka>=kc else ('Kiosco B' if kb>=kc else 'Kiosco C')
        rows4.append([P(vend,'td_b'),P(f'{tt:.2f}','td_r'),P(pct(tt,eq_),'td_c'),
            P(str(nc),'td_c'),P(f'{tt/nc:.2f}' if nc else '—','td_r'),
            P(sku_p,'td'),P(sku_pt,'td_c'),P(canal,'td_c')])
    rows4.append([P('TOTAL EQUIPO','td_b'),P(f'{eq_:.2f}','td_br'),P('100%','td_c'),
        P(str(ncli),'td_c'),P(f'{eq_/ncli:.2f}' if ncli else '—','td_r'),
        P('—','td'),P('—','td_c'),P('—','td_c')])
    story.append(std_tbl(rows4,[42*mm,22*mm,17*mm,17*mm,17*mm,30*mm,20*mm,26*mm],col))
    story.append(SP(4))

    story.append(P('Convivencia de SKUs — equipo de ruta (limite: ningun SKU >50%)','h2'))
    by_sku=deq[deq['SKU'].isin(SKUS_CIG)].groupby('SKU')['TOTAL'].sum().sort_values(ascending=False)
    hdr5=[P(c,'th') for c in ['SKU','Cajas','% total cig.','Alerta']]; rows5=[hdr5]
    for sku,val in by_sku.items():
        if val==0: continue
        p_=val/tot_cig_eq*100 if tot_cig_eq else 0
        col_p=ROJO if p_>50 else (AMAR if p_>45 else VERDE)
        txt='● >50% — SUPERA LIMITE' if p_>50 else ('● Atencion' if p_>45 else '● OK')
        rows5.append([P(sku,'td'),P(f'{val:.2f}','td_r'),P(f'{p_:.1f}%','td_c'),
            Paragraph(txt,ParagraphStyle('al',fontName='Helvetica-Bold',fontSize=7.5,textColor=col_p,alignment=TA_CENTER,leading=9))])
    rows5.append([P('TOTAL CIG.','td_b'),P(f'{tot_cig_eq:.2f}','td_br'),P('100%','td_c'),P('','td_c')])
    story.append(std_tbl(rows5,[65*mm,35*mm,35*mm,45*mm],col))
    story.append(SP(3))
    if sv_>0:
        story.append(P(f'Sin Vendedor — {suc}: {sv_:.1f} cajas totales | '
            f'{dsv[dsv["SKU"].isin(SKUS_CIG)]["TOTAL"].sum():.1f} cajas cigarrillos | '
            f'{sv_/(eq_+sv_)*100:.1f}% del total de la sucursal.','nota'))
    story.append(PageBreak())
    return story

# =============================================================================
# PIE DE PÁGINA
# =============================================================================

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7); canvas.setFillColor(GRIS_MED)
    canvas.drawRightString(PW-10*mm, 8*mm, f'{EMPRESA} — {MES_LABEL}  |  Pag. {doc.page}')
    canvas.drawString(10*mm, 8*mm, 'Confidencial')
    canvas.restoreState()

# =============================================================================
# MAIN
# =============================================================================

if __name__ == '__main__':
    os.makedirs('output', exist_ok=True)

    print("Cargando datos procesados...")
    with open(INPUT_PKL, 'rb') as f:
        data = pickle.load(f)
    df_all = data['df']
    sucs   = data['sucs']

    print(f"Sucursales: {sucs}")
    print("Generando PDF...")

    doc = SimpleDocTemplate(OUTPUT_PDF, pagesize=landscape(A4),
        leftMargin=15*mm, rightMargin=15*mm, topMargin=12*mm, bottomMargin=16*mm)

    story = []
    story += build_portada(df_all, sucs)
    for suc in sucs:
        d = df_all[df_all['SUC']==suc]
        if len(d) == 0:
            print(f"  ADVERTENCIA: sin datos para {suc}, se omite")
            continue
        print(f"  Procesando {suc}...")
        story += build_sucursal(df_all, suc)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"\nPDF generado: {OUTPUT_PDF}")
