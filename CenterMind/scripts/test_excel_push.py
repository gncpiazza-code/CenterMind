import pandas as pd
import requests
import io
import os

# CONFIG
API_URL = "http://localhost:8000/api/v1/sync/erp-clientes"
API_KEY = "shelfy-clave-2025"
DIST_ID = 3

def create_test_excel():
    data = [
        {"id_cliente": "TEST001", "nombre": "CLIENTE TEST 1", "vendedor": "VENDEDOR A", "sucursal": "CASA CENTRAL", "id_sucursal": "SUC01", "lat": -34.6, "lon": -58.4},
        {"id_cliente": "TEST002", "nombre": "CLIENTE TEST 2", "vendedor": "VENDEDOR B", "sucursal": "SUCURSAL NORTE", "id_sucursal": "SUC02", "lat": -34.5, "lon": -58.5},
    ]
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    return output

def test_push():
    print("Iniciando prueba de push Excel...")
    excel_file = create_test_excel()
    
    headers = {"X-API-Key": API_KEY}
    files = {'file': ('test_clientes.xlsx', excel_file, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    params = {'id_distribuidor': DIST_ID}
    
    try:
        # Nota: Esto asume que el servidor FastAPI está corriendo localmente para la prueba
        # Si no, esto fallará, pero el código es válido para la lógica.
        response = requests.post(API_URL, headers=headers, files=files, params=params)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Error en prueba: {e}")

if __name__ == "__main__":
    test_push()
