from db import sb

def check_types():
    print("--- CHECK TYPES (No filters) ---")
    
    # Clientes
    res_c = sb.table('clientes').select('id_cliente').limit(5).execute()
    for row in res_c.data:
        val = row['id_cliente']
        print(f"clientes.id_cliente: {val} (type: {type(val)})")
        
    # Exhibiciones
    res_e = sb.table('exhibiciones').select('id_cliente').limit(10).execute()
    for row in res_e.data:
        val = row['id_cliente']
        if val is not None:
            print(f"exhibiciones.id_cliente: {val} (type: {type(val)})")
            break

if __name__ == "__main__":
    check_types()
