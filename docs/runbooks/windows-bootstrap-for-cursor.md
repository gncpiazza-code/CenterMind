# Bootstrap Windows — instrucciones para Cursor Agent

> **Máquina:** PC Windows 10 · 16 GB RAM  
> **Rol:** Worker Shelfy (`shelfy-win-worker`) + desarrollo paralelo con Mac  
> **Repo:** `C:\dev\CenterMind` (ajustar si clonaste en otra ruta)

---

## Prompt inicial (copiar y pegar en Cursor Windows)

```
Sos el agente de setup en la PC Windows de Shelfy/CenterMind.

Objetivo: dejar TODO listo para trabajar en paralelo con la Mac sin pisarnos ramas.

Hacé esto en orden, sin saltear pasos. Después de cada fase, reportá ✅ o ❌ con el comando de verificación.

1. Leé este archivo completo: docs/runbooks/windows-bootstrap-for-cursor.md
2. Leé docs/coordination/ACTIVE.md y dejá la fila "win" en in_progress con tarea "bootstrap setup"
3. Ejecutá las fases 0–11 de abajo (PowerShell)
4. Al terminar: actualizá ACTIVE.md (win → idle), commiteá solo coordination + este archivo si hubo cambios, y dame checklist final

Reglas Shelfy: leer CLAUDE.md. No tocar favicon (icon.png, apple-icon.png, favicon.ico, WEBICON.svg, metadata.icons en layout.tsx).
Ruta repo asumida: C:\dev\CenterMind
Worker name: shelfy-win-worker
```

---

## Protocolo Mac ↔ Windows (evitar solapamiento)

### Archivo canónico de coordinación

`docs/coordination/ACTIVE.md` — **siempre en git**, ambas máquinas lo actualizan.

### Flujo antes de trabajar (cualquier máquina)

```powershell
cd C:\dev\CenterMind
git fetch --all
git pull
# Leer docs/coordination/ACTIVE.md
```

### Tomar una tarea (Windows)

1. Verificar que `mac` no tenga la misma rama en `in_progress`.
2. Crear rama: `git checkout -b win/<tema>`
3. Actualizar `ACTIVE.md`:

```markdown
| win | PC-16GB | win/<tema> | <descripción> | 2026-06-08T... | in_progress |
```

4. `git add docs/coordination/ACTIVE.md && git commit -m "coord: win in_progress win/<tema>"`
5. `git push -u origin win/<tema>`

### Liberar al terminar (Windows)

1. Push de código.
2. `ACTIVE.md` → `win` en `idle`, rama vacía o `waiting_review`.
3. Commit + push de coordinación.
4. Avisar en cola de `ACTIVE.md` si hay algo para la Mac.

### Cómo “hablan” las dos PCs

| Canal | Uso |
|-------|-----|
| `docs/coordination/ACTIVE.md` | Quién trabaja en qué rama **ahora** |
| `git push` / `git pull` | Código y estado compartido |
| Ramas `mac/*` y `win/*` | Separación por máquina |
| [cursor.com/agents](https://cursor.com/agents) | Mac manda tareas al worker `shelfy-win-worker` |
| Issues GitHub (opcional) | Tareas formales con checklist |

**No** se sincronizan chats de Cursor entre Mac y Windows. El contexto compartido es **git + ACTIVE.md + este runbook**.

---

## Fase 0 — PowerShell y permisos

Abrir **PowerShell como Administrador** (una vez):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
```

---

## Fase 1 — PC siempre encendida

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
powercfg /change monitor-timeout-ac 30
powercfg /hibernate off
```

Verificar: Panel de control → Energía → **Suspender: Nunca**.

---

## Fase 2 — Herramientas base

```powershell
winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

**Cerrar y reabrir PowerShell**, luego:

```powershell
git --version
python --version
node --version
npm --version
```

---

## Fase 3 — Repo (si ya clonaste, solo entrar)

```powershell
cd C:\dev\CenterMind
git status
git remote -v
git fetch --all
git pull
```

Si aún no clonaste:

```powershell
New-Item -ItemType Directory -Force -Path C:\dev
cd C:\dev
git clone https://github.com/gncpiazza-code/CenterMind.git
cd CenterMind
```

---

## Fase 4 — Variables de entorno

Pedir al usuario (no inventar tokens):

- `GITHUB_TOKEN` — PAT de GitHub
- Copia de `CenterMind/.env` desde la Mac (secreto, no commitear)

```powershell
[Environment]::SetEnvironmentVariable("GITHUB_TOKEN", "<PEGAR_TOKEN>", "User")
$env:GITHUB_TOKEN = "<PEGAR_TOKEN>"

cd C:\dev\CenterMind\CenterMind
if (-not (Test-Path ".env")) {
  Write-Host "FALTA .env — copiar desde Mac antes de correr API"
}
```

---

## Fase 5 — Python (venv + deps)

```powershell
cd C:\dev\CenterMind\CenterMind
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install pytest
python -c "import fastapi; print('OK')"
```

Smoke test:

```powershell
cd C:\dev\CenterMind
.\CenterMind\.venv\Scripts\Activate.ps1
pytest CenterMind/tests/ -x -q --tb=short
```

---

## Fase 6 — Frontend

```powershell
cd C:\dev\CenterMind\shelfy-frontend
npm install
npm run lint
```

Build (opcional en bootstrap; tarda):

```powershell
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

---

## Fase 7 — Cursor Agent CLI + login

```powershell
irm 'https://cursor.com/install?win32=true' | iex
```

Cerrar/reabrir PowerShell:

```powershell
agent --version
agent login
agent whoami
```

---

## Fase 8 — Worker My Machines (conexión con Mac)

```powershell
cd C:\dev\CenterMind
agent worker start --name "shelfy-win-worker"
```

Dejar corriendo. La Mac envía tareas vía [cursor.com/agents](https://cursor.com/agents) eligiendo `shelfy-win-worker`.

**Prueba desde Mac:**

```
worker=shelfy-win-worker
git pull
pytest CenterMind/tests/ -x -q
Resumí sin editar código si todo pasa.
```

---

## Fase 9 — Worker al inicio (Task Scheduler)

```powershell
New-Item -ItemType Directory -Force -Path C:\dev\scripts | Out-Null

@'
@echo off
cd /d C:\dev\CenterMind
agent worker start --name "shelfy-win-worker"
'@ | Set-Content -Path C:\dev\scripts\start-shelfy-worker.cmd -Encoding ASCII
```

PowerShell **como Admin**:

```powershell
$action = New-ScheduledTaskAction -Execute "C:\dev\scripts\start-shelfy-worker.cmd"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "ShelfyCursorWorker" -Action $action -Trigger $trigger -Settings $settings -Description "Cursor worker Shelfy"
```

---

## Fase 10 — LM Studio + Gemma 4 E4B (opcional)

1. Instalar [LM Studio](https://lmstudio.ai/)
2. Modelo: `google/gemma-4-e4b-qat` (Q4/QAT, no F16 en 16 GB)

```powershell
lms daemon up
lms get google/gemma-4-e4b-qat
lms server start --bind 127.0.0.1 --port 1234
```

Verificar: `curl http://127.0.0.1:1234/v1/models`

---

## Fase 11 — MCP en Cursor Windows

En Cursor → Settings → MCP, conectar (misma cuenta que Mac):

```
/add-plugin supabase
/add-plugin github
/add-plugin railway
```

Autenticar en **esta** PC:

```powershell
npm install -g @railway/cli
railway login
```

`GITHUB_TOKEN` ya en entorno de usuario. Supabase: OAuth Connect en MCP.

Leer antes de implementar: `CLAUDE.md`, `AGENTS.md`, `docs/context/README.md`.

---

## Fase 12 — Cerrar bootstrap

1. Actualizar `docs/coordination/ACTIVE.md`:

   - `win` → `idle`
   - `Última sincronización` → `win pull: <fecha UTC>`

2. Commit (solo si hay cambios de coordinación):

```powershell
cd C:\dev\CenterMind
git add docs/coordination/ACTIVE.md
git commit -m "coord: win bootstrap complete, idle"
git push
```

3. Reportar checklist al usuario (ver abajo).

---

## Checklist final

- [ ] Git, Python 3.12, Node LTS OK
- [ ] Repo en `C:\dev\CenterMind`, `git pull` OK
- [ ] `CenterMind/.venv` + `requirements.txt` instalado
- [ ] `pytest CenterMind/tests/` smoke OK (o errores documentados)
- [ ] `shelfy-frontend` → `npm install` OK
- [ ] `CenterMind/.env` presente (usuario confirmó)
- [ ] `GITHUB_TOKEN` en variables de usuario
- [ ] `agent whoami` OK
- [ ] `agent worker start --name shelfy-win-worker` corriendo
- [ ] Task Scheduler `ShelfyCursorWorker` creada
- [ ] Energía: no suspender
- [ ] `docs/coordination/ACTIVE.md` actualizado
- [ ] Mac puede ver worker en cursor.com/agents

---

## Troubleshooting

| Problema | Acción |
|----------|--------|
| `agent` no encontrado | Reabrir PowerShell; reinstalar CLI |
| Worker se desconecta al toque | `agent logout` → `agent login` → nueva sesión en agents web |
| Conflicto de rama con Mac | `git fetch`; leer `ACTIVE.md`; no pushear hasta coordinar |
| pytest sin venv | `.\CenterMind\.venv\Scripts\Activate.ps1` |
| npm OOM | Cerrar LM Studio; `NODE_OPTIONS=--max-old-space-size=4096` |

---

## Referencias en el repo

- Comandos detallados (txt): `docs/runbooks/windows-shelfy-worker-setup.txt`
- Reglas negocio: `CLAUDE.md`
- MCP y stack: `AGENTS.md`
- Coordinación: `docs/coordination/ACTIVE.md`

---

## División de trabajo sugerida

| Mac (coordinación) | Windows (ejecución pesada) |
|--------------------|----------------------------|
| UI portal, Figma, revisión | `pytest`, builds, lint masivo |
| Diseño y debugging interactivo | Worker 24/7, LM Studio análisis |
| Ramas `mac/*` | Ramas `win/*` |
| Cloud Agent → `worker=shelfy-win-worker` | Ejecuta tools en disco local |
