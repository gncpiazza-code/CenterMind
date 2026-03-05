import requests

try:
    r = requests.options("http://127.0.0.1:8000/api/procesar-cuentas-corrientes")
    print(f"OPTIONS status: {r.status_code}")
    print(f"OPTIONS headers: {r.headers}")
except Exception as e:
    print(f"Error OPTIONS: {e}")

try:
    r = requests.post("http://127.0.0.1:8000/api/procesar-cuentas-corrientes", files={'file': ('test.xlsx', b'dummy', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}, data={'config': '{}'})
    print(f"POST status: {r.status_code}")
    print(f"POST result: {r.text}")
except Exception as e:
    print(f"Error POST: {e}")
