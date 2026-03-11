import pandas as pd
import glob

# Constants
ALOMA_FILE = r'C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\ALOMA-SRL.xlsx'
LIVER_FILE = r'C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\LIVER-SRL.xlsx'
LAMAGICA_FILE = r'C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\LAMAGICA.xlsx'

print("=== RESOLVIENDO ALOMA ===")
try:
    df_aloma = pd.read_excel(ALOMA_FILE)
    vendedor_elias = df_aloma.loc[df_aloma['idcliente'] == 233, 'd_vendedor'].values
    if len(vendedor_elias) > 0:
        print(f"Elias -> {vendedor_elias[0]}")
    else:
        print("Elias -> ALERTA: Cliente 233 no encontrado")
    print("Martin -> Ignorado (Supervisor)")
    print("Nacho -> Ignorado (Pruebas)")
except Exception as e:
    print(f"Error Aloma: {e}")

print("\n=== RESOLVIENDO LIVER ===")
try:
    df_liver = pd.read_excel(LIVER_FILE)
    
    vend_andres = df_liver.loc[df_liver['idcliente'] == 2840, 'd_vendedor'].values
    print(f"Andres Orlando -> {vend_andres[0] if len(vend_andres) > 0 else 'ALERTA: Cliente 2840 no encontrado'}")
    
    vend_mariano = df_liver.loc[df_liver['idcliente'] == 1493, 'd_vendedor'].values
    print(f"Mariano. -> {vend_mariano[0] if len(vend_mariano) > 0 else 'ALERTA: Cliente 1493 no encontrado'}")
    
    vend_paula = df_liver.loc[df_liver['idcliente'] == 2838, 'd_vendedor'].values
    print(f"Paula -> {vend_paula[0] if len(vend_paula) > 0 else 'ALERTA: Cliente 2838 no encontrado'}")
    
    print("Yesica -> CUATRIN JESICA")
    print("Liver - ExhibicionesBot -> Ignorado (Bot)")
    print("Nacho -> Ignorado (Pruebas)")
except Exception as e:
    print(f"Error Liver: {e}")

print("\n=== ANALIZANDO LA MAGICA (RODRIGO UEQUIN) ===")
try:
    df_lamagica = pd.read_excel(LAMAGICA_FILE)
    # Filtrar solo la sucursal "RODRIGO UEQUIN" o similar
    df_uequin = df_lamagica[df_lamagica['dssucur'].str.contains('UEQUIN', case=False, na=False)]
    print(f"Registros en sucursal UEQUIN: {len(df_uequin)}")
    print("Vendedores ERP dentro de esta sucursal:")
    for v in df_uequin['d_vendedor'].dropna().unique():
        print(f"  - {v}")
except Exception as e:
    print(f"Error La Magica: {e}")
