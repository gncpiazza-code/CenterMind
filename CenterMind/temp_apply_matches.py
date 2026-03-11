from db import sb

updates = [
    # ALOMA (dist_id = 4)
    {"dist_id": 4, "nombre": "Elias", "erp": "08-DAURIA NEYEM ELIA", "rol": "vendedor"},
    {"dist_id": 4, "nombre": "Martin", "erp": None, "rol": "supervisor"},
    {"dist_id": 4, "nombre": "Nacho", "erp": None, "rol": "vendedor"}, # tests
    
    # LIVER (dist_id = 5)
    {"dist_id": 5, "nombre": "Andres Orlando", "erp": "BARRIOS ANDRES", "rol": "vendedor"},
    {"dist_id": 5, "nombre": "Mariano.", "erp": "MARTINEZ MARIANO EZEQUIEL", "rol": "vendedor"},
    {"dist_id": 5, "nombre": "Paula", "erp": "HIRALDO SOFIA", "rol": "vendedor"},
    {"dist_id": 5, "nombre": "Yesica", "erp": "CUATRIN JESICA", "rol": "vendedor"},
    {"dist_id": 5, "nombre": "Liver - ExhibicionesBot", "erp": None, "rol": "observador"},
    {"dist_id": 5, "nombre": "Nacho", "erp": None, "rol": "vendedor"},

    # LA MAGICA (dist_id = 2)
    {"dist_id": 2, "nombre": "Fabricio", "erp": "FABRICIO VIDAL", "rol": "vendedor"},
    {"dist_id": 2, "nombre": "Rodrigo1", "erp": "RODRIGO", "rol": "vendedor"},
    {"dist_id": 2, "nombre": "Nacho", "erp": None, "rol": "vendedor"}
]

print("Aplicando actualizaciones a la DB...")
success_count = 0
for u in updates:
    try:
        data = {"id_vendedor_erp": u["erp"]}
        if u["rol"]:
            data["rol_telegram"] = u["rol"]
            
        res = sb.table("integrantes_grupo").update(data).eq("id_distribuidor", u["dist_id"]).eq("nombre_integrante", u["nombre"]).execute()
        if res.data:
            success_count += 1
            print(f"✅ OK: {u['nombre']} -> {u['erp']}")
        else:
            print(f"⚠️ No encontrado: {u['nombre']} (Dist: {u['dist_id']})")
    except Exception as e:
        print(f"❌ Error actualizando {u['nombre']}: {e}")

print(f"\nFinalizado. {success_count}/{len(updates)} actualizados.")
