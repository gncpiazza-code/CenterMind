# -*- coding: utf-8 -*-
"""
ShelfMind — Sistema de Estilos Compartidos
==========================================
Importar en cada página con:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from _shared_styles import BASE_CSS

Luego combinar:
    PAGE_CSS = BASE_CSS + "<style>... overrides específicos ...</style>"
    st.markdown(PAGE_CSS, unsafe_allow_html=True)
"""

# ─── Paleta (para uso desde Python si se necesitan colores) ───────────────────
PALETTE = {
    "bg_darkest":       "#1A1311",
    "bg_dark":          "#211510",
    "bg_card":          "rgba(42, 30, 24, 0.8)",
    "bg_card_alt":      "rgba(33, 21, 16, 0.9)",
    "accent_amber":     "#D9A76A",
    "accent_sand":      "#D9BD9C",
    "status_green":     "#7DAF6B",
    "status_red":       "#C0584A",
    "status_amber":     "#D9A76A",
    "status_featured":  "#FFC107",
    "text_primary":     "#F0E6D8",
    "text_muted":       "rgba(240, 230, 216, 0.5)",
    "text_dim":         "rgba(240, 230, 216, 0.3)",
    "border_soft":      "rgba(217, 167, 106, 0.15)",
    "border_light":     "rgba(255, 255, 255, 0.06)",
}

# ─── CSS Base ─────────────────────────────────────────────────────────────────
BASE_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── Variables globales ─────────────────────────────────────── */
:root {
    --bg-darkest:   #1A1311;
    --bg-dark:      #211510;
    --bg-card:      rgba(42, 30, 24, 0.80);
    --bg-card-alt:  rgba(33, 21, 16, 0.90);

    --accent-amber:    #D9A76A;
    --accent-sand:     #D9BD9C;
    --accent-warm:     #F0E6D8;

    --status-approved: #7DAF6B;
    --status-rejected: #C0584A;
    --status-pending:  #D9A76A;
    --status-featured: #FFC107;

    --text-primary: #F0E6D8;
    --text-muted:   rgba(240, 230, 216, 0.50);
    --text-dim:     rgba(240, 230, 216, 0.30);

    --border-soft:  rgba(217, 167, 106, 0.15);
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
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(217,167,106,0.05) 0%, transparent 60%),
        repeating-linear-gradient(0deg,  transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Topbar ─────────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px;
    background: rgba(26, 19, 17, 0.95);
    border-bottom: 1px solid var(--border-soft);
    border-radius: 14px;
    position: sticky; top: 0; z-index: 100;
    margin-bottom: 18px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
/* ── Logo animado — retroiluminación con movimiento ─────────── */
/* Aplica a .topbar-logo (visor/admin) y .sm-logo-anim (app.py) */
.topbar-logo,
.sm-logo-anim {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 3px !important;

    /* Degradado dorado que se desplaza → shimmer */
    background: linear-gradient(
        90deg,
        #8C5A1F  0%,
        #D9A76A  20%,
        #FFE8B0  50%,
        #D9A76A  80%,
        #8C5A1F  100%
    ) !important;
    background-size: 250% 100% !important;
    -webkit-background-clip: text !important;
    -webkit-text-fill-color: transparent !important;
    background-clip: text !important;

    /* Glow pulsante (drop-shadow funciona con texto transparente) */
    filter: drop-shadow(0 0 4px rgba(217,167,106,0.25));

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
    0%, 100% { filter: drop-shadow(0 0 4px rgba(217,167,106,0.20)); }
    45%      { filter: drop-shadow(0 0 14px rgba(255,215,120,0.80))
                        drop-shadow(0 0 32px rgba(217,167,106,0.45)); }
    65%      { filter: drop-shadow(0 0 18px rgba(255,225,140,0.95))
                        drop-shadow(0 0 42px rgba(217,167,106,0.55)); }
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

/* ═══════════════════════════════════════════════════════════════
   SISTEMA DE BOTONES
   ───────────────────────────────────────────────────────────────
   Problema resuelto:
     • height fijo + white-space:nowrap  → texto desborda el botón
     • width:100% global                 → botones desproporcionados
   Solución:
     • height:auto + min-height + padding  → se ajusta al contenido
     • white-space:normal                  → texto se envuelve
     • sin width forzado en la base        → cada contexto decide
   ═══════════════════════════════════════════════════════════════ */

/* Nivel 1 — Base: todos los botones */
div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    font-size: 13px !important;
    border-radius: 8px !important;

    /* Tamaño flexible basado en contenido */
    height:     auto !important;
    min-height: 36px !important;
    padding:    7px 14px !important;
    line-height: 1.3 !important;

    /* Permite que el texto se envuelva si no entra en una línea */
    white-space: normal !important;
    word-break:  normal !important;
    overflow:    visible !important;

    transition: all 0.15s ease !important;
    border: 1px solid rgba(217, 167, 106, 0.25) !important;
    background: rgba(217, 167, 106, 0.08) !important;
    color: var(--accent-amber) !important;
}
/* El <p> interno del botón también debe poder envolver */
div[data-testid="stButton"] button p {
    white-space: normal !important;
    line-height: 1.3 !important;
    margin: 0 !important;
    overflow: visible !important;
}
div[data-testid="stButton"] button:hover {
    background:  rgba(217, 167, 106, 0.18) !important;
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

/* Nivel 2 — Secondary: acciones de salida (SALIR, VOLVER) */
div[data-testid="stButton"] button[kind="secondary"] {
    background:   transparent !important;
    border:       1px solid rgba(240, 230, 216, 0.12) !important;
    color:        var(--text-muted) !important;
    letter-spacing: 1.5px !important;
}
div[data-testid="stButton"] button[kind="secondary"]:hover {
    background:   rgba(255,255,255,0.04) !important;
    border-color: rgba(240, 230, 216, 0.30) !important;
    color:        var(--text-primary) !important;
}

/* Nivel 3 — Form Submit (login, guardado) */
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
    color:         #1A1311 !important;
    transition:    all 0.2s ease !important;
}
div[data-testid="stFormSubmitButton"] button:hover {
    background: #FBBF24 !important;
    transform:  translateY(-2px) !important;
    box-shadow: 0 6px 20px rgba(217, 167, 106, 0.30) !important;
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
    box-shadow:   0 0 0 2px rgba(217,167,106,0.15) !important;
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
    background:    rgba(217, 167, 106, 0.15);
    border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover { background: rgba(217, 167, 106, 0.30); }

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
