import os
import unicodedata
from db import sb

def normalize_str(text):
    if not text: return ""
    text = str(text).strip().upper()
    # Remove accents
    return "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

def get_name_variants(name):
    # If name is "MARINA SOLANO", also return "SOLANO MARINA"
    normalized = normalize_str(name)
    parts = normalized.split()
    variants = {normalized}
    if len(parts) == 2:
        variants.add(f"{parts[1]} {parts[0]}")
    return variants

def fix_mappings(dist_id):
    print(f"Fixing mappings for dist_id {dist_id}...")
    
    # 1. Fetch Maestro
    raw_maestro = sb.table("maestro_jerarquia").select("*").eq("ID_DIST", dist_id).execute().data or []
    vendedor_map = {}
    for row in raw_maestro:
        full_v_name = str(row.get("Vendedor")).strip().upper()
        if not full_v_name or full_v_name == "NAN": continue
        
        # Clean prefix like '02-'
        v_name_clean = full_v_name
        if '-' in full_v_name:
            v_name_clean = full_v_name.split('-', 1)[1].strip()
        
        norm_clean = normalize_str(v_name_clean)
        vendedor_map[norm_clean] = {
            "id_v_erp": row.get("ID_VENDEDOR"),
            "id_s_erp": row.get("id suc"),
            "original": full_v_name
        }
        
        # Add variants (e.g. inverted)
        for var in get_name_variants(v_name_clean):
            if var not in vendedor_map:
                vendedor_map[var] = vendedor_map[norm_clean]

    # 2. Fetch Integrantes
    integrantes = sb.table("integrantes_grupo").select("*").eq("id_distribuidor", dist_id).execute().data or []
    
    updates = 0
    for ig in integrantes:
        ig_name = ig.get("nombre_integrante")
        if not ig_name: continue
        
        ig_variants = get_name_variants(ig_name)
        
        match = None
        for var in ig_variants:
            if var in vendedor_map:
                match = vendedor_map[var]
                break
        
        if not match:
            # Substring match (informal names)
            for m_name, m_val in vendedor_map.items():
                for var in ig_variants:
                    if var in m_name or m_name in var:
                        match = m_val
                        break
                if match: break
        
        if match:
            v_erp = str(match["id_v_erp"]) if match["id_v_erp"] else None
            s_erp = str(match["id_s_erp"]) if match["id_s_erp"] else None
            
            if ig.get("id_vendedor_erp") != v_erp or ig.get("id_sucursal_erp") != s_erp:
                sb.table("integrantes_grupo").update({
                    "id_vendedor_erp": v_erp,
                    "id_sucursal_erp": s_erp
                }).eq("id_integrante", ig["id_integrante"]).execute()
                updates += 1
                print(f"Updated {ig['nombre_integrante']} -> {match['original']} (ERPVen: {v_erp}, ERPSuc: {s_erp})")

    print(f"Total updates: {updates}")

if __name__ == "__main__":
    fix_mappings(4) # Aloma
