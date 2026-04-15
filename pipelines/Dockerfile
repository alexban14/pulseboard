# ── Dagster ETL Pipeline ──
FROM python:3.12-slim

WORKDIR /app

# System deps for psycopg2 and pymysql
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]" && \
    pip install --no-cache-dir python-ulid cryptography

# Copy source
COPY . .

# Install the package
RUN pip install --no-cache-dir -e .

ENV DAGSTER_HOME=/app/dagster_home
RUN mkdir -p $DAGSTER_HOME

# Dagster config
COPY dagster.yaml $DAGSTER_HOME/dagster.yaml

EXPOSE 3070

CMD ["dagster-webserver", "-h", "0.0.0.0", "-p", "3070", "-w", "workspace.yaml"]
