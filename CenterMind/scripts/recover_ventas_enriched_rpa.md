# Recuperar Avance de ventas (ventas_enriched)

Si faltan filas tras un cleanup erróneo:

1. **Restore Supabase** (PITR) a antes del cleanup — ideal si está habilitado.
2. **Re-ingesta RPA** (recomendado): dejar correr el Informe Ventas Consolido por tenant
   (09:45 / 13:00 / 17:00 / 21:00 AR) o forzar corrida manual en Windows.
   La ingesta **persiste todas las filas** del Excel en `ventas_enriched_v2_d{N}`.
3. **ippolibaz (d13)**: obligatorio re-ingestar — tabla vacía.

Verificar:

```bash
cd CenterMind && PYTHONPATH=. .venv/bin/python scripts/audit_ventas_empresa_isolation.py --fecha YYYY-MM-DD
```

Avance usa tabla por tenant + roster de vendedores (no filtra por IdEmpresa en lectura).
