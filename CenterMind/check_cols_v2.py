from db import sb

def check_cols():
    res = sb.table('exhibiciones').select('*').limit(1).execute()
    if res.data:
        cols = sorted(list(res.data[0].keys()))
        print("EXHIBICIONES COLUMNS:")
        for c in cols:
            print(f"  - {c}")

if __name__ == "__main__":
    check_cols()
