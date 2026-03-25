from db import sb

def inspect_table(table_name):
    try:
        res = sb.table(table_name).select("*").limit(1).execute()
        if res.data:
            columns = list(res.data[0].keys())
            print(f"Columns for {table_name}: {columns}")
        else:
            print(f"No data in {table_name}")
    except Exception as e:
        print(f"Error inspecting {table_name}: {e}")

if __name__ == "__main__":
    inspect_table("erp_clientes_raw")
    inspect_table("clientes_pdv")
    inspect_table("vendedores")
    inspect_table("sucursales")
    inspect_table("rutas")
