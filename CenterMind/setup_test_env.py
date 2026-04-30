from db import sb
import sys

def run():
    try:
        # 1. Update Vendedor
        print("Upserting Vendedor 9991...")
        sb.table('vendedores_v2').upsert({'id_vendedor': 9991, 'id_distribuidor': 3, 'id_sucursal': 1, 'nombre_erp': 'NACHO TEST'}).execute()
        
        # 2. Update Integrante
        print("Updating Integrante 226...")
        sb.table('integrantes_grupo').update({'id_vendedor_v2': 9991}).eq('id_integrante', 226).execute()
        
        # 3. Upsert Route
        print("Upserting Route 9991...")
        sb.table('rutas_v2').upsert({'id_ruta': 9991, 'id_vendedor': 9991, 'dia_semana': 1, 'id_distribuidor': 3}).execute()
        
        # 4. Upsert Clients
        print("Upserting 10 Clients...")
        cl_list = []
        for i in range(1, 11):
            cid = f"999{str(i).zfill(2)}"
            cl_list.append({
                'id_distribuidor': 3,
                'id_cliente_erp': cid,
                'nombre_fantasia': f'TEST PDV {cid} (Nacho)',
                'id_ruta': 9991,
                'fecha_ultima_compra': '2026-04-04',
                'estado': 'activo',
                'es_limbo': False
            })
        sb.table('clientes_pdv_v2').upsert(cl_list).execute()
        print("SUCCESS: Environment setup complete.")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run()
