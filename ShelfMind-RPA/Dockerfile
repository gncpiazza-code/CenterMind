FROM mcr.microsoft.com/playwright/python:v1.51.0-jammy

WORKDIR /app

# Dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar Chromium via Playwright
RUN playwright install chromium --with-deps

# Copiar código
COPY . .

# Variables de entorno (se sobreescriben en Railway)
ENV RPA_HEADLESS=true
ENV PYTHONUNBUFFERED=1

CMD ["python", "scheduler.py"]
