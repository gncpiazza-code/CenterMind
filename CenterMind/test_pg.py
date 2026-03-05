import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from db import sb

# Test 1: Count exhibiciones
r = sb.table("exhibiciones").select("id_exhibicion", count="exact").limit(1).execute()
print(f"Exhibiciones: {r.count}")

# Test 2: Count clientes
r = sb.table("clientes").select("id_cliente", count="exact").limit(1).execute()
print(f"Clientes: {r.count}")

# Test 3: Count distribuidores
r = sb.table("distribuidores").select("id_distribuidor", count="exact").limit(1).execute()
print(f"Distribuidores: {r.count}")

# Test 4: usuarios_portal
r = sb.table("usuarios_portal").select("id_usuario", count="exact").limit(1).execute()
print(f"Usuarios: {r.count}")

# Test 5: Simple join-like query (usuarios + distribuidores)
r = sb.table("usuarios_portal").select("id_usuario, usuario_login, rol, id_distribuidor").execute()
print(f"Usuarios data: {r.data[:2]}")

print("\nCONEXION SUPABASE OK!")
