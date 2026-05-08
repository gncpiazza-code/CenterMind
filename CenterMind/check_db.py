from db import sb
from core.tenant_tables import tenant_table_name

dist_id = 2
t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
print(f"Table: {t_ventas}")

res = sb.table(t_ventas).select("id_distribuidor, nombre_vendedor").limit(10).execute()
print("Ventas:", res.data)

res_cc = sb.table("cc_detalle").select("id_distribuidor, vendedor_nombre").eq("id_distribuidor", dist_id).limit(10).execute()
print("CC:", res_cc.data)

res_cc_all = sb.table("cc_detalle").select("id_distribuidor").limit(10).execute()
print("CC All:", res_cc_all.data)
