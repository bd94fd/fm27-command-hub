# Multi-stage production Dockerfile for FM27 Command Hub
# Compatible with Google Cloud Run, Render, Fly.io, and Railway
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm install tsx --no-save --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts

EXPOSE 8080
CMD ["node", "--import", "tsx", "server.ts"]
