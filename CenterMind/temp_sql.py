import psycopg2
conn = psycopg2.connect('postgresql://postgres.xjwadmzuuzctxbrvgopx:*7#qyZ5btqW2&br@aws-0-sa-east-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()
cur.execute("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_dashboard_ranking';")
for row in cur.fetchall():
    print(row[0])
