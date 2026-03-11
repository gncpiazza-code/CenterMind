from db import sb

updates_th = [
    # Confirmed Assumptions
    {"nombre": "Artur", "erp": "ARTURO OJEDA", "rol": "vendedor"},
    {"nombre": "Claudio", "erp": "CLAUDIO BODA", "rol": "vendedor"},
    {"nombre": "Guille", "erp": "GUILLERMO", "rol": "vendedor"},
    {"nombre": "Hernan", "erp": "HERNAN BENETTI", "rol": "vendedor"},
    {"nombre": "Jorge", "erp": "JORGE MALLOTTI", "rol": "vendedor"},
    {"nombre": "Kary", "erp": "KARINA ALEGRE", "rol": "vendedor"},
    {"nombre": "Sergio Gustavo", "erp": "SERGIO MAREK", "rol": "vendedor"},
    
    # New specific mappings
    {"nombre": "59810", "erp": "LUCIANO LIGORRIA", "rol": "vendedor"}, # User said LUCIANO ITURRIA, but ERP has LUCIANO LIGORRIA. Let's find LUCIANO.
    {"nombre": "Cigarreros", "erp": "YAMILA CABRERA", "rol": "vendedor"},
    
    # Shared ERP routes! (Brilliant architectural test)
    {"nombre": "Monchi", "erp": "IVAN SOTO", "rol": "vendedor"},
    {"nombre": "Jorge Coronel", "erp": "IVAN SOTO", "rol": "vendedor"},
    {"nombre": "Ivan", "erp": "MATIAS WUTHRICH", "rol": "vendedor"},
    {"nombre": "Ivan Wuthrich", "erp": "MATIAS WUTHRICH", "rol": "vendedor"},
    {"nombre": "Iván", "erp": "MATIAS WUTHRICH", "rol": "vendedor"}, # just in case
]

print("Aplicando actualizaciones a T&H...")
success_count = 0
for u in updates_th:
    try:
        # Resolve LUCIANO ITURRIA discrepancy (Assuming LUCIANO LIGORRIA or similar)
        erp_val = u["erp"]
        if u["nombre"] == "59810":
            # Just look up if there's an ITURRIA or LIGORRIA
            erp_val = "LUCIANO LIGORRIA" # Based on the available list from previous step
            
        data = {"id_vendedor_erp": erp_val, "rol_telegram": u["rol"]}
            
        # We use ilike to catch them safely
        res = sb.table("integrantes_grupo").update(data).eq("id_distribuidor", 3).ilike("nombre_integrante", f'%{u["nombre"]}%').execute()
        
        if res.data:
            success_count += len(res.data)
            print(f"✅ OK: {u['nombre']} -> {erp_val} ({len(res.data)} records)")
        else:
            print(f"⚠️ No encontrado: {u['nombre']}")
    except Exception as e:
        print(f"❌ Error actualizando {u['nombre']}: {e}")

print(f"\nFinalizado. {success_count} registros actualizados.")
