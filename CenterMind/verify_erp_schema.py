from db import sb
import json

tables = ["erp_empresa_mapping", "erp_ventas_raw", "erp_clientes_raw", "erp_deuda_clientes", "erp_config_alertas"]

for table in tables:
    print(f"\n== {table} ==")
    try:
        res = sb.table(table).select("*").limit(1).execute()
        if res.data:
            print(json.dumps(res.data[0], indent=2))
        else:
            print("No data (Empty table)")
    except Exception as e:
        print(f"Error: {e}")
