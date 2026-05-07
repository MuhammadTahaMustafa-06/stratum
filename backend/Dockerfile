# Stage 1: Build stage
FROM python:3.12-slim AS builder

WORKDIR /app

# System dependencies for building Python wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv and project dependencies into a virtual environment
COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir uv && \
    uv venv /opt/venv && \
    . /opt/venv/bin/activate && \
    uv pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime stage
FROM python:3.12-slim

WORKDIR /app

# Fix security vulnerabilities by upgrading system packages
# This addresses CVE-2026-33845 (libgnutls30t64) and other critical findings
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Copy application code
COPY . .

# Create data directories and set permissions
RUN mkdir -p data/raw data/processed data/chroma_db data/whoosh_index && \
    useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
