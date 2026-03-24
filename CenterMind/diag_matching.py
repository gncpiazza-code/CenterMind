import sys
sys.path.append(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind")
from dotenv import load_dotenv
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
from db import sb

print("=== CHECKING POTENTIAL MATCHES ===")
# Check if 8 or 90 exist in clientes_pdv
cl = sb.table('clientes_pdv').select('id_cliente_erp, id_cliente').in_('id_cliente_erp', ['8', '90', '08', '008', '090']).execute().data

print("Matches found in clientes_pdv:")
for c in cl:
    print(f"  {c}")

# Also check total non-null cliente_sombra_codigo
total_codes = sb.table('exhibiciones').select('cliente_sombra_codigo', count='exact').not_.is_('cliente_sombra_codigo', 'null').limit(0).execute().count
print(f"\nTotal non-null codes in exhibiciones: {total_codes}")
