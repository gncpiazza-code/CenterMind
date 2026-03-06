import sqlite3

db_path = r'C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\centermind.db'
conn = sqlite3.connect(db_path)

print('--- SCHEMA ---')
for table in ['locations', 'integrantes_grupo', 'grupos']:
    try:
        print(f"\\nTABLE: {table}")
        for r in conn.execute(f"PRAGMA table_info({table});").fetchall():
            print(f"  {r[1]} ({r[2]}) {'PK' if r[5] else ''}")
        print("DATA:")
        for row in conn.execute(f"SELECT * FROM {table} LIMIT 2;").fetchall():
             print(f"  {row}")
    except Exception as e:
        print(e)
            
conn.close()
