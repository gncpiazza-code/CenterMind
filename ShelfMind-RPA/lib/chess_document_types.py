# -*- coding: utf-8 -*-
"""
Tipos de comprobante en CHESS (reporte ventas / comprobantes).

En el multi-select, algunos tenants listan FACTURA PRESUPUESTO y DEVOLUCION PRESUPUESTO;
otros solo FACTURA o DEVOLUCION. Se intentan alias en orden (más específico primero).
"""

from __future__ import annotations

import re
from typing import Iterable, Sequence

from playwright.async_api import Page

# (id_grupo, alias en orden de preferencia)
DEFAULT_TIPO_GRUPOS: list[tuple[str, list[str]]] = [
    ("factura_venta", ["FACTURA PRESUPUESTO", "FACTURA"]),
    ("devolucion_venta", ["DEVOLUCION PRESUPUESTO", "DEVOLUCION"]),
    ("recibo", ["RECIBO"]),
]


def _norm_label(s: str) -> str:
    return " ".join(s.split()).upper()


async def _textos_mat_options_visibles(page: Page) -> list[str]:
    opts = page.locator("mat-option")
    n = await opts.count()
    out: list[str] = []
    for i in range(n):
        t = (await opts.nth(i).inner_text()).strip()
        if t:
            out.append(t)
    return out


def _elegir_etiqueta(available: Sequence[str], aliases: Iterable[str]) -> str | None:
    """Primera coincidencia exacta (normalizada espacios/mayúsculas) con algún alias."""
    for alias in aliases:
        target = _norm_label(alias)
        for lab in available:
            if _norm_label(lab) == target:
                return lab
    return None


async def seleccionar_tipos_documento_normalizado(
    page: Page,
    grupos: Sequence[tuple[str, list[str]]] | None = None,
    *,
    combobox_name_re: str = r"Tipos?\s*Documento",
) -> list[tuple[str, str]]:
    """
    Abre el mat-select de tipos de documento y marca una opción por grupo usando alias.

    Devuelve lista de (id_grupo, texto_exacto_opcion_clickeada).
    Si un grupo no tiene ningún alias presente en el panel, se omite (sin error).
    """
    grupos = grupos or DEFAULT_TIPO_GRUPOS
    combo = page.get_by_role("combobox", name=re.compile(combobox_name_re, re.I))
    await combo.first.wait_for(state="visible", timeout=30_000)
    await combo.first.click()
    await page.wait_for_timeout(400)

    textos = await _textos_mat_options_visibles(page)
    seleccionados: list[tuple[str, str]] = []

    for gid, aliases in grupos:
        lab = _elegir_etiqueta(textos, aliases)
        if not lab:
            continue
        opt = page.get_by_role("option", name=re.compile(r"^\s*" + re.escape(lab.strip()) + r"\s*$", re.I))
        if await opt.count() == 0:
            opt = page.locator("mat-option").filter(has_text=re.compile(re.escape(lab.strip()), re.I))
        await opt.first.click()
        seleccionados.append((gid, lab))
        await page.wait_for_timeout(150)
        textos = await _textos_mat_options_visibles(page)

    await page.keyboard.press("Escape")
    await page.wait_for_timeout(300)
    return seleccionados
