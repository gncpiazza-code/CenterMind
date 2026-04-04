from db import sb
import sys

def check_db():
    try:
        # Check table and columns
        sb.table('objetivos').select('valor_actual, estado_inicial, id_target_ruta').limit(1).execute()
        
        # Check if 'cobranza' is accepted by the constraint
        res = sb.table('objetivos').insert({
            'id_distribuidor': 1, 
            'id_vendedor': 1, 
            'tipo': 'cobranza',
            'descripcion': 'TEST_PROBE'
        }).execute()
        
        if res.data:
            obj_id = res.data[0]['id']
            sb.table('objetivos').delete().eq('id', obj_id).execute()
            print("DATABASE_READY: All columns and types supported")
        else:
            print("DATABASE_READY: Columns exist but insert test failed (no data returned)")
            
    except Exception as e:
        print(f"DATABASE_UPGRADE_REQUIRED: {e}")
        sys.exit(1)

if __name__ == "__main__":
    check_db()
