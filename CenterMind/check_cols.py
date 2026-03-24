from db import sb

def check_cols():
    res = sb.table('exhibiciones').select('*').limit(1).execute()
    if res.data:
        print(f"Columns: {res.data[0].keys()}")

if __name__ == "__main__":
    check_cols()
