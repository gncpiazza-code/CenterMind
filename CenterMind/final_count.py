import sys
sys.path.append(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind")
from dotenv import load_dotenv
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
from db import sb

try:
    res = sb.table('exhibiciones').select('id_exhibicion', count='exact').not_.is_('id_cliente_pdv', 'null').limit(0).execute()
    count = res.count
    res_total = sb.table('exhibiciones').select('id_exhibicion', count='exact').limit(0).execute()
    total = res_total.count
    print(f"RESULT_LINKED:{count}")
    print(f"RESULT_TOTAL:{total}")
except Exception as e:
    print(f"ERROR:{e}")
