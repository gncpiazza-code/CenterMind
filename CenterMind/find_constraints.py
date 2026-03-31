import psycopg2

params = {
    "host": "aws-0-sa-east-1.pooler.supabase.com",
    "port": 6543,
    "user": "postgres.xjwadmzuuzctxbrvgopx",
    "password": "*7#qyZ5btqW2&br",
    "dbname": "postgres",
    "options": "endpoint=xjwadmzuuzctxbrvgopx"
}

def get_constraints():
    try:
        conn = psycopg2.connect(**params)
        cur = conn.cursor()
        query = """
        SELECT
            conname AS constraint_name,
            pg_get_constraintdef(c.oid) AS constraint_definition
        FROM
            pg_constraint c
        JOIN
            pg_namespace n ON n.oid = c.connamespace
        WHERE
            contype = 'f' AND n.nspname = 'public' AND conrelid = 'exhibiciones'::regclass;
        """
        cur.execute(query)
        rows = cur.fetchall()
        for row in rows:
            print(f"Constraint: {row[0]}")
            print(f"Definition: {row[1]}")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    get_constraints()
