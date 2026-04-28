# Imagen compatible con Playwright 1.51 (Chromium + dependencias del SO ya incluidas)
FROM mcr.microsoft.com/playwright/python:v1.51.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x /app/docker-entrypoint.sh

# Runtime (Railway: sobreescribir vía variables del servicio, no commitear .env)
ENV RPA_HEADLESS=true
ENV RPA_START_MODE=scheduler
ENV PYTHONUNBUFFERED=1

# Proceso por defecto: APScheduler 24/7 (horarios en scheduler.py)
CMD ["/app/docker-entrypoint.sh"]
