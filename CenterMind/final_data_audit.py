from db import sb
import json

def final_audit():
    # Check Aloma
    aloma = sb.table('cuentas_corrientes_data').select('*').eq('tenant_id', 'aloma').order('created_at', desc=True).limit(1).execute()
    if aloma.data:
        r = aloma.data[0]
        detalle = r.get('data', {}).get('detalle_cuentas', [])
        print(f"ALOMA (Dist {r['id_distribuidor']}): Total {len(detalle)} records.")
        for d in detalle[:3]:
            print(f"  Vendedor: {d.get('vendedor')} | Cliente: {d.get('cliente')}")
            
    # Check Tabaco
    tabaco = sb.table('cuentas_corrientes_data').select('*').eq('tenant_id', 'tabaco').order('created_at', desc=True).limit(1).execute()
    if tabaco.data:
        r = tabaco.data[0]
        detalle = r.get('data', {}).get('detalle_cuentas', [])
        print(f"TABACO (Dist {r['id_distribuidor']}): Total {len(detalle)} records.")
        for d in detalle[:3]:
            print(f"  Vendedor: {d.get('vendedor')} | Cliente: {d.get('cliente')}")

if __name__ == "__main__":
    final_audit()
