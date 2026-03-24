
import os

api_path = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\api.py"

with open(api_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_func = """@app.get("/api/admin/hierarchy-config/{dist_id}", summary="Configuración de jerarquía consolidada")
def get_hierarchy_config(dist_id: int, _=Depends(verify_auth)):
    try:
        # 1. Authoritative Names from ERP Tables
        suc_res = sb.table("erp_sucursales").select("id_sucursal_erp, nombre_sucursal").eq("id_distribuidor", dist_id).execute()
        suc_names = {str(s['id_sucursal_erp']): s['nombre_sucursal'] for s in (suc_res.data or [])}

        vend_res = sb.table("erp_fuerza_ventas").select("id_vendedor_erp, nombre_vendedor, id_sucursal_erp").eq("id_distribuidor", dist_id).execute()
        
        # 2. Build ERP Hierarchy Tree
        hierarchy_map = {}
        for v in (vend_res.data or []):
            sid = str(v.get("id_sucursal_erp", ""))
            vid = str(v.get("id_vendedor_erp", ""))
            if not sid or not vid: continue
            
            vname = v.get("nombre_vendedor") or f"Vendedor {vid}"
            
            if sid not in hierarchy_map:
                hierarchy_map[sid] = {
                    "sucursal_id": sid,
                    "sucursal_nombre": suc_names.get(sid) or f"Sucursal {sid}",
                    "vendedores": []
                }
            hierarchy_map[sid]["vendedores"].append({
                "vendedor_id": vid,
                "vendedor_nombre": vname
            })

        formatted_erp = sorted(list(hierarchy_map.values()), key=lambda x: x["sucursal_nombre"])

        # 3. Locations (backwards compat)
        formatted_locs = [{"location_id": sid, "label": sname} for sid, sname in suc_names.items()]

        # 4. Telegram Groups
        groups = sb.table("integrantes_grupo").select("telegram_group_id, nombre_grupo").eq("id_distribuidor", dist_id).execute()
        formatted_groups = [{"id": g.get("telegram_group_id"), "nombre": g.get("nombre_grupo") or f"Grupo {g.get('telegram_group_id')}"} 
                            for g in (groups.data or []) if g.get("telegram_group_id")]

        # 5. Integrantes
        integrantes = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, id_vendedor_erp, id_sucursal_erp, telegram_group_id").eq("id_distribuidor", dist_id).execute()

        return {
            "locations": formatted_locs,
            "erp_hierarchy": formatted_erp,
            "telegram_groups": formatted_groups,
            "integrantes": integrantes.data or []
        }
    except Exception as e:
        logger.error(f"Error fetching hierarchy config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
"""

# Find the start and end of the function
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if '@app.get("/api/admin/hierarchy-config/{dist_id}"' in line:
        start_idx = i
        # Look for the next decorator or function definition to find the end
        for j in range(i + 1, len(lines)):
            if lines[j].startswith('@app.') or lines[j].startswith('def '):
                end_idx = j
                break
        break

if start_idx != -1 and end_idx != -1:
    new_lines = lines[:start_idx] + [new_func + "\n"] + lines[end_idx:]
    with open(api_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Successfully updated api.py from line {start_idx+1} to {end_idx}")
else:
    print(f"Error: Could not find function to replace. start_idx={start_idx}, end_idx={end_idx}")
