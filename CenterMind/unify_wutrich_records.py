# -*- coding: utf-8 -*-
"""
unify_wutrich_records.py
═══════════════════════
Unificación permanente: Matias Wutrich → Ivan Wutrich (Dist 3 – Tabaco).

Acciones:
  1. Localiza id_integrante de AMBAS cuentas (por nombre y/o Telegram UID conocidos).
  2. Reasigna todas las exhibiciones del id_integrante de Matias al de Ivan.
  3. Marca la cuenta de Matias como activo=False en integrantes_grupo.
  4. (Opcional) desactiva la cuenta en vendedores_v2 si está vinculada.

Correr con:  python unify_wutrich_records.py [--dry-run]
"""

import os
import sys
import argparse
import logging
from dotenv import load_dotenv

# ── Carga de credenciales ──────────────────────────────────────────────────
# Intenta primero el .env local (Mac/Linux), luego el path Windows legacy.
_env_local = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_local):
    load_dotenv(_env_local)
else:
    load_dotenv()

from supabase import create_client, Client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("UnifyWutrich")

DIST_ID = 3  # Tabaco & Hnos S.R.L.


def get_sb() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY no encontradas en el entorno.")
    return create_client(url, key)


def find_wutrich_accounts(sb: Client) -> tuple[dict | None, dict | None]:
    """
    Devuelve (ivan_row, matias_row) desde integrantes_grupo.
    Busca por nombre conteniendo 'wutrich' (case-insensitive).
    """
    # Buscar con patrón amplio para capturar "Wuthrich" y "Wüthrich"
    res = sb.table("integrantes_grupo") \
        .select("id_integrante, telegram_user_id, nombre_integrante, id_vendedor_v2") \
        .eq("id_distribuidor", DIST_ID) \
        .ilike("nombre_integrante", "%thrich%") \
        .execute()

    rows = res.data or []
    if not rows:
        log.warning("No se encontraron cuentas Wutrich/Wüthrich en integrantes_grupo.")
        return None, None

    log.info(f"Cuentas Wutrich/Wüthrich encontradas ({len(rows)}):")
    for r in rows:
        log.info(f"  id_integrante={r['id_integrante']} | UID={r['telegram_user_id']} "
                 f"| nombre='{r['nombre_integrante']}'")

    def norm(s): return (s or "").lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
    ivan_row   = next((r for r in rows if "ivan"   in norm(r["nombre_integrante"])), None)
    matias_row = next((r for r in rows if "matias" in norm(r["nombre_integrante"])), None)

    # Fallback: si hay exactamente 2 registros y no se diferenciaron por nombre,
    # el de mayor id_integrante es la cuenta más nueva → se trata como duplicado
    if not matias_row and len(rows) == 2 and ivan_row:
        matias_row = [r for r in rows if r["id_integrante"] != ivan_row["id_integrante"]][0]
        log.warning(f"Matias no identificado por nombre. Asumiendo id_integrante={matias_row['id_integrante']} como duplicado.")

    return ivan_row, matias_row


def count_exhibiciones(sb: Client, id_integrante: int) -> int:
    res = sb.table("exhibiciones") \
        .select("id_exhibicion", count="exact") \
        .eq("id_distribuidor", DIST_ID) \
        .eq("id_integrante", id_integrante) \
        .execute()
    return res.count or 0


def run(dry_run: bool = False) -> None:
    sb = get_sb()

    ivan_row, matias_row = find_wutrich_accounts(sb)

    if not ivan_row:
        log.error("No se encontró cuenta 'Ivan Wutrich'. Abortando.")
        sys.exit(1)
    if not matias_row:
        log.warning("No se encontró cuenta 'Matias Wutrich'. Nada que unificar.")
        sys.exit(0)

    ivan_id   = ivan_row["id_integrante"]
    matias_id = matias_row["id_integrante"]

    total_matias = count_exhibiciones(sb, matias_id)
    log.info(f"Exhibiciones bajo Matias (id={matias_id}): {total_matias}")
    log.info(f"Exhibiciones bajo Ivan   (id={ivan_id}):   {count_exhibiciones(sb, ivan_id)}")

    if dry_run:
        log.info("[DRY-RUN] Las siguientes acciones serían ejecutadas:")
        log.info(f"  UPDATE exhibiciones SET id_integrante={ivan_id} WHERE id_integrante={matias_id} (dist={DIST_ID})")
        log.info(f"  UPDATE integrantes_grupo SET estado_mapeo='fusionado' WHERE id_integrante={matias_id}")
        log.info(f"  → Agregar UID {matias_row.get('telegram_user_id')} a EXCLUDE_UIDS en bot_worker.py")
        if matias_row.get("id_vendedor_v2"):
            log.info(f"  UPDATE vendedores_v2 SET activo=false WHERE id_vendedor={matias_row['id_vendedor_v2']}")
        log.info("[DRY-RUN] Fin. No se realizaron cambios.")
        return

    # ── 1. Reasignar exhibiciones ─────────────────────────────────────
    if total_matias > 0:
        log.info(f"Reasignando {total_matias} exhibición(es) de id_integrante={matias_id} → {ivan_id}...")
        # PostgREST no soporta UPDATE masivo directo; usamos update filtrado
        res_upd = sb.table("exhibiciones") \
            .update({"id_integrante": ivan_id}) \
            .eq("id_distribuidor", DIST_ID) \
            .eq("id_integrante", matias_id) \
            .execute()
        log.info(f"  OK – filas afectadas reportadas por Supabase: {len(res_upd.data or [])}")
    else:
        log.info("No hay exhibiciones de Matias para reasignar.")

    # ── 2. Marcar cuenta de Matias como "fusionada" en integrantes_grupo
    # La tabla no tiene columna 'activo'; usamos estado_mapeo='fusionado' como señal.
    log.info(f"Marcando integrante id={matias_id} (Matias Wutrich) como estado_mapeo='fusionado'...")
    sb.table("integrantes_grupo") \
        .update({"estado_mapeo": "fusionado"}) \
        .eq("id_integrante", matias_id) \
        .execute()
    log.info("  OK – estado_mapeo='fusionado' seteado en integrantes_grupo.")
    log.info(f"  ⚠️  Agregar telegram_user_id={matias_row.get('telegram_user_id')} a "
             f"EXCLUDE_UIDS en bot_worker.py (Dist {DIST_ID}) para excluir del ranking.")

    # ── 3. Desactivar en vendedores_v2 si aplica ─────────────────────
    id_vend_v2 = matias_row.get("id_vendedor_v2")
    if id_vend_v2:
        log.info(f"Desactivando vendedor_v2 id={id_vend_v2}...")
        try:
            sb.table("vendedores_v2") \
                .update({"activo": False}) \
                .eq("id_vendedor", id_vend_v2) \
                .execute()
            log.info("  OK – activo=False seteado en vendedores_v2.")
        except Exception as e:
            log.warning(f"  No se pudo actualizar vendedores_v2: {e}")

    # ── Verificación final ───────────────────────────────────────────
    log.info("Verificación post-migración:")
    log.info(f"  Exhibiciones bajo Ivan   (id={ivan_id}): {count_exhibiciones(sb, ivan_id)}")
    log.info(f"  Exhibiciones bajo Matias (id={matias_id}): {count_exhibiciones(sb, matias_id)} (debe ser 0)")
    log.info("✅ Unificación Wutrich completada.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Unifica Matias Wutrich → Ivan Wutrich (Dist 3)")
    parser.add_argument("--dry-run", action="store_true", help="Muestra acciones sin ejecutarlas")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
