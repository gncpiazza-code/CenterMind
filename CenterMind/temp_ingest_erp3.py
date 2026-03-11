import pandas as pd
import glob
from db import sb
import os

print("--- INICIANDO INGESTA ERP 3.0 ---")

# Obtain current mapping between dsempresa and dist_id
res_dist = sb.table("erp_empresa_mapping").select("nombre_erp, id_distribuidor").execute()
dist_map = {row["nombre_erp"]: row["id_distribuidor"] for row in (res_dist.data or [])}

path = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\*.xlsx"
files = glob.glob(path)

for f in files:
    try:
        filename = os.path.basename(f)
        df = pd.read_excel(f, usecols=["dsempresa", "dssucur", "d_vendedor"])
        
        if df.empty:
            continue
            
        dsempresa = df.iloc[0]["dsempresa"]
        dist_id = dist_map.get(dsempresa)
        
        if not dist_id:
            print(f"Saltando {filename} - Empresa '{dsempresa}' no tiene ID mapeado.")
            continue
            
        print(f"\nProcesando {filename} (Dist ID: {dist_id})...")
        
        # 1. Extraer e insertar Sucursales Únicas
        sucursales = set(df["dssucur"].dropna().unique())
        for suc in sucursales:
            suc_data = {"id_distribuidor": dist_id, "nombre_sucursal": str(suc).strip()}
            # Upsert
            sb.table("erp_sucursales").upsert(suc_data).execute()
        print(f"  ✓ {len(sucursales)} Sucursales ingestadas.")
        
        # 2. Extraer e insertar Fuerza de Ventas Única
        # Agrupamos por vendedor y tomamos la primera sucursal que aparezca (asumimos que un vendedor ERP pertenece a 1 sucursal base)
        df_ventas = df.dropna(subset=["d_vendedor", "dssucur"])
        ventas_unicas = df_ventas.groupby("d_vendedor").first().reset_index()
        
        vendedores_procesados = 0
        for _, row in ventas_unicas.iterrows():
            if not row["d_vendedor"] or str(row["d_vendedor"]).strip() == "":
                continue
                
            vd_data = {
                "id_distribuidor": dist_id,
                "nombre_sucursal": str(row["dssucur"]).strip(),
                "nombre_vendedor": str(row["d_vendedor"]).strip()
            }
            sb.table("erp_fuerza_ventas").upsert(vd_data).execute()
            vendedores_procesados += 1
            
        print(f"  ✓ {vendedores_procesados} Vendedores ingestados.")
        
    except Exception as e:
        print(f"❌ Error crítico en archivo {f}: {e}")

print("\n--- INGESTA FINALIZADA ---")
