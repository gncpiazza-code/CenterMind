import socket

def test_conn(h, p):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3)
        r = s.connect_ex((h, p))
        s.close()
        return r == 0
    except Exception:
        return False

hosts = [
    ("sa-east-1", "aws-0-sa-east-1.pooler.supabase.com"),
    ("us-east-1", "aws-0-us-east-1.pooler.supabase.com"),
    ("db-host", "db.xjwadmzuuzctxbrvgopx.supabase.co"),
]

for name, host in hosts:
    print(f"Testing {name} ({host}):")
    for port in [5432, 6543]:
        res = test_conn(host, port)
        print(f"  - Port {port}: {'✅ OPEN' if res else '❌ CLOSED'}")
