# Production Dockerfile for FM27 Command Hub
# Uses Debian slim (glibc) for full Vite 8 / Rolldown, tsx, and native Python 3.14 fmsave 0.14.3 decoding
FROM ghcr.io/astral-sh/uv:latest AS uv-bin

FROM node:22-slim
WORKDIR /app

COPY --from=uv-bin /uv /usr/local/bin/uv
RUN uv venv /opt/fmsave-venv --python 3.14 && \
    uv pip install --python /opt/fmsave-venv/bin/python fmsave==0.14.3

COPY package.json package-lock.json ./
RUN npm install --include=dev --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV FMSAVE_PYTHON=/opt/fmsave-venv/bin/python3

EXPOSE 8080
CMD ["node", "--import", "tsx", "server.ts"]
