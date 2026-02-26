import re

path = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\CenterMind\StreamLitApp\pages\1_Visor.py"
text = open(path, 'r', encoding='utf8').read()

new_func = '''def render_visor():
    # Carga inicial
    if not st.session_state._visor_loaded:
        reload_pendientes()
        st.session_state._visor_loaded = True

    if HAS_AUTOREFRESH:
        count = st_autorefresh(interval=30000, limit=None, key="visor_autorefresh")
        if count > 0:
            reload_pendientes_silent()

    st.markdown(STYLE, unsafe_allow_html=True)

    u    = st.session_state.user
    dist = u.get("nombre_empresa", "")

    # ── Calcular estado ANTES del topbar (para incluir stats y counter) ───────
    pend   = st.session_state.pendientes
    filtro = st.session_state.filtro_vendedor
    pend_filtrada = (
        [p for p in pend if p.get("vendedor") == filtro]
        if filtro != "Todos" else pend
    )
    idx = st.session_state.idx
    if pend_filtrada and idx >= len(pend_filtrada):
        st.session_state.idx = len(pend_filtrada) - 1
        idx = st.session_state.idx
    n_pend = len(pend_filtrada)

    # Stats del día para topbar
    stats = get_stats_hoy(u["id_distribuidor"])

    # ── Topbar con stats integradas ───────────────────────────────────────────
    counter_str = f"{idx+1}/{n_pend}" if pend_filtrada else "—"
    st.markdown(
        '<div class="topbar">'
        '<div style="display:flex;align-items:center;gap:10px;">'
        '<span class="topbar-logo">SHELFMIND</span>'
        f'<span class="topbar-meta">{dist}</span>'
        '<span class="topbar-meta" style="opacity:.3;">·</span>'
        f'<span class="topbar-meta" style="color:var(--accent-amber);font-weight:700;">'
        f'{counter_str}</span>'
        '</div>'
        '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">'
        f'<span class="topbar-stat-pill top-stat-pend">⏳ {stats.get("pendientes",0)}</span>'
        f'<span class="topbar-stat-pill top-stat-apro">✅ {stats.get("aprobadas",0)}</span>'
        f'<span class="topbar-stat-pill top-stat-dest">🔥 {stats.get("destacadas",0)}</span>'
        f'<span class="topbar-stat-pill top-stat-rech">❌ {stats.get("rechazadas",0)}</span>'
        '</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Filtro vendedor ───────────────────────────────────────────────────────
    vends    = get_vendedores_pendientes(u["id_distribuidor"])
    opciones = ["Todos"] + vends
    filtro_actual = st.session_state.filtro_vendedor
    if filtro_actual not in opciones:
        opciones.append(filtro_actual)

    if pend or filtro_actual != "Todos":
        with st.expander(f"🔍 FILTRAR: {filtro_actual.upper()}", expanded=False):
            sel = st.selectbox(
                "Vendedor", opciones,
                index=opciones.index(filtro_actual),
                key="sel_vendedor", label_visibility="collapsed",
            )
            ca, cl = st.columns([2, 1])
            with ca:
                if st.button("APLICAR FILTRO", key="btn_aplicar"):
                    st.session_state.filtro_vendedor = sel
                    st.session_state.idx = 0
                    st.rerun()
            with cl:
                if st.button("✕ LIMPIAR", key="btn_limpiar", disabled=(filtro_actual == "Todos")):
                    st.session_state.filtro_vendedor = "Todos"
                    st.session_state.idx = 0
                    st.rerun()

    # ── Flash ─────────────────────────────────────────────────────────────────
    if st.session_state.flash:
        cf = {
            "green": ("rgba(20,80,40,.95)",  "#4ade80", "1px solid rgba(74,222,128,.4)"),
            "red":   ("rgba(80,20,20,.95)",  "#f87171", "1px solid rgba(248,113,113,.4)"),
            "amber": ("rgba(80,60,10,.95)",  "#fbbf24", "1px solid rgba(251,191,36,.4)"),
        }
        bg, tc, bdr = cf.get(st.session_state.flash_type, cf["green"])
        st.markdown(
            f'<div class="flash-msg" style="background:{bg};color:{tc};border:{bdr};">'
            f'{st.session_state.flash}</div>',
            unsafe_allow_html=True,
        )
        st.session_state.flash = None

    # ══════════════════════════════════════════════════════════════════════════
    # Layout principal: dos columnas
    # ══════════════════════════════════════════════════════════════════════════
    col_visor, col_panel = st.columns([7, 3])

    with col_visor:
        if not pend_filtrada:
            # Estado vacío
            st.markdown(
                '<div class="empty-state">'
                '<div class="empty-icon">🎯</div>'
                '<div class="empty-title">TODO AL DÍA</div>'
                '<div style="color:var(--text-muted);font-size:14px;">'
                'No hay exhibiciones pendientes.</div>'
                '</div>',
                unsafe_allow_html=True,
            )
            st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
            _, c2, _ = st.columns([1, 2, 1])
            with c2:
                if st.button("↺ BUSCAR NUEVAS", key="btn_reload_empty", use_container_width=True):
                    reload_pendientes(); st.rerun()
                st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
                if st.button("SALIR", key="btn_logout_empty", type="secondary", use_container_width=True):
                    for k in list(st.session_state.keys()): del st.session_state[k]
                    st.rerun()
        else:
            ex       = pend_filtrada[idx]
            fotos    = ex.get("fotos", [])
            n_fotos  = len(fotos)
            foto_idx = st.session_state.foto_idx
            if foto_idx >= n_fotos:
                foto_idx = 0; st.session_state.foto_idx = 0

            # ── Fetch imagen server-side ──────────────────────────────────────
            cred_path = _get_dist_cred_path(u["id_distribuidor"])
            main_fid  = drive_file_id(fotos[foto_idx]["drive_link"]) or ""
            img_src   = fetch_drive_b64(main_fid, cred_path, sz=1000)

            thumb_srcs: List[str] = []
            if n_fotos > 1:
                for f in fotos:
                    tid = drive_file_id(f["drive_link"]) or ""
                    thumb_srcs.append(fetch_drive_b64(tid, cred_path, sz=150))

            # ── Viewer (más alto ahora que ocupa el ancho completo) ───────────
            viewer_height = 540 + (65 if n_fotos > 1 else 0)
            components.html(
                build_viewer_html(
                    fotos, foo... [truncated]