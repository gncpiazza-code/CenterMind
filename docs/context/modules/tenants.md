# Tenants / Distribuidores

**Fuente canónica:** `CenterMind/core/rpa_tenant_registry.py` → `CONSOLIDO_TENANTS`  
**Sync DB:** `CenterMind/base_datos/rpa_consolido_tenants.sql` · `python scripts/sync_rpa_tenant_registry.py --apply`  
**CHESS (CC):** `ShelfMind-RPA/lib/chess_tenants_config.py` → `CHESS_TENANTS`

Al agregar un tenant: actualizar registry + sync SQL + tablas `*_d{id}` en Supabase.

## Catálogo Consolido (padrón + ventas enriched)

| tenant_id | id_dist | Empresa Consolido | Consolido | CHESS CC |
|-----------|---------|-------------------|-----------|----------|
| `real` | 2 | Real Tabacalera de Santiago S.A. | 🟢 | 🟢 (split 4 sucursales) |
| `tabaco` | 3 | Tabaco & Hnos S.R.L. | 🟢 | 🟢 |
| `aloma` | 4 | Aloma Distribuidores Oficiales | 🟢 | 🟢 |
| `liver` | 5 | Liver SRL | 🟢 | 🟢 |
| `extra` | 6 | GyG (Gomez Marcos Ariel) | 🟢 | 🟡 sin credenciales CHESS |
| `beltrocco` | 11 | SILVINA RIBERO (Beltrocco) | 🟢 | 🟢 |
| `hugo_cena` | 12 | CENA HUGO MARIO (Goya) | 🟢 | 🟢 |
| `ippolibaz` | 13 | Ippolibaz SAS (Villa María) | 🟢 | 🟢 |

**8 tenants** en producción RPA Consolido. Orden scheduler padrón: chicos → tabaco/aloma (ver `ShelfMind-RPA/lib/padron_schedule.py`).

## Mapeo código

```python
# ventas / enriched / API ingesta
from core.rpa_tenant_registry import TENANT_DIST_MAP
# {"tabaco": 3, "real": 2, ...}
```

Tablas tenant: `tenant_table_name("rutas_v2", dist_id)` → `rutas_v2_d{dist_id}`

## Notas operativas

- **`real`:** CC CHESS particionada por sucursal (`split_por_sucursal` en chess config).
- **`extra`:** activo en Consolido (padrón/ventas); motor CC CHESS `activo: False` hasta vault/url.
- **`beltrocco`**, **`hugo_cena`:** altas 2025–2026; mismos invariantes tenant que el resto.

## QA Tabaco

Cuentas de prueba excluidas de ranking/visor para roles no-superadmin (dist `tabaco` = 3).
