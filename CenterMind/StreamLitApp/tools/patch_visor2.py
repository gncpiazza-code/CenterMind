import re

path = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\CenterMind\StreamLitApp\pages\1_Visor.py"
lines = open(path, 'r', encoding='utf8').read().splitlines(True)
out = []
i = 0
while i < len(lines):
    line = lines[i]
    if line.strip().startswith("# VISOR DE FOTOS"):
        # write modified header
        out.append("    # ══════════════════════════════════════════════════════════════════════════\n")
        out.append("    # VISOR DE FOTOS + NAVEGACIÓN (ancho completo) + PANEL DE EVALUACIÓN\n")
        out.append("    # ahora usamos columnas nativas 70/30; CSS solo actúa en móvil\n")
        out.append("    # ══════════════════════════════════════════════════════════════════════════\n")
        out.append("    col_visor, col_panel = st.columns([7, 3])\n")
        out.append("\n")
        out.append("    with col_visor:\n")
        # copy subsequent viewer lines until panel header
        i += 1
        while i < len(lines) and "PANEL DE EVALUACIÓN" not in lines[i]:
            out.append("    " + lines[i])
            i += 1
        # now handle panel
        out.append("    with col_panel:\n")
        # copy panel header line
        if i < len(lines) and "PANEL DE EVALUACIÓN" in lines[i]:
            out.append("        " + lines[i])
            i += 1
        # copy rest of panel block until def main
        while i < len(lines) and not lines[i].startswith("def main"):
            out.append("        " + lines[i])
            i += 1
        # continue loop at current i (def main or end)
        continue
    else:
        out.append(line)
        i += 1

open(path, 'w', encoding='utf8').write(''.join(out))
print('patched')
