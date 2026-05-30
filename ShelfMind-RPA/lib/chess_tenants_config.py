# -*- coding: utf-8 -*-
"""
Tenants CHESS ERP (cuentas corrientes). Ventas KPIs: Consolido informe_ventas, no CHESS comprobantes.

Vault: chess_{tenant_id}_usuario / chess_{tenant_id}_password
Mantener id_dist alineado con CenterMind/core/rpa_tenant_registry.py CONSOLIDO_TENANTS
y tabla distribuidores.
"""
from __future__ import annotations

from typing import Any

CHESS_TENANTS: list[dict[str, Any]] = [
    {
        "id": "tabaco",
        "nombre": "Tabaco & Hnos S.R.L.",
        "url_base": "https://tabacohermanos.chesserp.com/AR1149",
        "vault_user": "chess_tabaco_usuario",
        "vault_pass": "chess_tabaco_password",
        "id_dist": 3,
        "activo": True,
    },
    {
        "id": "aloma",
        "nombre": "Aloma Distribuidores Oficiales",
        "url_base": "https://alomasrl.chesserp.com/AR1252",
        "vault_user": "chess_aloma_usuario",
        "vault_pass": "chess_aloma_password",
        "id_dist": 4,
        "activo": True,
    },
    {
        "id": "liver",
        "nombre": "Liver SRL",
        "url_base": "https://liversrl.chesserp.com/AR1274",
        "vault_user": "chess_liver_usuario",
        "vault_pass": "chess_liver_password",
        "id_dist": 5,
        "activo": True,
    },
    {
        "id": "real",
        "nombre": "Real Tabacalera de Santiago S.A.",
        "url_base": "https://realtabacalera.chesserp.com/AR1272",
        "vault_user": "chess_real_usuario",
        "vault_pass": "chess_real_password",
        "id_dist": 2,
        "sucursales": [
            "UEQUIN RODRIGO",
            "OSCAR ONDARRETA",
            "GONZALEZ LUIS ANTONIO",
            "JOSE IGNACIO BIAVA",
        ],
        "split_por_sucursal": {
            "uequin rodrigo": "La Magica - Santiago del Estero",
            "oscar ondarreta": "Bolivar Distribuciones",
            "gonzalez luis antonio": "LAG Distribuidora - Tucuman",
            "jose ignacio biava": "CARAMELE - SAN LUIS",
        },
        "activo": True,
    },
    {
        "id": "extra",
        "nombre": "GyG (Gomez Marcos Ariel)",
        "url_base": "",
        "vault_user": "chess_extra_usuario",
        "vault_pass": "chess_extra_password",
        "id_dist": 6,
        "activo": False,
    },
    {
        "id": "beltrocco",
        "nombre": "Beltrocco - Rafaela",
        "url_base": "https://silvinaribero.chesserp.com/AR1283",
        "vault_user": "chess_beltrocco_usuario",
        "vault_pass": "chess_beltrocco_password",
        "id_dist": 11,
        "activo": True,
    },
    {
        "id": "hugo_cena",
        "nombre": "Cena Hugo - Goya",
        "url_base": "https://cenahugomario.chesserp.com/AR1281",
        "vault_user": "chess_hugo_cena_usuario",
        "vault_pass": "chess_hugo_cena_password",
        "id_dist": 12,
        "activo": True,
    },
]

# Alias usado por motores/cuentas_corrientes.py y motores/ventas.py
TENANTS = CHESS_TENANTS
