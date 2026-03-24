from db import sb
import json

dist_id = 3 # ID del distribuidor de prueba o real

print("Verifying Reporting RPCs...")

try:
    print("\n1. Testing fn_reporte_comprobantes_resumen...")
    res1 = sb.rpc("fn_reporte_comprobantes_resumen", {
        "p_dist_id": dist_id,
        "p_desde": "2026-03-01",
        "p_hasta": "2026-03-20"
    }).execute()
    print(f"Results: {len(res1.data)} rows found.")
    if res1.data:
        print(json.dumps(res1.data[0], indent=2))
except Exception as e:
    print(f"Error Resumen: {e}")

try:
    print("\n2. Testing fn_reporte_comprobantes_detallado...")
    res2 = sb.rpc("fn_reporte_comprobantes_detallado", {
        "p_dist_id": dist_id,
        "p_desde": "2026-03-01",
        "p_hasta": "2026-03-20",
        "p_proveedor_busqueda": None
    }).execute()
    print(f"Results: {len(res2.data)} rows found.")
except Exception as e:
    print(f"Error Detallado: {e}")

try:
    print("\n3. Testing fn_reporte_sigo_audit...")
    res3 = sb.rpc("fn_reporte_sigo_audit", {
        "p_dist_id": dist_id,
        "p_desde": "2026-03-01",
        "p_hasta": "2026-03-20"
    }).execute()
    print(f"Results: {len(res3.data)} rows found.")
except Exception as e:
    print(f"Error SIGO: {e}")
