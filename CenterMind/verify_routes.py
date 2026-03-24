from api import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_routes():
    # Verificamos que las rutas existen (aunque den 401 por falta de token, no deben dar 404)
    routes = [
        "/api/dashboard/kpis/3",
        "/api/dashboard/ranking/3",
        "/api/dashboard/evolucion-tiempo/3",
        "/api/dashboard/por-ciudad/3",
        "/api/dashboard/por-empresa"
    ]
    
    for r in routes:
        response = client.get(r)
        print(f"Testing {r}: Status {response.status_code}")
        # Si da 401 o 403, la ruta EXISTE. Si da 404, es el problema.

if __name__ == "__main__":
    test_routes()
