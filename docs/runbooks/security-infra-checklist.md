# Checklist infra — seguridad y rendimiento (2026-06-07)

## DNS Cloudflare

| Registro | Tipo | Valor | Notas |
|----------|------|-------|-------|
| `@` | A/CNAME | Vercel | OK |
| `www` | **A** | `76.76.21.21` | Agregado en Vercel; falta registro en CF |
| `api` | CNAME | Railway | Proxied — WAF/DDoS |

## Cloudflare — api.shelfycenter.com

- SSL/TLS: **Full (strict)**
- WebSockets: **ON**
- Evitar timeouts cortos en conexiones WS largas

## GitHub

Secret `SNYK_TOKEN` en Settings → Secrets → Actions.

## Verificación

```bash
cd shelfy-frontend && snyk test
snyk test --file=CenterMind/requirements.txt
curl -sI https://shelfycenter.com | grep -i strict-transport
```

Supabase migración `20260607_platform_security_hardening.sql` aplicada en prod 2026-06-07.
