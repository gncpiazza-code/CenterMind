import sys
try:
    from db import sb
    import datetime
    
    # Ensure Route exists
    route_id = 9991
    # Check if route exists first
    route_res = sb.table('rutas_v2').select('*').eq('id_ruta', route_id).execute()
    if not route_res.data:
        sb.table('rutas_v2').insert({
            'id_ruta': route_id, 
            'id_vendedor': 9991, 
            'dia_semana': 1, 
            'id_distribuidor': 3
        }).execute()
        print(f"Route {route_id} created.")
    else:
        print(f"Route {route_id} already exists.")

    clients = []
    yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
    last_month = (datetime.datetime.now() - datetime.timedelta(days=45)).strftime('%Y-%m-%d')

    for i in range(1, 11):
        cl_id = f"9990{i}" if i < 10 else f"999{i}"
        is_active = i <= 5
        clients.append({
            'id_distribuidor': 3,
            'id_cliente_erp': cl_id,
            'nombre_fantasia': f'TEST PDV {cl_id} (Nacho)',
            'nombre_razon_social': f'TEST RS {cl_id}',
            'domicilio': f'Calle Falsa {123+i}',
            'id_ruta': route_id,
            'fecha_ultima_compra': yesterday if is_active else last_month,
            'estado': 'activo' if is_active else 'inactivo',
            'es_limbo': False
        })

    print(f"Inserting {len(clients)} clients...")
    res = sb.table('clientes_pdv_v2').upsert(clients, on_conflict='id_distribuidor,id_cliente_erp').execute()
    print(f"Result: {len(res.data) if res.data else 0} rows processed.")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
