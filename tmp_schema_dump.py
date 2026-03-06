import sqlite3

conn = sqlite3.connect(r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\centermind_2026-03-04_23-58.db")
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
tables = cursor.fetchall()

for t in tables:
    tn = t[0]
    print(f"\n== {tn} ==")
    cursor.execute(f"PRAGMA table_info({tn})")
    for c in cursor.fetchall():
        print(f"  {c[1]} {c[2]} {'PK' if c[5] else ''} {'NN' if c[3] else ''} def={c[4]}")
    cursor.execute(f"SELECT COUNT(*) FROM [{tn}]")
    print(f"  ROWS={cursor.fetchone()[0]}")

conn.close()
