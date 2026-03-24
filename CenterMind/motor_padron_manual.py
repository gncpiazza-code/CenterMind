import os
import sys
import pandas as pd
from dotenv import load_dotenv

sys.path.append(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind")
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
from db import sb


def sync_padron_excel(file_path: str):
    """
    Lee un Excel del padrón ERP y hace upsert en cascada a las tablas nuevas:
    Excel -> Distribuidores (lectura) -> Sucursales -> Vendedores -> Rutas -> Clientes_PDV
    
    Mapeo de columnas del Excel (Reporte.PadronDeClientes):
      idempresa     -> id_erp en distribuidores (para obtener id_distribuidor)
      idsucur       -> id_sucursal_erp en sucursales
      dssucur       -> nombre_erp en sucursales
      vendedor      -> id_vendedor_erp en vendedores
      d_vendedor    -> nombre_erp en vendedores
      ruta          -> id_ruta_erp en rutas
      Lunes..Domingo-> dia_semana en rutas
      Periodicidad  -> periodicidad en rutas
      idcliente     -> id_cliente_erp en clientes_pdv
      nomcli        -> nombre_razon_social
      fantacli      -> nombre_fantasia
      domicli       -> domicilio
      xcoord        -> longitud (¡ojo! xcoord = longitud)
      ycoord        -> latitud  (¡ojo! ycoord = latitud)
      descloca      -> localidad
      desprovincia  -> provincia
      descanal      -> canal
      dessubcanal   -> subcanal
      FormaPago     -> forma_pago
      fecha_ultima_compra -> fecha_ultima_compra
      anulado       -> estado (SI -> anulado, NO -> activo)
    """
    if not os.path.exists(file_path):
        print(f"❌ Archivo no encontrado: {file_path}")
        return

    print(f"📄 Leyendo Excel {file_path}...")
    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        print(f"❌ Error leyendo Excel: {e}")
        return

    total = len(df)
    print(f"📊 {total} registros encontrados.")

    # Verificar que las columnas clave existen
    required_cols = ["idempresa", "idsucur", "dssucur", "vendedor", "d_vendedor", "ruta", "idcliente", "nomcli"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        print(f"❌ Columnas requeridas no encontradas en el Excel: {missing}")
        print(f"   Columnas del Excel: {list(df.columns)}")
        return

    # 1. Obtener mapeo de Distribuidores (id_erp -> id_distribuidor)
    dist_res = sb.table("distribuidores").select("id_distribuidor, id_erp").execute()
    dist_map = {row["id_erp"]: row["id_distribuidor"] for row in dist_res.data if row["id_erp"]}
    print(f"📋 Distribuidores mapeados: {dist_map}")

    # Contadores
    stats = {"ok": 0, "skipped_dist": 0, "skipped_empty": 0, "errors": 0}
    error_samples = []

    # Caches para evitar upserts repetitivos
    cache_suc = {}   # (id_dist, id_suc_erp) -> id_sucursal
    cache_ven = {}   # (id_suc, id_ven_erp) -> id_vendedor
    cache_ruta = {}  # (id_ven, id_ruta_erp) -> id_ruta

    print(f"🚀 Procesando jerarquía en cascada...")

    def _clean_str(val):
        """Convierte float o int a string limpio sin decimales (.0) ni nan"""
        if pd.isna(val) or val is None:
            return ""
        s = str(val).strip()
        if s.endswith(".0"):
            s = s[:-2]
        return s if s != "nan" else ""

    for index, row in df.iterrows():
        try:
            # --- Mapeo de columnas ---
            empresa_erp = _clean_str(row.get("idempresa"))
            sucur_erp = _clean_str(row.get("idsucur"))
            nombre_sucur = str(row.get("dssucur", "")).strip() or f"Sucursal {sucur_erp}"
            vend_erp = _clean_str(row.get("vendedor"))
            vend_nombre = str(row.get("d_vendedor", "")).strip() or f"Vendedor {vend_erp}"
            ruta_erp_val = _clean_str(row.get("ruta"))
            cliente_erp = _clean_str(row.get("idcliente"))
            nombre_cliente = str(row.get("nomcli", "")).strip()
            fantasia = str(row.get("fantacli", "")).strip()
            if fantasia == "nan":
                fantasia = ""
            domicilio = str(row.get("domicli", "")).strip()
            if domicilio == "nan":
                domicilio = ""

            # Coordenadas: xcoord = longitud, ycoord = latitud
            latitud = _safe_float(row.get("ycoord"))
            longitud = _safe_float(row.get("xcoord"))
            
            localidad = str(row.get("descloca", "")).strip()
            provincia = str(row.get("desprovincia", "")).strip()
            canal = str(row.get("descanal", "")).strip()
            subcanal = str(row.get("dessubcanal", "")).strip()
            forma_pago = str(row.get("FormaPago", "")).strip()
            
            # Periodicidad y día de semana
            per_val = row.get("Periodicidad")
            periodicidad = int(float(per_val)) if pd.notna(per_val) and str(per_val).strip() else 1
            dia_semana = _get_dia_semana(row)
            
            # Estado
            anulado = str(row.get("anulado", "NO")).strip().upper()
            estado = "anulado" if anulado == "SI" else "activo"
            
            # fecha_ultima_compra
            fuc = row.get("fecha_ultima_compra")
            fecha_ult_compra = None
            if pd.notna(fuc) and str(fuc).strip() and str(fuc).strip() != "nan":
                try:
                    fecha_ult_compra = pd.to_datetime(fuc).strftime("%Y-%m-%d")
                except:
                    fecha_ult_compra = None

            # --- Validaciones ---
            if not empresa_erp:
                stats["skipped_empty"] += 1
                continue

            if empresa_erp not in dist_map:
                stats["skipped_dist"] += 1
                continue

            if not cliente_erp:
                stats["skipped_empty"] += 1
                continue

            id_db_dist = dist_map[empresa_erp]

            # --- 2. UPSERT Sucursal (con cache) ---
            suc_key = (id_db_dist, sucur_erp)
            if suc_key not in cache_suc:
                sucur_data = {
                    "id_distribuidor": id_db_dist,
                    "id_sucursal_erp": sucur_erp,
                    "nombre_erp": nombre_sucur
                }
                res_suc = sb.table("sucursales").upsert(
                    sucur_data, on_conflict="id_distribuidor,id_sucursal_erp"
                ).execute()
                if not res_suc.data:
                    raise Exception(f"Sucursal upsert retornó vacío: {sucur_data}")
                cache_suc[suc_key] = res_suc.data[0]["id_sucursal"]
            id_db_suc = cache_suc[suc_key]

            # --- 3. UPSERT Vendedor (con cache) ---
            ven_key = (id_db_suc, vend_erp)
            if ven_key not in cache_ven:
                vend_data = {
                    "id_sucursal": id_db_suc,
                    "id_vendedor_erp": vend_erp,
                    "nombre_erp": vend_nombre
                }
                res_ven = sb.table("vendedores").upsert(
                    vend_data, on_conflict="id_sucursal,id_vendedor_erp"
                ).execute()
                if not res_ven.data:
                    raise Exception(f"Vendedor upsert retornó vacío: {vend_data}")
                cache_ven[ven_key] = res_ven.data[0]["id_vendedor"]
            id_db_ven = cache_ven[ven_key]

            # --- 4. UPSERT Ruta (con cache) ---
            ruta_key = (id_db_ven, ruta_erp_val)
            if ruta_key not in cache_ruta:
                ruta_data = {
                    "id_vendedor": id_db_ven,
                    "id_ruta_erp": ruta_erp_val,
                    "dia_semana": dia_semana,
                    "periodicidad": periodicidad
                }
                res_ruta = sb.table("rutas").upsert(
                    ruta_data, on_conflict="id_vendedor,id_ruta_erp"
                ).execute()
                if not res_ruta.data:
                    raise Exception(f"Ruta upsert retornó vacío: {ruta_data}")
                cache_ruta[ruta_key] = res_ruta.data[0]["id_ruta"]
            id_db_ruta = cache_ruta[ruta_key]

            # --- 5. UPSERT Cliente_PDV ---
            cliente_data = {
                "id_ruta": id_db_ruta,
                "id_cliente_erp": cliente_erp,
                "nombre_razon_social": nombre_cliente or "SIN NOMBRE",
                "nombre_fantasia": fantasia or None,
                "domicilio": domicilio or None,
                "latitud": latitud,
                "longitud": longitud,
                "localidad": localidad or None,
                "provincia": provincia or None,
                "canal": canal or None,
                "subcanal": subcanal or None,
                "forma_pago": forma_pago or None,
                "periodicidad_visita": periodicidad,
                "fecha_ultima_compra": fecha_ult_compra,
                "estado": estado
            }
            sb.table("clientes_pdv").upsert(
                cliente_data, on_conflict="id_ruta,id_cliente_erp"
            ).execute()

            stats["ok"] += 1

        except Exception as e:
            stats["errors"] += 1
            if len(error_samples) < 5:
                error_samples.append(f"Fila {index}: {e}")

        if index > 0 and index % 500 == 0:
            print(f"  -> Procesados {index}/{total} ({stats['ok']} ok, {stats['errors']} errores)")

    # --- Resumen ---
    print(f"\n{'='*60}")
    print(f"📊 RESUMEN DE CARGA")
    print(f"{'='*60}")
    print(f"  Total filas Excel:        {total}")
    print(f"  ✅ Clientes insertados:    {stats['ok']}")
    print(f"  ⏭️  Saltados (sin dist):   {stats['skipped_dist']}")
    print(f"  ⏭️  Saltados (vacíos):     {stats['skipped_empty']}")
    print(f"  ❌ Errores:               {stats['errors']}")
    print(f"  Sucursales en cache:      {len(cache_suc)}")
    print(f"  Vendedores en cache:      {len(cache_ven)}")
    print(f"  Rutas en cache:           {len(cache_ruta)}")

    if error_samples:
        print(f"\n⚠️  Primeros errores:")
        for e in error_samples:
            print(f"  {e}")

    if stats["ok"] > 0:
        print(f"\n✅ Carga finalizada exitosamente.")
    else:
        print(f"\n❌ ATENCIÓN: No se insertó ningún cliente. Revisa los errores arriba.")


def _safe_float(val):
    """Convierte un valor a float, o devuelve None."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        v = float(val)
        return v if v != 0.0 else None
    except (ValueError, TypeError):
        return None


def _get_dia_semana(row):
    """Determina el día de la semana basado en las columnas Lunes..Domingo."""
    dias = {
        "Lunes": "lunes", "Martes": "martes", "Miercoles": "miercoles",
        "Jueves": "jueves", "Viernes": "viernes", "Sabado": "sabado", "Domingo": "domingo"
    }
    for col, nombre in dias.items():
        val = str(row.get(col, "")).strip().upper()
        if val == "SI":
            return nombre
    return None


if __name__ == "__main__":
    print(" === MOTOR DE CARGA MANUAL PADRÓN ===")
    archivo = input("Ingresa la ruta completa del archivo Excel (.xlsx): ").strip('"')
    sync_padron_excel(archivo)
