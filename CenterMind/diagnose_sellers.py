from db import sb
import json
import os

def check_integrantes():
    dist_id = 3 # Real Distribucion - T&H
    res = sb.table("integrantes_grupo").select("*").eq("id_distribuidor", dist_id).execute()
    print(f"Integrantes for Dist {dist_id}:")
    print(json.dumps(res.data, indent=2))
    
    # Check erp_clientes_raw unique sellers
    res_erp = sb.table("erp_clientes_raw").select("vendedor_erp").eq("id_distribuidor", dist_id).execute()
    sellers = sorted(list(set(r["vendedor_erp"] for r in (res_erp.data or []) if r.get("vendedor_erp"))))
    print(f"\nUnique ERP Sellers for Dist {dist_id}:")
    print(json.dumps(sellers, indent=2))

if __name__ == "__main__":
    check_integrantes()
