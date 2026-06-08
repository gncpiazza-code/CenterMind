import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

dist_ids = [
    {"id": 3, "nombre": "Tabaco & Hnos"},
    {"id": 4, "nombre": "Aloma"},
    {"id": 5, "nombre": "Liver"},
    {"id": 2, "nombre": "Real Tabacalera"}
]

report = []

for dist in dist_ids:
    d_id = dist["id"]
    res = sb.table("cuentas_corrientes_data")\
        .select("fecha, data")\
        .eq("id_distribuidor", d_id)\
        .order("fecha", desc=True)\
        .limit(2)\
        .execute()
    
    if len(res.data) >= 2:
        new = res.data[0]["data"]["metadatos"]
        old = res.data[1]["data"]["metadatos"]
        
        diff_deuda = new["total_deuda"] - old["total_deuda"]
        perc_deuda = (diff_deuda / old["total_deuda"] * 100) if old["total_deuda"] != 0 else 0
        diff_deudores = new["clientes_deudores"] - old["clientes_deudores"]
        
        report.append({
            "Distribuidor": dist["nombre"],
            "Deuda Anterior": f"${old['total_deuda']:,.0f}",
            "Deuda Nueva": f"${new['total_deuda']:,.0f}",
            "Variación ($)": f"${diff_deuda:,.0f}",
            "Var. (%)": f"{perc_deuda:+.2f}%",
            "Deudores Ant.": old["clientes_deudores"],
            "Deudores Nue.": new["clientes_deudores"],
            "Var. (N)": f"{diff_deudores:+d}"
        })
    elif len(res.data) == 1:
        new = res.data[0]["data"]["metadatos"]
        report.append({
            "Distribuidor": dist["nombre"],
            "Deuda Anterior": "N/A",
            "Deuda Nueva": f"${new['total_deuda']:,.0f}",
            "Variación ($)": "N/A",
            "Var. (%)": "N/A",
            "Deudores Ant.": "N/A",
            "Deudores Nue.": new["clientes_deudores"],
            "Var. (N)": "N/A"
        })

print(json.dumps(report, indent=2))
