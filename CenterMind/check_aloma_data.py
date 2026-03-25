from db import sb
import json

def check_aloma():
    res = sb.table('cuentas_corrientes_data').select('*').eq('tenant_id', 'aloma').order('created_at', desc=True).limit(1).execute()
    if not res.data:
        print("No data found for Aloma")
        return
    
    r = res.data[0]
    print(f"ID: {r['id']} | Dist: {r['id_distribuidor']} | Created: {r['created_at']}")
    
    detalle = r.get('data', {}).get('detalle_cuentas', [])
    if not detalle:
        print("No detailed accounts found")
        return
    
    print(f"Total count: {len(detalle)}")
    print("Sample records (First 5):")
    for d in detalle[:5]:
        print(f"  Vendedor: {d.get('vendedor')} | Cliente: {d.get('cliente')} | Sucursal: {d.get('sucursal')}")

if __name__ == "__main__":
    check_aloma()
