# -*- coding: utf-8 -*-
"""
styles.py — Estilos centralizados de Shelfy
================================================
Cada constante corresponde a un módulo de la app.
Editá solo este archivo para cambiar colores, tipografía o layout
sin tocar la lógica de negocio de cada página.

Constantes disponibles:
  DASHBOARD_PC_STYLE    → 2a_Dashboard_pc.py  (topbar, KPIs, ranking, etc.)
  CAROUSEL_IFRAME_CSS   → 2a_Dashboard_pc.py  (CSS interno del carrusel iframe)
  ADMIN_PC_STYLE        → 3a_Admin_pc.py       (topbar, tabs, cards, roles, grid)
  ADMIN_MONITOR_STYLE   → 3a_Admin_pc.py       (KPI monitor, live bar, alertas)
  REPORTES_PC_STYLE     → 4a_Reportes_pc.py    (topbar, cards, KPI chips, tabla)
  VISOR_BASE_CSS        → 1a_Visor_pc.py       (base compartida: variables, reset, botones, inputs)
  VISOR_PC_CSS          → 1a_Visor_pc.py       (layout 70/30, panel eval, botones acción)
  VISOR_MOBILE_STYLE    → 1b_Visor_mobile.py   (página "en construcción" móvil)
"""

# ──────────────────────────────────────────────────────────────────────────────
# PALETA GLOBAL (referencia — los valores reales están en los :root de cada CSS)
# ──────────────────────────────────────────────────────────────────────────────
# --bg-darkest:   #1A0B3B   (fondo más oscuro)
# --accent-amber: #7C3AED   (dorado principal)
# --accent-sand:  #A78BFA   (arena clara)
# --st-aprobado:  #7DAF6B   (verde)
# --st-destacado: #FFEA05   (amarillo)
# --st-rechazado: #C0584A   (rojo)
# --text-primary: #F0EEFF   (texto principal)
# --border-soft:  rgba(167,139,250,0.28)

# ──────────────────────────────────────────────────────────────────────────────
# DASHBOARD PC
# ──────────────────────────────────────────────────────────────────────────────

DASHBOARD_PC_STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── CSS Variables — Paleta Tobacco/Amber ────────────────── */
:root {
    --bg-darkest:   #1A0B3B;
    --accent-amber: #7C3AED;
    --accent-sand:  #A78BFA;
    --status-approved: #7DAF6B;
    --status-rejected: #C0584A;
    --text-primary:  #F0EEFF;
    --text-muted:    rgba(240, 238, 255, 0.5);
    --text-dim:      rgba(240, 238, 255, 0.3);
    --border-soft:   rgba(167, 139, 250, 0.28);
}

/* ── Animaciones ──────────────────────────────────────────── */
@keyframes fadeUpScale {
    from { opacity: 0; transform: translateY(20px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
}
@keyframes fadeInTop {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: var(--bg-darkest) !important;
    color: var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
}
[data-testid="stHeader"],
[data-testid="stToolbar"],
[data-testid="stDecoration"] { display: none !important; }
[data-testid="stMainBlockContainer"] { padding: 0 !important; max-width: 100% !important; }
.block-container { padding: 0 !important; max-width: 100% !important; }

/* ── Sidebar — filtros globales del Dashboard ─────────────── */
section[data-testid="stSidebar"],
section[data-testid="stSidebar"] > div,
section[data-testid="stSidebar"] [data-testid="stSidebarContent"] {
    background: #1A0B3B !important;
}
section[data-testid="stSidebar"] {
    border-right: 1px solid rgba(167,139,250,0.28) !important;
    min-width: 220px !important;
}
section[data-testid="stSidebar"] > div { padding: 20px 16px !important; }
section[data-testid="stSidebar"] h3 {
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 16px !important;
    letter-spacing: 3px !important;
    color: var(--accent-amber) !important;
    border-bottom: 1px solid var(--border-soft) !important;
    padding-bottom: 10px !important;
    margin-bottom: 14px !important;
}
section[data-testid="stSidebar"] .stSelectbox label {
    color: rgba(240,238,255,0.5) !important;
    font-size: 10px !important;
    letter-spacing: 2px !important;
    text-transform: uppercase !important;
    font-weight: 600 !important;
}
section[data-testid="stSidebar"] [data-testid="stSelectbox"] > div > div {
    background: rgba(55,25,120,0.6) !important;
    border: 1px solid var(--border-soft) !important;
    border-radius: 10px !important;
    color: var(--text-primary) !important;
}
section[data-testid="stSidebar"] hr { border-color: var(--border-soft) !important; margin: 14px 0 !important; }
section[data-testid="stSidebar"] .stCaption,
section[data-testid="stSidebar"] small { color: var(--text-dim) !important; font-size: 11px !important; line-height: 1.6 !important; }

/* ── Fondo con textura ────────────────────────────────────── */
[data-testid="stAppViewContainer"]::before {
    content: '';
    position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(124,58,237,0.04) 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 90% 80%, rgba(124,58,237,0.03) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Topbar ───────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 28px;
    background: rgba(26, 11, 59, 0.92);
    border-bottom: 1px solid var(--border-soft);
    backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 100;
}
.topbar-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px; letter-spacing: 4px; color: var(--accent-amber);
    text-shadow: 0 0 24px rgba(124,58,237,0.35);
}
.topbar-sub { font-size: 12px; color: var(--text-muted); letter-spacing: 2px; }
.topbar-right { display: flex; align-items: center; gap: 16px; }
.refresh-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 999px;
    font-family: 'DM Mono', monospace;
    font-size: 11px; letter-spacing: 1px;
    background: rgba(124,58,237,0.12);
    border: 1px solid var(--border-soft);
    color: var(--accent-amber);
}
.dot-live {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--status-approved); box-shadow: 0 0 8px var(--status-approved);
    display: inline-block;
}

/* ── Progress bar de refresh ──────────────────────────────── */
.refresh-bar-wrap {
    height: 3px; background: var(--border-soft);
    position: sticky; top: 57px; z-index: 99;
}
.refresh-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-amber), var(--status-approved));
    transition: width 1s linear;
}

/* ── Cards ────────────────────────────────────────────────── */
.card {
    background: rgba(55, 20, 120, 0.22);
    border: 1px solid rgba(167, 139, 250, 0.28);
    border-radius: 16px;
    backdrop-filter: blur(20px);
    padding: 20px 22px;
    height: 100%;
    animation: fadeUpScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
}
.card:hover {
    border-color: rgba(167, 139, 250, 0.5);
    box-shadow: 0 8px 32px rgba(124,58,237,0.25), 0 0 0 1px rgba(167,139,250,0.15);
}
.card-title {
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--accent-amber); margin-bottom: 18px;
    display: flex; align-items: center; gap: 8px; font-weight: 600;
}
.card-title::after {
    content: ''; flex: 1; height: 1px;
    background: var(--border-soft);
}

/* ── KPI cards ────────────────────────────────────────────── */
.kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
}
.kpi-card {
    background: rgba(55, 20, 120, 0.22);
    border: 1px solid rgba(167, 139, 250, 0.28);
    border-radius: 14px;
    backdrop-filter: blur(20px);
    padding: 18px 16px;
    display: flex; align-items: center; justify-content: space-between;
    animation: fadeUpScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 10px rgba(0,0,0,0.25);
}
.kpi-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(167,139,250,0.28);
}
.kpi-card:nth-child(1) { animation-delay: 0.1s; }
.kpi-card:nth-child(2) { animation-delay: 0.2s; }
.kpi-card:nth-child(3) { animation-delay: 0.3s; }
.kpi-label {
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--text-dim); margin-bottom: 4px; font-weight: 600;
}
.kpi-num {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 44px; line-height: 1;
}
.kpi-icon {
    width: 48px; height: 48px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
}
.kpi-green  .kpi-num  { color: var(--status-approved); }
.kpi-green  .kpi-icon { background: rgba(125,175,107,0.12); border: 1px solid rgba(125,175,107,0.25); }
.kpi-amber  .kpi-num  { color: var(--accent-amber); }
.kpi-amber  .kpi-icon { background: rgba(124,58,237,0.12); border: 1px solid var(--border-soft); }
.kpi-red    .kpi-num  { color: var(--status-rejected); }
.kpi-red    .kpi-icon { background: rgba(192,88,74,0.12); border: 1px solid rgba(192,88,74,0.25); }

/* ── Período selector pills ───────────────────────────────── */
.period-bar {
    display: flex; gap: 8px; margin-bottom: 16px;
}
.period-pill {
    padding: 6px 16px; border-radius: 999px;
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    border: 1px solid var(--border-soft);
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
    transition: all 0.3s ease;
}
.period-pill.active {
    background: rgba(167,139,250,0.28);
    border-color: var(--border-soft);
    color: var(--accent-amber);
    font-weight: 700;
    transform: scale(1.05);
}
.period-pill.active:hover {
    transform: scale(1.1);
}

/* ── Ranking rows ─────────────────────────────────────────── */
.rank-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.02);
    margin-bottom: 6px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.rank-row:hover {
    background: rgba(124,58,237,0.08);
    border-color: var(--border-soft);
    transform: translateX(6px);
    box-shadow: -4px 0 15px rgba(167,139,250,0.35);
}
.rank-pos {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px; width: 32px; text-align: center; flex-shrink: 0;
}
.rank-pos.gold   { color: var(--accent-amber); }
.rank-pos.silver { color: var(--accent-sand); }
.rank-pos.bronze { color: #F97316; }
.rank-pos.rest   { color: var(--text-dim); }
.rank-name {
    flex: 1;
    font-size: 14px; font-weight: 600; color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rank-pts {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px; color: var(--accent-amber);
    flex-shrink: 0;
}
.rank-pts-lbl {
    font-size: 9px; letter-spacing: 1px; color: var(--text-dim);
    text-transform: uppercase; text-align: right;
}
.rank-sub {
    font-size: 11px; color: var(--text-muted);
    white-space: nowrap;
}
.rank-row.top1 {
    background: rgba(124,58,237,0.08);
    border-color: var(--border-soft);
    box-shadow: inset -2px 0 8px rgba(167,139,250,0.28);
}
.rank-row.top1:hover {
    box-shadow: -4px 0 20px rgba(124,58,237,0.4), inset -2px 0 8px rgba(167,139,250,0.28);
}

/* ── Carrusel (page-level — el iframe tiene su propio CSS) ── */
.carousel-frame {
    position: relative;
    background: var(--bg-darkest);
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.06);
}
.carousel-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: linear-gradient(to top, var(--bg-darkest) 0%, rgba(26,11,59,0.65) 60%, transparent 100%);
    padding: 20px 20px 16px;
    pointer-events: none;
    animation: fadeInTop 0.6s ease-out;
}
.carousel-vendor {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px; color: var(--text-primary); letter-spacing: 2px;
}
.carousel-meta {
    font-size: 11px; color: var(--text-muted);
    letter-spacing: 1px; margin-top: 2px;
}
.carousel-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 12px; border-radius: 999px;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    font-weight: 600; margin-top: 6px;
}
.badge-aprobado {
    background: rgba(125,175,107,0.15);
    color: var(--status-approved);
    border: 1px solid rgba(125,175,107,0.3);
}
.badge-destacado {
    background: rgba(167,139,250,0.35);
    color: var(--accent-amber);
    border: 1px solid var(--border-soft);
}
.carousel-dots {
    display: flex; gap: 6px; justify-content: center;
    padding: 10px 0 6px;
}
.dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--border-soft);
    transition: background 0.2s, width 0.2s;
}
.dot.active {
    background: var(--accent-amber); width: 18px; border-radius: 3px;
}

/* ── Líder banner ─────────────────────────────────────────── */
.leader-banner {
    background: rgba(124,58,237,0.12);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    backdrop-filter: blur(12px);
    padding: 12px 20px;
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 14px;
    animation: fadeUpScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.leader-crown { font-size: 28px; }
.leader-text { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: var(--accent-amber); letter-spacing: 2px; }
.leader-sub { font-size: 12px; color: var(--text-muted); }

/* ── Empty state ──────────────────────────────────────────── */
.empty-carousel {
    height: 380px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: var(--text-dim);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 24px; letter-spacing: 3px;
}

/* ── Streamlit overrides ──────────────────────────────────── */
div[data-testid="stHorizontalBlock"] { gap: 12px !important; }
div[data-testid="column"] { padding: 0 !important; }

div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    font-size: 12px !important;
    border-radius: 999px !important;
    height: 36px !important;
    background: rgba(124,58,237,0.10) !important;
    border: 1px solid rgba(167,139,250,0.28) !important;
    color: var(--text-muted) !important;
    transition: all 0.25s cubic-bezier(0.4,0,0.2,1) !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
}
div[data-testid="stButton"] button:hover {
    background: linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(75,16,163,0.25) 100%) !important;
    border-color: var(--accent-amber) !important;
    color: #E0D0FF !important;
    transform: translateY(-2px) scale(1.03) !important;
    box-shadow: 0 6px 18px rgba(124,58,237,0.30) !important;
}

/* ── Scrollbar ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-soft); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.3); }

/* ── Media Queries — Tablet (768px - 1024px) ────────────── */
@media (max-width: 1024px) {
    .kpi-grid { grid-template-columns: 1fr 1fr; }
    .topbar-logo { font-size: 24px; }
    .topbar-sub { font-size: 11px; }
}

/* ── Media Queries — Móvil (<768px) ──────────────────────── */
@media (max-width: 768px) {
    .kpi-grid { grid-template-columns: 1fr; }
    .topbar { padding: 12px 16px; flex-wrap: wrap; }
    .topbar-logo { font-size: 20px; }
    .topbar-sub, .topbar-right { font-size: 10px; }
    .period-bar {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
    }
    .period-bar::-webkit-scrollbar { display: none; }
    ::-webkit-scrollbar { width: 0; }
    .rank-name { font-size: 12px; }
    .rank-pts  { font-size: 18px; }
}

/* ── Media Queries — Ultra-pequeño (<480px) ─────────────── */
@media (max-width: 480px) {
    .topbar { padding: 10px 12px; }
    .topbar-logo { font-size: 18px; letter-spacing: 2px; }
    .kpi-num { font-size: 32px; }
    .kpi-label { font-size: 9px; }
    .card { padding: 16px; }
    .leader-banner { padding: 10px 16px; }
}

/* ── Pantalla completa ────────────────────────────────────── */
.fs-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px;
    background: rgba(124,58,237,0.06);
    border: 1px solid var(--border-soft);
    border-radius: 8px; cursor: pointer;
    font-size: 15px; color: var(--text-muted);
    transition: all 0.2s ease; user-select: none; flex-shrink: 0;
}
.fs-btn:hover {
    background: rgba(124,58,237,0.18);
    border-color: var(--accent-amber);
    color: var(--accent-amber); transform: scale(1.08);
}

/* ── Carousel: transiciones de slide ─────────────────────── */
@keyframes slideInRight {
    from { opacity: 0; transform: translateX(50px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0)    scale(1); }
}
@keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-50px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0)     scale(1); }
}
@keyframes fadeScaleIn {
    from { opacity: 0.4; transform: scale(0.98); }
    to   { opacity: 1;   transform: scale(1); }
}
.car-anim-next { animation: slideInRight 0.42s cubic-bezier(0.34, 1.4, 0.64, 1); }
.car-anim-prev { animation: slideInLeft  0.42s cubic-bezier(0.34, 1.4, 0.64, 1); }
.car-anim-auto { animation: fadeScaleIn  0.55s ease-out; }

/* ── Sparkle: estrellas flotantes (Destacado) ────────────── */
.carousel-stars {
    position: absolute; inset: 0;
    pointer-events: none; overflow: hidden; z-index: 8;
}
@keyframes starAscend {
    0%   { opacity: 0;   transform: translateY(0)      scale(0.1)  rotate(0deg); }
    18%  { opacity: 1;   transform: translateY(-18px)   scale(1)    rotate(72deg); }
    80%  { opacity: 0.7; transform: translateY(-78px)   scale(0.6)  rotate(240deg); }
    100% { opacity: 0;   transform: translateY(-108px)  scale(0.05) rotate(360deg); }
}
.star-particle {
    position: absolute;
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    animation: starAscend var(--dur) var(--delay) ease-in-out infinite;
    opacity: 0;
}
@keyframes destacadoGlow {
    0%, 100% { border-color: rgba(167,139,250,0.35); box-shadow: none; }
    50%      { border-color: rgba(124,58,237,0.65);
               box-shadow: 0 0 30px rgba(124,58,237,0.28), inset 0 0 18px rgba(124,58,237,0.08); }
}
.carousel-frame.destacado { animation: destacadoGlow 2.5s ease-in-out infinite; }

/* ── Nuevo líder: animaciones ─────────────────────────────── */
@keyframes leaderIn {
    0%   { opacity: 0; transform: translateY(-28px) scale(0.86); }
    60%  { transform: translateY(6px) scale(1.04); }
    100% { opacity: 1; transform: translateY(0)    scale(1); }
}
@keyframes crownDance {
    0%, 100% { transform: rotate(-10deg) scale(1)    translateY(0);   }
    30%      { transform: rotate( 10deg) scale(1.28) translateY(-7px); }
    70%      { transform: rotate( -4deg) scale(1.08) translateY(-2px); }
}
@keyframes leaderShimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
}
@keyframes confettiFall {
    0%   { opacity: 1; transform: translateY(-10px) rotate(0deg)   scale(1);   }
    100% { opacity: 0; transform: translateY(68px)  rotate(560deg) scale(0.4); }
}
.leader-banner {
    animation: leaderIn 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
    position: relative !important; overflow: hidden !important;
}
.leader-banner::before {
    content: '';
    position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255,234,5,0.1), transparent);
    background-size: 200% 100%;
    animation: leaderShimmer 2.2s ease-in-out infinite;
    z-index: 0;
}
.leader-crown {
    display: inline-block !important;
    animation: crownDance 1.1s ease-in-out infinite;
    z-index: 2; position: relative;
}
.confetti-dot {
    position: absolute; width: 7px; height: 5px;
    border-radius: 2px; pointer-events: none; z-index: 3;
    animation: confettiFall var(--dur) var(--delay) linear infinite;
}
</style>
"""


# ──────────────────────────────────────────────────────────────────────────────
# CAROUSEL IFRAME CSS
# CSS que se inyecta dentro del <iframe> del carrusel (components.html).
# Usá clases .badge-aprobado / .badge-destacado para los estados.
# ──────────────────────────────────────────────────────────────────────────────

CAROUSEL_IFRAME_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;600&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
    background: transparent;
    font-family: 'DM Sans', sans-serif;
    overflow: hidden;
    height: 100%;
}

/* ── Card contenedor — flex para que el frame llene el iframe ── */
.card {
    background: rgba(55, 20, 120, 0.6);
    border: 1px solid rgba(167, 139, 250, 0.28);
    border-radius: 16px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    height: 100%;
}
.card-title {
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: #7C3AED; margin-bottom: 12px;
    display: flex; align-items: center; gap: 8px; font-weight: 600;
    flex-shrink: 0;
}
.card-title::after { content: ''; flex: 1; height: 1px; background: rgba(167, 139, 250, 0.28); }

/* ── Frame de imagen — crece para llenar el espacio disponible ── */
.carousel-frame {
    position: relative;
    background: #1A0B3B;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.06);
    flex: 1;          /* ocupa todo el alto libre del card */
    min-height: 300px;
    width: 100%;
}
.carousel-frame img { width: 100%; height: 100%; object-fit: contain; display: block; }

/* ── Overlay inferior (texto sobre imagen) ─── */
.carousel-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: linear-gradient(to top, #1A0B3B 0%, rgba(26,11,59,0.65) 60%, transparent 100%);
    padding: 20px 20px 14px;
    pointer-events: none;
}
.carousel-vendor { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: #F0EEFF; letter-spacing: 2px; }
.carousel-meta   { font-size: 11px; color: rgba(240,238,255,0.5); letter-spacing: 1px; margin-top: 2px; }

/* ── Badge de estado ───── */
.carousel-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 12px; border-radius: 999px;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    font-weight: 600; margin-top: 6px;
}
.badge-aprobado  { background: rgba(125,175,107,0.15); color: #7DAF6B;  border: 1px solid rgba(125,175,107,0.3); }
.badge-destacado { background: rgba(124,58,237,0.20); color: #FFEA05;  border: 1px solid rgba(124,58,237,0.3); }

/* ── Dots de paginación ── */
.carousel-dots { display: flex; gap: 6px; justify-content: center; padding: 8px 0 2px; flex-shrink: 0; }
.dot           { width: 6px; height: 6px; border-radius: 50%; background: rgba(167,139,250,0.28); transition: background 0.2s, width 0.2s; }
.dot.active    { background: #7C3AED; width: 18px; border-radius: 3px; }

/* ── Estrellas sparkle (Destacado) ── */
.carousel-stars  { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 8; }
.star-particle   {
    position: absolute;
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    animation: starAscend var(--dur) var(--delay) ease-in-out infinite;
    opacity: 0;
}
@keyframes starAscend {
    0%   { opacity: 0;   transform: translateY(0)      scale(0.1)  rotate(0deg); }
    18%  { opacity: 1;   transform: translateY(-18px)   scale(1)    rotate(72deg); }
    80%  { opacity: 0.7; transform: translateY(-78px)   scale(0.6)  rotate(240deg); }
    100% { opacity: 0;   transform: translateY(-108px)  scale(0.05) rotate(360deg); }
}

/* ── Animaciones de slide ── */
@keyframes slideInRight { from { opacity: 0; transform: translateX(50px)  scale(0.97); } to { opacity: 1; transform: translateX(0) scale(1); } }
@keyframes slideInLeft  { from { opacity: 0; transform: translateX(-50px) scale(0.97); } to { opacity: 1; transform: translateX(0) scale(1); } }
@keyframes fadeScaleIn  { from { opacity: 0.4; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
@keyframes destacadoGlow {
    0%, 100% { border-color: rgba(167,139,250,0.35);  box-shadow: none; }
    50%      { border-color: rgba(124,58,237,0.65); box-shadow: 0 0 30px rgba(124,58,237,0.28), inset 0 0 18px rgba(124,58,237,0.08); }
}
.car-anim-next { animation: slideInRight 0.42s cubic-bezier(0.34, 1.4, 0.64, 1); }
.car-anim-prev { animation: slideInLeft  0.42s cubic-bezier(0.34, 1.4, 0.64, 1); }
.car-anim-auto { animation: fadeScaleIn  0.55s ease-out; }
.destacado     { animation: destacadoGlow 2.5s ease-in-out infinite; }
"""


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN PC
# ──────────────────────────────────────────────────────────────────────────────

ADMIN_PC_STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── CSS Variables — Paleta Tobacco/Amber Shelfy ─────────────────────── */
:root {
    --bg-darkest:   #1A0B3B;
    --bg-card:      rgba(55, 20, 120, 0.22);
    --accent-amber: #7C3AED;
    --accent-sand:  #A78BFA;

    --role-superadmin: #FFEA05;
    --role-admin:      #A78BFA;
    --role-evaluador:  #7DAF6B;
    --role-vendedor:   #CBD5E1;
    --role-observador: #94A3B8;

    --text-primary:    #F0EEFF;
    --text-muted:      rgba(240, 238, 255, 0.5);
    --text-dim:        rgba(240, 238, 255, 0.3);
    --border-soft:     rgba(167, 139, 250, 0.28);
    --border-light:    rgba(255, 255, 255, 0.04);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: var(--bg-darkest) !important;
    color: var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
}
[data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"] { display: none !important; }
[data-testid="stMainBlockContainer"]{ padding: 0 !important; max-width: 100% !important; }
section[data-testid="stSidebar"] { display: none !important; }

[data-testid="stAppViewContainer"]::before {
    content: ''; position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(124,58,237,0.04) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Topbar ───────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 32px;
    background: rgba(26, 11, 59, 0.92);
    border-bottom: 1px solid var(--border-soft);
    backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 100;
    margin-bottom: 24px;
}
.topbar-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 26px; letter-spacing: 3px;
    background: linear-gradient(90deg, #4B10A3 0%, #7C3AED 20%, #FFF580 50%, #7C3AED 80%, #4B10A3 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    filter: drop-shadow(0 0 4px rgba(124,58,237,0.25));
    animation: sm-logo-shimmer 5s ease-in-out infinite, sm-logo-glow 5s ease-in-out infinite;
}
@keyframes sm-logo-shimmer {
    0%   { background-position: 150% 0; }
    50%  { background-position: -50% 0; }
    100% { background-position: 150% 0; }
}
@keyframes sm-logo-glow {
    0%, 100% { filter: drop-shadow(0 0 4px rgba(124,58,237,0.20)); }
    45%      { filter: drop-shadow(0 0 14px rgba(255,245,80,0.80)) drop-shadow(0 0 32px rgba(124,58,237,0.45)); }
    65%      { filter: drop-shadow(0 0 18px rgba(255,250,120,0.95)) drop-shadow(0 0 42px rgba(124,58,237,0.55)); }
}
.topbar-meta { font-size: 12px; color: rgba(240, 238, 255, 0.4); letter-spacing: 1px; }
.superadmin-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 14px; border-radius: 999px;
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
    background: rgba(255, 234, 5, 0.12);
    border: 1px solid rgba(255, 234, 5, 0.3);
    color: var(--role-superadmin);
    box-shadow: 0 0 12px rgba(255, 234, 5, 0.15);
}

/* ── Tabs ─────────────────────────────────────────────────── */
div[data-testid="stTabs"] [role="tablist"] {
    background: rgba(32, 14, 77, 0.4) !important;
    border-radius: 12px !important; padding: 4px !important;
    border: 1px solid var(--border-soft) !important; gap: 4px !important;
}
div[data-testid="stTabs"] [role="tab"] {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 15px !important;
    color: var(--text-dim) !important; border-radius: 8px !important;
    padding: 8px 20px !important; border: none !important;
    transition: all 0.2s ease !important;
}
div[data-testid="stTabs"] [role="tab"][aria-selected="true"] {
    background: rgba(167, 139, 250, 0.28) !important;
    color: var(--accent-amber) !important;
    border: 1px solid var(--border-soft) !important;
}

/* ── Cards & Formularios ──────────────────────────────────── */
.card {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    backdrop-filter: blur(12px);
    padding: 20px 22px; margin-bottom: 16px;
}
.card-title {
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--accent-amber); margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px; font-weight: 600;
}
.card-title::after { content: ''; flex: 1; height: 1px; background: var(--border-soft); }

[data-testid="stForm"] {
    background: rgba(13, 5, 32, 0.8) !important;
    border: 1px solid var(--border-soft) !important;
    border-radius: 16px !important;
    padding: 24px !important;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5) !important;
}

/* ── Role badges ──────────────────────────────────────────── */
.role-badge {
    display: inline-flex; align-items: center;
    padding: 4px 12px; border-radius: 20px;
    font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700;
}
.role-superadmin { background: rgba(255, 234, 5, 0.15);   color: var(--role-superadmin); border: 1px solid rgba(255, 234, 5, 0.35); }
.role-admin      { background: rgba(217, 189, 156, 0.12); color: var(--role-admin);      border: 1px solid rgba(217, 189, 156, 0.25); }
.role-evaluador  { background: rgba(125, 175, 107, 0.12); color: var(--role-evaluador);  border: 1px solid rgba(125, 175, 107, 0.25); }
.role-vendedor   { background: rgba(203, 213, 225, 0.08); color: var(--role-vendedor);   border: 1px solid rgba(203, 213, 225, 0.2); }
.role-observador { background: rgba(148, 163, 184, 0.08); color: var(--role-observador); border: 1px solid rgba(148, 163, 184, 0.2); }

/* ── Inputs y Botones Generales ───────────────────────────── */
div[data-testid="stTextInput"] input, div[data-testid="stSelectbox"] > div > div {
    background: rgba(13, 5, 32, 0.8) !important;
    border: 1px solid rgba(124, 58, 237, 0.2) !important;
    border-radius: 10px !important; color: var(--text-primary) !important;
}
div[data-testid="stTextInput"] input:focus, div[data-testid="stSelectbox"] > div > div:focus-within {
    border-color: var(--accent-amber) !important;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1) !important;
}

div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 14px !important;
    border-radius: 8px !important; height: 40px !important;
    background: rgba(124, 58, 237, 0.1) !important;
    border: 1px solid rgba(124, 58, 237, 0.25) !important;
    color: var(--accent-amber) !important;
    transition: all 0.2s ease !important;
}
div[data-testid="stButton"] button:hover {
    background: rgba(124, 58, 237, 0.2) !important;
    border-color: var(--accent-amber) !important;
    transform: translateY(-2px) !important;
}
div[data-testid="stAlert"] {
    background: rgba(220, 38, 38, 0.1) !important;
    border: 1px solid rgba(220, 38, 38, 0.3) !important;
    border-radius: 10px !important; color: #f87171 !important;
}
div[data-testid="stSuccess"] {
    background: rgba(22, 163, 74, 0.1) !important;
    border: 1px solid rgba(22, 163, 74, 0.3) !important;
    border-radius: 10px !important; color: #86EFAC !important;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(167, 139, 250, 0.28); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(124, 58, 237, 0.3); }

/* ── ESTILOS DEL LISTADO (TABLA EN DESKTOP, CARDS EN MÓVIL) ── */
.grid-header {
    display: grid; gap: 16px; padding: 0 16px 12px 16px;
    border-bottom: 1px solid var(--border-soft); margin-bottom: 8px;
    color: rgba(226,232,240,0.35); font-size: 10px; letter-spacing: 2px;
    text-transform: uppercase; font-weight: 600;
}
.row-divider    { height: 1px; background: var(--border-light); margin: 6px 0; }
.cell-primary   { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.cell-secondary { font-size: 13px; color: var(--text-muted); }
.cell-mono      { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--accent-sand); }

/* Efecto hover en desktop para toda la fila */
div[data-testid="stHorizontalBlock"]:has(.admin-row) {
    align-items: center; padding: 4px 8px; border-radius: 8px;
    transition: background 0.2s;
}
div[data-testid="stHorizontalBlock"]:has(.admin-row):hover {
    background: rgba(124, 58, 237, 0.05);
}

/* Botón Peligro (El 5to botón en Usuarios) */
div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) div[data-testid="stButton"] button {
    background: rgba(220, 38, 38, 0.1) !important;
    border: 1px solid rgba(220, 38, 38, 0.25) !important;
    color: #DC2626 !important;
}
div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) div[data-testid="stButton"] button:hover {
    background: rgba(220, 38, 38, 0.25) !important; border-color: #DC2626 !important;
}
div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) div[data-testid="stButton"] button:disabled {
    opacity: 0.3 !important; cursor: not-allowed !important; transform: none !important;
}

/* ── RESPONSIVE MÓVIL (CARD STACKING) ─────────────────────── */
@media (max-width: 768px) {
    .grid-header, .row-divider { display: none; }

    div[data-testid="stButton"] button { height: 44px !important; }

    /* Transformar la fila en una tarjeta */
    div[data-testid="stHorizontalBlock"]:has(.admin-row) {
        display: grid !important;
        background: var(--bg-card) !important;
        border: 1px solid var(--border-soft) !important;
        border-radius: 12px !important;
        padding: 16px !important;
        margin-bottom: 12px !important;
        gap: 8px !important;
        align-items: center !important;
    }
    div[data-testid="column"] { width: 100% !important; min-width: 100% !important; }

    /* Template Areas - Usuarios */
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) {
        grid-template-columns: 1fr auto !important;
        grid-template-areas:
            "name role"
            "dist dist"
            "btn1 btn2" !important;
    }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(1) { grid-area: name; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(2) { grid-area: dist; margin-bottom: 8px !important;}
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(3) { grid-area: role; text-align: right; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(4) { grid-area: btn1; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) { grid-area: btn2; }

    /* Template Areas - Integrantes */
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) {
        grid-template-columns: 1fr auto !important;
        grid-template-areas:
            "name role"
            "dist dist"
            "group group"
            "tgid tgid"
            "btn btn" !important;
    }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(1) { grid-area: name; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(2) { grid-area: dist; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(3) { grid-area: group; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(4) { grid-area: tgid; margin-bottom: 8px !important;}
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(5) { grid-area: role; text-align: right; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(6) { grid-area: btn; }

    /* Textos inyectados para móvil */
    .mobile-lbl-dist::before { content: "Distribuidora: "; font-weight: bold; color: var(--text-dim); }
    .mobile-lbl-grp::before  { content: "Grupo: ";         font-weight: bold; color: var(--text-dim); }
    .cell-primary { font-size: 16px; }
}
</style>
"""


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN MONITOR CSS
# ──────────────────────────────────────────────────────────────────────────────

ADMIN_MONITOR_STYLE = """
<style>
/* ── KPI Cards Monitor ─────────────────────────────────────── */
.mon-kpi {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    padding: 18px 20px;
    position: relative;
    overflow: hidden;
    margin-bottom: 4px;
}
.mon-kpi::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
}
.mon-kpi.online::before  { background: #7DAF6B; }
.mon-kpi.idle::before    { background: #7C3AED; }
.mon-kpi.neutral::before { background: rgba(124,58,237,0.4); }
.mon-kpi-val {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 42px;
    line-height: 1;
    color: var(--text-primary);
}
.mon-kpi-lbl {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-top: 6px;
}
.mon-kpi-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
}
.dot-online { background: #7DAF6B; box-shadow: 0 0 6px rgba(125,175,107,0.7); }
.dot-idle   { background: #7C3AED; box-shadow: 0 0 6px rgba(124,58,237,0.7); }
.dot-gray   { background: #64748B; }

/* ── Live bar ───────────────────────────────────────────────── */
.monitor-refresh-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    background: rgba(26,11,59,0.6);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    margin-bottom: 20px;
}
.monitor-ts { font-size: 12px; color: var(--text-dim); }
.monitor-live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #7DAF6B;
    font-weight: 700;
}
.live-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #7DAF6B;
    animation: live-pulse 1.5s ease-in-out infinite;
}
@keyframes live-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.35; transform: scale(0.65); }
}

/* ── Alerta cards ───────────────────────────────────────────── */
.alert-card {
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-left: 3px solid;
}
.alert-card.warn  { border-color: #7C3AED; background: rgba(124,58,237,0.06); }
.alert-card.error { border-color: #DC2626; background: rgba(220,38,38,0.06); }
.alert-card.info  { border-color: #60A5FA; background: rgba(96,165,250,0.06); }
.alert-type {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-weight: 700;
    min-width: 120px;
}
.alert-msg { font-size: 13px; color: var(--text-muted); flex: 1; }
.alert-ts  { font-size: 11px; color: var(--text-dim); white-space: nowrap; }

/* ── Métricas extras ────────────────────────────────────────── */
.metric-block { text-align: center; padding: 12px 0; }
.metric-big   { font-family: 'Bebas Neue', sans-serif; font-size: 32px; color: var(--text-primary); line-height: 1; }
.metric-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim); margin-top: 4px; }
</style>
"""


# ──────────────────────────────────────────────────────────────────────────────
# REPORTES PC
# ──────────────────────────────────────────────────────────────────────────────

REPORTES_PC_STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── Paleta Shelfy (Tobacco/Amber) ─────────────────────── */
:root {
    --bg-darkest:   #1A0B3B;
    --bg-card:      rgba(55, 20, 120, 0.22);
    --bg-input:     rgba(13, 5, 32, 0.8);

    --accent-amber: #7C3AED;
    --accent-hover: #FFEA05;
    --accent-sand:  #A78BFA;

    --text-primary: #F0EEFF;
    --text-muted:   rgba(240, 238, 255, 0.5);
    --border-soft:  rgba(167, 139, 250, 0.28);

    /* Colores de estado Shelfy */
    --st-aprobado:  #7DAF6B;
    --st-destacado: #FFEA05;
    --st-rechazado: #C0584A;
    --st-pendiente: #8B5CF6;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: var(--bg-darkest) !important;
    color: var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
}

[data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"] { display: none !important; }
[data-testid="stMainBlockContainer"]{ padding: 0 !important; max-width: 100% !important; }
section[data-testid="stSidebar"] { display: none !important; }

/* Fondo textura sutil */
[data-testid="stAppViewContainer"]::before {
    content: ''; position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(124,58,237,0.04) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Topbar ───────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 32px;
    background: rgba(26, 11, 59, 0.92);
    border-bottom: 1px solid var(--border-soft);
    backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 100;
}
.topbar-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 26px; letter-spacing: 3px; color: var(--accent-amber);
    text-shadow: 0 0 20px rgba(124, 58, 237, 0.3);
}
.topbar-meta { font-size: 12px; color: var(--text-muted); letter-spacing: 1px; }
.user-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 14px; border-radius: 999px;
    font-size: 11px; letter-spacing: 1px;
    background: rgba(124, 58, 237, 0.1);
    border: 1px solid rgba(124, 58, 237, 0.25);
    color: var(--accent-amber);
}

/* ── Cards (Efecto Vidrio) ────────────────────────────────── */
.card {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    backdrop-filter: blur(12px);
    padding: 20px 22px;
    margin-bottom: 16px;
}
.card-title {
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--accent-amber); margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px; font-weight: 600;
}
.card-title::after { content: ''; flex: 1; height: 1px; background: var(--border-soft); }

/* ── KPI Chips ────────────────────────────────────────────── */
.kpi-row {
    display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 4px;
}
.kpi-chip {
    flex: 1; min-width: 110px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 16px 10px; border-radius: 12px;
    background: rgba(13, 5, 32, 0.6);
    border: 1px solid var(--border-soft);
    transition: transform 0.2s ease;
}
.kpi-chip:hover { transform: translateY(-2px); }
.kpi-chip-num { font-family: 'Bebas Neue', sans-serif; font-size: 36px; line-height: 1; margin-bottom: 4px; }
.kpi-chip-lbl { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }

.kpi-total  .kpi-chip-num { color: var(--text-primary); }
.kpi-green  .kpi-chip-num { color: var(--st-aprobado);  text-shadow: 0 0 10px rgba(125,175,107,0.3); }
.kpi-amber  .kpi-chip-num { color: var(--st-destacado); text-shadow: 0 0 10px rgba(255,234,5,0.3); }
.kpi-red    .kpi-chip-num { color: var(--st-rechazado); }
.kpi-muted  .kpi-chip-num { color: var(--st-pendiente); }

/* ── Filtros y Form Elements ──────────────────────────────── */
div[data-testid="stDateInput"] input,
div[data-testid="stTextInput"] input,
div[data-testid="stSelectbox"] > div > div,
div[data-testid="stMultiSelect"] > div > div {
    background: var(--bg-input) !important;
    border: 1px solid rgba(124, 58, 237, 0.2) !important;
    border-radius: 10px !important;
    color: var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
    font-size: 13px !important;
    min-height: 44px !important;
}
div[data-testid="stDateInput"] input:focus,
div[data-testid="stTextInput"] input:focus,
div[data-testid="stSelectbox"] > div > div:focus-within,
div[data-testid="stMultiSelect"] > div > div:focus-within {
    border-color: var(--accent-amber) !important;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1) !important;
}

/* ── Botones ──────────────────────────────────────────────── */
div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 15px !important;
    border-radius: 10px !important; height: 44px !important;
    background: rgba(124, 58, 237, 0.1) !important;
    border: 1px solid rgba(124, 58, 237, 0.3) !important;
    color: var(--accent-amber) !important;
    transition: all 0.2s ease !important;
}
div[data-testid="stButton"] button:hover {
    background: rgba(124, 58, 237, 0.2) !important;
    border-color: var(--accent-hover) !important;
    color: var(--accent-hover) !important;
    transform: translateY(-2px) !important;
}

/* Botón Exportar GIGANTE */
div[data-testid="stDownloadButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 18px !important;
    border-radius: 12px !important; height: 56px !important;
    background: rgba(125, 175, 107, 0.15) !important;
    border: 1px solid rgba(125, 175, 107, 0.4) !important;
    color: var(--st-aprobado) !important;
    width: 100% !important;
    box-shadow: 0 4px 15px rgba(125, 175, 107, 0.1) !important;
}
div[data-testid="stDownloadButton"] button:hover {
    background: rgba(125, 175, 107, 0.25) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 20px rgba(125, 175, 107, 0.2) !important;
}

/* ── Dataframes (Tabla) ───────────────────────────────────── */
div[data-testid="stDataFrame"] {
    border-radius: 12px !important;
    border: 1px solid var(--border-soft) !important;
}
div[data-testid="stDataFrame"] th {
    background: rgba(13, 5, 32, 0.9) !important;
    color: var(--accent-sand) !important;
    font-size: 11px !important; letter-spacing: 1px !important;
}
div[data-testid="stDataFrame"] td {
    color: var(--text-primary) !important; font-size: 12px !important;
}

/* ── Tabs (Gráficos) ──────────────────────────────────────── */
div[data-testid="stTabs"] [role="tablist"] {
    background: rgba(13, 5, 32, 0.6) !important;
    border-radius: 12px !important; padding: 4px !important;
    border: 1px solid var(--border-soft) !important;
}
div[data-testid="stTabs"] [role="tab"] {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 15px !important;
    color: var(--text-dim) !important;
    border-radius: 8px !important; border: none !important;
}
div[data-testid="stTabs"] [role="tab"][aria-selected="true"] {
    background: rgba(167, 139, 250, 0.28) !important;
    color: var(--accent-amber) !important;
    border: 1px solid var(--border-soft) !important;
}

/* ── Scrollbars nativos ───────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(124, 58, 237, 0.2); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(124, 58, 237, 0.4); }

/* ── Mobile Stacking ──────────────────────────────────────── */
@media (max-width: 768px) {
    div[data-testid="column"] {
        width: 100% !important;
        min-width: 100% !important;
        padding: 0 !important;
        margin-bottom: 8px !important;
    }
    .topbar { padding: 12px 16px; }
    .kpi-chip { min-width: 30%; } /* Caben 3 por fila en móvil */
}
</style>
"""

# ──────────────────────────────────────────────────────────────────────────────
# VISOR PC — BASE (variables, reset, topbar, botones, inputs, scrollbar)
# ──────────────────────────────────────────────────────────────────────────────
VISOR_BASE_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── Variables globales ─────────────────────────────────────── */
:root {
    --bg-darkest:   #261052;
    --bg-dark:      #1A0D3C;
    --bg-card:      rgba(32, 14, 77, 0.80);
    --bg-card-alt:  rgba(26, 13, 60, 0.90);

    --accent-amber:    #7C3AED;
    --accent-sand:     #A78BFA;
    --accent-warm:     #F0EEFF;

    --status-approved: #7DAF6B;
    --status-rejected: #C0584A;
    --status-pending:  #7C3AED;
    --status-featured: #FFEA05;

    --text-primary: #F0EEFF;
    --text-muted:   rgba(240, 238, 255, 0.50);
    --text-dim:     rgba(240, 238, 255, 0.30);

    --border-soft:  rgba(167, 139, 250, 0.28);
    --border-light: rgba(255, 255, 255, 0.06);
}

/* ── Reset ──────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body,
[data-testid="stAppViewContainer"],
[data-testid="stMain"] {
    background:  var(--bg-darkest) !important;
    color:       var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
}

/* ── Ocultar chrome de Streamlit ────────────────────────────── */
[data-testid="stHeader"],
[data-testid="stToolbar"],
[data-testid="stDecoration"],
section[data-testid="stSidebar"],
footer { display: none !important; }

/* ── Contenedor principal ───────────────────────────────────── */
[data-testid="stMainBlockContainer"],
.block-container {
    padding:   20px 16px !important;
    max-width: 1100px !important;
    margin:    0 auto !important;
}

/* ── Fondo textura sutil ────────────────────────────────────── */
[data-testid="stAppViewContainer"]::before {
    content: ''; position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(124,58,237,0.05) 0%, transparent 60%),
        repeating-linear-gradient(0deg,  transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Topbar ─────────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px;
    background: rgba(19, 10, 48, 0.95);
    border-bottom: 1px solid var(--border-soft);
    border-radius: 14px;
    position: sticky; top: 0; z-index: 100;
    margin-bottom: 18px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
/* ── Logo animado — retroiluminación con movimiento ─────────── */
.topbar-logo,
.sm-logo-anim {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 3px !important;
    background: linear-gradient(
        90deg,
        #4B10A3  0%,
        #7C3AED  20%,
        #FFF580  50%,
        #7C3AED  80%,
        #4B10A3  100%
    ) !important;
    background-size: 250% 100% !important;
    -webkit-background-clip: text !important;
    -webkit-text-fill-color: transparent !important;
    background-clip: text !important;
    filter: drop-shadow(0 0 4px rgba(124,58,237,0.25));
    animation:
        sm-logo-shimmer 5s ease-in-out infinite,
        sm-logo-glow    5s ease-in-out infinite;
}
.topbar-logo { font-size: 22px !important; }

@keyframes sm-logo-shimmer {
    0%   { background-position: 150% 0; }
    50%  { background-position: -50% 0; }
    100% { background-position: 150% 0; }
}
@keyframes sm-logo-glow {
    0%, 100% { filter: drop-shadow(0 0 4px rgba(124,58,237,0.20)); }
    45%      { filter: drop-shadow(0 0 14px rgba(255,245,80,0.80))
                        drop-shadow(0 0 32px rgba(124,58,237,0.45)); }
    65%      { filter: drop-shadow(0 0 18px rgba(255,250,120,0.95))
                        drop-shadow(0 0 42px rgba(124,58,237,0.55)); }
}

.topbar-meta { font-size: 12px; color: var(--text-muted); }

/* ── Tarjetas genéricas ─────────────────────────────────────── */
.card {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
}
.card-title {
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--accent-amber); margin-bottom: 12px;
    display: flex; align-items: center; gap: 8px; font-weight: 600;
}
.card-title::after {
    content: ''; flex: 1; height: 1px; background: var(--border-soft);
}

/* ── Sistema de botones ─────────────────────────────────────── */
div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    font-size: 13px !important;
    border-radius: 8px !important;
    height:     auto !important;
    min-height: 36px !important;
    padding:    7px 14px !important;
    line-height: 1.3 !important;
    white-space: normal !important;
    word-break: keep-all !important;
    overflow-wrap: break-word !important;
    overflow:    visible !important;
    transition: all 0.15s ease !important;
    border: 1px solid rgba(124, 58, 237, 0.25) !important;
    background: rgba(124, 58, 237, 0.08) !important;
    color: var(--accent-amber) !important;
}
div[data-testid="stButton"] button p {
    white-space: normal !important;
    line-height: 1.3 !important;
    margin: 0 !important;
    overflow: visible !important;
}
div[data-testid="stButton"] button:hover {
    background:  rgba(124, 58, 237, 0.18) !important;
    border-color: var(--accent-amber) !important;
    transform:   translateY(-1px) !important;
}
div[data-testid="stButton"] button:active  { transform: translateY(0) !important; }
div[data-testid="stButton"] button:disabled {
    opacity: 0.35 !important;
    cursor: not-allowed !important;
    transform: none !important;
    filter: grayscale(40%) !important;
}

div[data-testid="stButton"] button[kind="secondary"] {
    background:   transparent !important;
    border:       1px solid rgba(240, 238, 255, 0.12) !important;
    color:        var(--text-muted) !important;
    letter-spacing: 1.5px !important;
}
div[data-testid="stButton"] button[kind="secondary"]:hover {
    background:   rgba(255,255,255,0.04) !important;
    border-color: rgba(240, 238, 255, 0.30) !important;
    color:        var(--text-primary) !important;
}

div[data-testid="stFormSubmitButton"] button {
    font-family:   'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important;
    font-size:     17px !important;
    border-radius: 8px !important;
    min-height:    48px !important;
    height:        auto !important;
    padding:       10px 24px !important;
    width:         100% !important;
    border:        none !important;
    background:    var(--accent-amber) !important;
    color:         #261052 !important;
    transition:    all 0.2s ease !important;
}
div[data-testid="stFormSubmitButton"] button:hover {
    background: #FFEA05 !important;
    transform:  translateY(-2px) !important;
    box-shadow: 0 6px 20px rgba(124, 58, 237, 0.30) !important;
}

/* ── Inputs ─────────────────────────────────────────────────── */
div[data-testid="stTextInput"] input,
div[data-testid="stSelectbox"] > div > div,
div[data-testid="stTextArea"] textarea {
    background:   rgba(0,0,0,0.30) !important;
    border:       1px solid var(--border-soft) !important;
    border-radius: 8px !important;
    color:        var(--text-primary) !important;
    font-family:  'DM Sans', sans-serif !important;
    font-size:    14px !important;
}
div[data-testid="stTextInput"] input:focus,
div[data-testid="stTextArea"] textarea:focus {
    border-color: var(--accent-amber) !important;
    box-shadow:   0 0 0 2px rgba(167,139,250,0.28) !important;
}
.stTextInput  label,
.stTextArea   label,
.stSelectbox  label { display: none !important; }

/* ── Alertas ────────────────────────────────────────────────── */
div[data-testid="stAlert"] {
    background:   rgba(192, 88, 74, 0.10) !important;
    border:       1px solid rgba(192, 88, 74, 0.30) !important;
    border-radius: 8px !important;
    color:        #f87171 !important;
    padding:      10px 14px !important;
}
div[data-testid="stSuccess"] {
    background:   rgba(125, 175, 107, 0.10) !important;
    border:       1px solid rgba(125, 175, 107, 0.30) !important;
    border-radius: 8px !important;
    color:        #86EFAC !important;
}

/* ── Scrollbar ──────────────────────────────────────────────── */
::-webkit-scrollbar       { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
    background:    rgba(167, 139, 250, 0.28);
    border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover { background: rgba(124, 58, 237, 0.30); }

/* ── Responsive móvil ───────────────────────────────────────── */
@media (max-width: 640px) {
    [data-testid="stMainBlockContainer"],
    .block-container {
        padding:   12px 8px !important;
        max-width: 100% !important;
    }
    .topbar {
        padding:       10px 12px;
        border-radius: 0;
        margin-bottom: 10px;
    }
    .topbar-logo          { font-size: 20px; }
    .topbar > div:last-child { display: none; }

    div[data-testid="stButton"] button {
        min-height: 44px !important;
        padding:    8px 10px !important;
        font-size:  12px !important;
    }
}
</style>
"""

# ──────────────────────────────────────────────────────────────────────────────
# VISOR PC — CSS ESPECÍFICO (layout 70/30, panel evaluación, botones acción)
# ──────────────────────────────────────────────────────────────────────────────
VISOR_PC_CSS = """
<style>
/* ══════════════════════════════════════════════════
   LAYOUT — ANCHO COMPLETO (override shared styles)
   Sin max-width: 1100px para que las columnas 70/30
   puedan usar todo el viewport disponible.
   ══════════════════════════════════════════════════ */
[data-testid="stMainBlockContainer"],
.block-container {
    max-width: 100% !important;
    padding: 12px 16px !important;
}
section[data-testid="stSidebar"] { display: none !important; }

/* Force 70/30 layout ONLY on the main content block that has the eval panel */
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) {
    display: grid !important;
    grid-template-columns: 1fr 0.428fr !important;
    gap: 16px !important;
    width: 100% !important;
    align-items: start !important;
}

[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > div,
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > [data-testid="stColumn"] {
    min-width: 0 !important;
}

[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > div:nth-of-type(1),
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > [data-testid="stColumn"]:nth-of-type(1) {
    grid-column: 1 !important;
}

[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > div:nth-of-type(2),
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > [data-testid="stColumn"]:nth-of-type(2) {
    grid-column: 2 !important;
}

/* keep the panel visible as the user scrolls */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
    position: sticky !important;
    top: 90px !important;
    align-self: flex-start !important;
    z-index: 50 !important;
}

/* ══════════════════════════════════════════════════
   FIX-1: Evitar flash negro / overlay oscuro al navegar
   ══════════════════════════════════════════════════ */
[data-testid="stCustomComponentV1"],
[data-testid="stCustomComponentV1"] iframe,
div[class*="stIFrame"],
div[class*="stIFrame"] iframe {
    background: #0A0320 !important;
}

[data-testid="stStatusWidget"]       { display: none !important; }
[data-testid="stDecoration"]         { display: none !important; }
div[class*="StatusWidget"]           { display: none !important; }

/* ══════════════════════════════════════════════════
   FIX-STALE: Evitar difuminado durante reruns
   ══════════════════════════════════════════════════ */
.stale,
[data-stale="true"],
div[class*="stale"],
span[class*="stale"] {
    opacity: 1 !important;
    transition: none !important;
    filter: none !important;
}
[data-testid="stApp"],
[data-testid="stMain"],
[data-testid="stAppViewContainer"],
[data-testid="stMainBlockContainer"],
.stApp, .main {
    opacity: 1 !important;
    filter: none !important;
    transition: opacity 0s !important;
}

/* ══════════════════════════════════════════════════
   TOPBAR — STAT PILLS
   ══════════════════════════════════════════════════ */
.topbar-stat-pill {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 13px; line-height: 1;
    padding: 3px 10px; border-radius: 20px;
    border: 1px solid transparent; white-space: nowrap;
}
.top-stat-pend { color: var(--accent-amber);      border-color: rgba(124,58,237,.25); background: rgba(124,58,237,.07); }
.top-stat-apro { color: var(--status-approved);   border-color: rgba(94,168,82,.25);   background: rgba(94,168,82,.07);   }
.top-stat-dest { color: #FFB800;                  border-color: rgba(255,234,5,.25);  background: rgba(255,234,5,.07);  }
.top-stat-rech { color: var(--status-rejected);   border-color: rgba(192,88,74,.25);   background: rgba(192,88,74,.07);   }

/* ── Empty state ─────────────────────────────────── */
.empty-state { text-align: center; padding: 50px 20px; color: var(--text-muted); }
.empty-icon  { font-size: 48px; margin-bottom: 16px; }
.empty-title {
    font-family: 'Bebas Neue', sans-serif; font-size: 26px;
    color: var(--text-primary); letter-spacing: 2px; margin-bottom: 8px;
}

/* ── Flash de feedback ───────────────────────────── */
.flash-msg {
    position: fixed; bottom: 28px; left: 50%;
    transform: translateX(-50%);
    padding: 12px 26px; border-radius: 50px;
    font-size: 12px; font-weight: 600; z-index: 10000;
    animation: sm-flash-fadeup 0.3s ease, sm-flash-fadeout 0.4s ease 2s forwards;
    pointer-events: none;
}
@keyframes sm-flash-fadeup  { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
@keyframes sm-flash-fadeout { to{opacity:0} }

/* ── Expander filtro ─────────────────────────────── */
div[data-testid="stExpander"] {
    background: transparent !important;
    border: 1px solid var(--border-soft) !important;
    border-radius: 10px !important;
    margin: 4px 0 10px !important;
}
div[data-testid="stExpander"] summary {
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 13px !important; letter-spacing: 1.5px !important;
    color: var(--accent-amber) !important; padding: 10px 14px !important;
}

/* ── TextArea ────────────────────────────────────── */
div[data-testid="stTextArea"] textarea {
    min-height: 52px !important; height: 52px !important; resize: vertical !important;
}

/* ══════════════════════════════════════════════════
   PANEL DE EVALUACIÓN (columna derecha)
   ══════════════════════════════════════════════════ */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    padding: 18px !important;
    gap: 10px !important;
}

.floating-info {
    display: flex; flex-direction: column; gap: 7px;
    margin-bottom: 8px; padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.f-item {
    display: flex; align-items: center; gap: 8px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.f-icon { font-size: 14px; color: var(--accent-amber); flex-shrink: 0; }
.f-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.f-num  { font-family: 'Bebas Neue', sans-serif; font-size: 17px;
          letter-spacing: 1px; color: var(--accent-amber); }
.f-dim  { font-size: 10px; color: var(--text-dim); margin-right: 2px; flex-shrink: 0; }
.f-pdv  { font-size: 13px; color: var(--text-primary); }
.f-date { font-size: 11px; color: var(--text-dim); font-family: monospace; letter-spacing: 0.5px; }

/* ── FIX-2: Hint ráfaga ── */
.rafaga-hint {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: rgba(124,58,237,.08);
    border: 1px solid rgba(124,58,237,.22);
    border-radius: 8px;
    padding: 8px 10px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 12px; letter-spacing: 1.2px;
    color: var(--accent-amber);
    text-align: center;
}

/* ══════════════════════════════════════════════════
   BOTONES DE ACCIÓN — APROBAR / DESTACAR / RECHAZAR
   ══════════════════════════════════════════════════ */
@keyframes destacar-glow {
  0%,  100% {
    box-shadow: 0 4px 10px rgba(167,139,250,0.28),
                0 0  0px  0px rgba(124,58,237,0.0);
  }
  50% {
    box-shadow: 0 4px 18px rgba(124,58,237,0.40),
                0 0  14px  3px rgba(124,58,237,0.18);
  }
}

[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stHorizontalBlock"] {
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 7px !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button {
    width: 100% !important;
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 13px !important;
    letter-spacing: 1px !important;
    padding: 12px 4px !important;
    min-height: 48px !important;
    height: auto !important;
    border: none !important;
    border-radius: 10px !important;
    white-space: normal !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    transition: filter .15s, transform .15s, box-shadow .15s !important;
}

/* ── APROBAR — verde vivo ── */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(1)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #1b6612, #3ec234) !important;
    color: #fff !important;
    box-shadow: 0 4px 12px rgba(62,194,52,0.20) !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(1)
    div[data-testid="stButton"] button:hover:not(:disabled) {
    filter: brightness(1.12) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 22px rgba(62,194,52,0.48) !important;
}

/* ── DESTACAR — ámbar + pulso ── */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(2)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #5B21B6, #7C3AED) !important;
    color: #261052 !important;
    font-weight: 800 !important;
    animation: destacar-glow 2.8s ease-in-out infinite !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(2)
    div[data-testid="stButton"] button:hover:not(:disabled) {
    filter: brightness(1.15) !important;
    transform: translateY(-2px) !important;
}

/* ── RECHAZAR — rojo oscuro ── */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(3)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #6A2318, #C0584A) !important;
    color: #fff !important;
}

/* hover genérico para los tres */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button:hover:not(:disabled) {
    filter: brightness(1.18) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.45) !important;
}

/* Estado deshabilitado */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button:disabled {
    background: rgba(255,255,255,0.07) !important;
    color: rgba(240,238,255,0.30) !important;
    box-shadow: none !important;
    animation: none !important;
    cursor: not-allowed !important;
    transform: none !important;
    filter: none !important;
}

/* ── Acciones secundarias dentro del panel ── */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button[kind="secondary"] {
    font-size: 9px !important;
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    padding: 6px 8px !important;
    min-height: 32px !important;
    height: auto !important;
    border-radius: 8px !important;
    white-space: normal !important;
    animation: none !important;
}

/* ── Botones de navegación (ocultos en DOM, solo para JS) ── */
div[data-testid="stVerticalBlock"]:has(> [data-testid="stMarkdownContainer"] #nav-anchor) {
    position: fixed !important;
    top: -9999px !important;
    left: -9999px !important;
    pointer-events: none !important;
}

/* ── Acciones secundarias (REVERTIR / RECARGAR / SALIR) ── */
div:has(> #secondary-actions-anchor) ~ [data-testid="stHorizontalBlock"]
    [data-testid="stButton"] button {
    background: transparent !important;
    border: 1px solid rgba(240,238,255,0.12) !important;
    color: var(--text-muted) !important;
    font-size: 9px !important;
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    padding: 6px 8px !important;
    min-height: 32px !important;
    animation: none !important;
    box-shadow: none !important;
}
div:has(> #secondary-actions-anchor) ~ [data-testid="stHorizontalBlock"]
    [data-testid="stButton"] button:hover:not(:disabled) {
    background: rgba(255,255,255,0.04) !important;
    border-color: rgba(240,238,255,0.30) !important;
    color: var(--text-primary) !important;
    transform: none !important;
    box-shadow: none !important;
    filter: none !important;
}
div:has(> #secondary-actions-anchor) ~ [data-testid="stHorizontalBlock"]
    [data-testid="stButton"] button:disabled {
    opacity: 0.28 !important;
    cursor: not-allowed !important;
    transform: none !important;
}

/* ── Botones F1/F2 (ocultos en DOM, solo para JS) ── */
div[data-testid="stVerticalBlock"]:has(> [data-testid="stMarkdownContainer"] #foto-nav-hidden) {
    position: fixed !important;
    top: -9999px !important;
    left: -9999px !important;
    pointer-events: none !important;
}
</style>
"""

# ──────────────────────────────────────────────────────────────────────────────
# VISOR MOBILE — Página "En Construcción"
# ──────────────────────────────────────────────────────────────────────────────
VISOR_MOBILE_STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400&display=swap');
html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: #261052 !important;
    color: #F0EEFF !important;
    font-family: 'DM Sans', sans-serif !important;
}
[data-testid="stHeader"], [data-testid="stToolbar"], section[data-testid="stSidebar"] { display: none !important; }

.menu-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 64px; letter-spacing: 5px;
    text-align: center; margin-bottom: 10px;
    background: linear-gradient(90deg, #4B10A3 0%, #7C3AED 20%, #FFF580 50%, #7C3AED 80%, #4B10A3 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 5s ease-in-out infinite;
}
@keyframes shimmer { 0% { background-position: 150% 0; } 50% { background-position: -50% 0; } 100% { background-position: 150% 0; } }

div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 16px !important;
    background: transparent !important;
    border: 1px solid rgba(124, 58, 237, 0.5) !important;
    color: #7C3AED !important;
    border-radius: 8px !important; width: 100% !important; height: 44px !important;
}
div[data-testid="stButton"] button:hover { background: rgba(124, 58, 237, 0.1) !important; }
</style>
"""
