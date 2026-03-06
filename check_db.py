import sqlite3
import pandas as pd
import json

db_path = r'C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\centermind.db'
conn = sqlite3.connect(db_path)

def print_schema(table):
    print(f"\n--- SCHEMA {table.upper()} ---")
    try:
        rows = conn.execute(f"PRAGMA table_info({table});").fetchall()
        for r in rows:
            print(r)
    except Exception as e:
        print(e)
        
def print_data(table):
    print(f"\n--- DATA {table.upper()} (limit 3) ---")
    try:
        df = pd.read_sql(f"SELECT * FROM {table} LIMIT 3", conn)
        print(df.to_string())
    except Exception as e:
        print(e)

print('--- TABLES ---')
for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table';"):
    print(row[0])

for t in ['locations', 'integrantes_grupo', 'grupos', 'exhibiciones']:
    print_schema(t)
    print_data(t)

conn.close()
