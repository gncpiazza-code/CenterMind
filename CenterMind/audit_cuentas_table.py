from db import sb
import json

def audit_all():
    res = sb.table('cuentas_corrientes_data').select('id, id_distribuidor, tenant_id, data, created_at').order('id').execute()
    if not res.data:
        print("No data found")
        return
    
    for r in res.data:
        detalle = r.get('data', {}).get('detalle_cuentas', [])
        sample_vendedor = detalle[0].get('vendedor') if detalle else 'N/A'
        sample_sucursal = detalle[0].get('sucursal') if detalle else 'N/A'
        print(f"ID: {r.get('id')} | Dist: {r.get('id_distribuidor')} | Tenant: {r.get('tenant_id')} | First Vendor In Data: {sample_vendedor} | Sucursal: {sample_sucursal}")

if __name__ == "__main__":
    audit_all()
