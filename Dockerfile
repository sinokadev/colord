FROM ghcr.io/astral-sh/uv:latest AS uv

FROM python:3.13-slim AS python-deps
COPY --from=uv /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.13-slim

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    COLORS_FILE=/data/colors.json

WORKDIR /app
COPY --from=python-deps /app/.venv ./.venv
COPY main.py colors.json ./
COPY templates ./templates

RUN groupadd --system colord \
    && useradd --system --gid colord --home-dir /app colord \
    && mkdir -p /data \
    && cp colors.json /data/colors.json \
    && chown -R colord:colord /data

USER colord

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
