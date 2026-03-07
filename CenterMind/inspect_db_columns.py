from db import sb
import json

def inspect_table(table_name):
    try:
        # We can't easily get the schema from the client, so we'll try to select one row
        # and see what columns it returns.
        res = sb.table(table_name).select("*").limit(1).execute()
        if res.data:
            columns = list(res.data[0].keys())
            print(f"Columns for {table_name}: {columns}")
        else:
            print(f"No data in {table_name}, can't inspect columns via select *.")
    except Exception as e:
        print(f"Error inspecting {table_name}: {e}")

if __name__ == "__main__":
    inspect_table("distribuidores")
    inspect_table("integrantes_grupo")
    inspect_table("grupos")
