# Shelfy — Guía del agente (Cursor)

Cursor es el agente único para este repo. Configuración en `.cursor/`.

## MCP activos

| Servidor | Auth | Para qué |
|----------|------|----------|
| **supabase** | OAuth (Connect en Settings → MCP) | Postgres, migraciones, advisors, logs, edge functions |
| **vercel** | OAuth | Deployments frontend, env, logs, dominios |
| **railway** | `railway login` | API backend, RPA, variables, deploys, métricas |
| **figma** | OAuth | Diseño ↔ código, variables, canvas |
| **shadcn** | local (npx) | Registry de componentes UI |
| **github** | `GITHUB_TOKEN` en shell | PRs, issues, Actions |
| **gcp** | `gcloud auth login` (ya activo) | API keys, IAM, logs, `run_command` vía g-whiz |
| **browser** | built-in | E2E visual del portal |

## Plugins recomendados (chat)

Si falta algún MCP tras reload, en Agent chat:

```
/add-plugin supabase
/add-plugin vercel
/add-plugin railway
/add-plugin figma
/add-plugin gcp
```

Proyecto Maps GCP: `center-mind-maps-2026` (API key **CenterMind Frontend Maps**).

## Estructura del repo

```
CenterMind/           → API FastAPI, bot, servicios, tests
shelfy-frontend/      → Portal Next.js
ShelfMind-RPA/        → Playwright (Railway)
shelfy-mobile/        → Flutter SHELFYAPP
docs/                 → context, plans, assets, runbooks
scripts/              → utilidades repo
archive/              → histórico / sandbox
REPO_INDEX.txt/.pdf   → Mapa del repo + stack
CLAUDE.md             → Reglas de negocio e invariantes
```

## Antes de implementar

1. Leer lean: `CLAUDE.md`, `progress.md`, `arquitectura.md`, `frontend.md` (~240 líneas)
2. Detalle por módulo: `docs/context/README.md` — solo el `.md` que aplique a la tarea
3. Elegir MCP según `.cursor/rules/shelfy-agent-hub.mdc`
4. Al cerrar tarea relevante: sincronizar docs de contexto

## Regla de oro — favicon

**No borrar el logo de la pestaña.** Archivos protegidos: `shelfy-frontend/src/app/icon.png`, `apple-icon.png`, `favicon.ico`, `public/WEBICON.svg` y `metadata.icons` en `layout.tsx`. Ver `.cursor/rules/shelfy-favicon.mdc`.

## Auth pendiente (checklist)

- [ ] Supabase MCP → Connect (verde)
- [ ] Vercel MCP → Connect
- [ ] Figma MCP → Connect
- [ ] Railway → `railway login` en terminal
- [ ] GitHub → `export GITHUB_TOKEN=ghp_...` en `~/.zshrc`
- [ ] GCP → `gcloud auth login` (cuenta activa: ver `gcloud auth list`)
