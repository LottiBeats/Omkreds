# =============================================================================
# Dockerfile  —  Multi-stage build for StructuralCalc
#
# Stage 1 (builder):  Build the React frontend with Node.js
# Stage 2 (final):    Python 3.11-slim + pre-built frontend + FastAPI backend
#
# Build:
#   docker build -t structuralcalc:latest .
#
# Run (without Compose):
#   docker run -d \
#     -p 8000:8000 \
#     -v /data/structuralcalc:/data \
#     -e DATABASE_PATH=/data/projects.db \
#     -e ALLOWED_ORIGINS=https://yourdomain.com \
#     structuralcalc:latest
# =============================================================================

# ── Stage 1: Frontend build ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline --silent

COPY frontend/ .
RUN npm run build


# ── Stage 2: Final image ──────────────────────────────────────────────────────
FROM python:3.11-slim AS final

# System deps needed by weasyprint / fonttools (PDF generation)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf2.0-0 \
        libffi-dev \
        shared-mime-info \
        fonts-liberation \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system structcalc && \
    useradd --system --no-create-home --gid structcalc structcalc

WORKDIR /app

# Python dependencies first (cached layer unless requirements.txt changes)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ ./backend/

# Copy pre-built frontend into backend's static/ directory so FastAPI can serve it
# (or mount at a separate path — see docker-compose.yml)
COPY --from=frontend-builder /build/frontend/dist ./static/

# Data directory (volume-mounted in production)
RUN mkdir -p /data && chown structcalc:structcalc /data

# Switch to non-root
USER structcalc

WORKDIR /app/backend

# ── Runtime configuration ────────────────────────────────────────────────────
ENV DATABASE_PATH=/data/projects.db
ENV ALLOWED_ORIGINS=http://localhost:8000
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

# Health check — requires a /health endpoint in main.py
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info"]
