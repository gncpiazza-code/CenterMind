from db import sb

try:
    # Try to list functions using a common postgrest trick or querying the schema
    res = sb.rpc("fn_bot_registrar_exhibicion", {
        "p_dist_id": 1,
        "p_vendedor_id": 1,
        "p_cliente_pdv_id": 1,
        "p_exhibidor_id": 1,
        "p_obs": "test",
        "p_lat": 0,
        "p_lon": 0,
        "p_url": "test",
        "p_nro_cliente": "0"
    }).execute()
    print("RPC exists and responded.")
except Exception as e:
    print(f"Error: {e}")
