# syntax=docker/dockerfile:1
# Single image for Hugging Face Spaces (Docker SDK) / any container host:
# builds the React front-end, then runs the FastAPI API which serves both the
# UI and /api on one origin (port 7860).

# ── Stage 1 · build the React front-end ─────────────────────────────
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build            # → /web/dist

# ── Stage 2 · Python API that also serves the built UI ──────────────
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/tmp/hf \
    HUGGINGFACE_HUB_CACHE=/tmp/hf \
    SENTENCE_TRANSFORMERS_HOME=/tmp/hf \
    MPLCONFIGDIR=/tmp/mpl
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python deps first for better layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Engine + API + data
COPY . .
# Built front-end from stage 1
COPY --from=web /web/dist ./web/dist

# Hugging Face Spaces may run the container as a non-root user (uid 1000);
# make runtime write targets and model caches writable for any user.
RUN mkdir -p /tmp/hf /tmp/mpl governed_data \
    && chmod -R 777 /tmp/hf /tmp/mpl governed_data data

EXPOSE 7860
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860"]
