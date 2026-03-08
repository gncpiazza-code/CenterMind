from db import sb
import json

def check_mappings():
    res = sb.table("erp_empresa_mapping").select("*").execute()
    print("ERP Empresa Mappings:")
    print(json.dumps(res.data, indent=2))
    
    res_dist = sb.table("distribuidores").select("id_distribuidor, nombre_empresa").execute()
    print("\nDistribuidores:")
    print(json.dumps(res_dist.data, indent=2))

if __name__ == "__main__":
    check_mappings()
