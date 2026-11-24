# Production 2-Stage Dockerfile for FM27 Command Hub
# Uses Debian slim (glibc) for full Vite 8 / Rolldown, tsx, and native Python 3.14 fmsave 0.14.3 decoding
FROM ghcr.io/astral-sh/uv:0.13.9 AS uv-bin

# Stage 1: Build Frontend & Prune Dev Dependencies
FROM node:26-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev --legacy-peer-deps

COPY . .
RUN npm run build

# Stage 2: Slim Runtime Image (Non-Root + Python 3.14 fmsave 0.14.3)
FROM node:26-slim AS runtime
WORKDIR /app

COPY --from=uv-bin /uv /usr/local/bin/uv
# uv installs managed Pythons under /root by default, which the non-root `node`
# runtime user cannot traverse. Keep the interpreter in a world-readable path.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN mkdir -p /opt/uv-python && \
    uv venv /opt/fmsave-venv --python 3.14 && \
    uv pip install --python /opt/fmsave-venv/bin/python fmsave==0.14.3 && \
    chmod -R a+rX /opt/uv-python /opt/fmsave-venv && \
    rm -rf /root/.cache/uv

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/server.ts ./server.ts

ENV NODE_ENV=production
ENV PORT=8080
ENV FMSAVE_PYTHON=/opt/fmsave-venv/bin/python3

USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "server.ts"]
