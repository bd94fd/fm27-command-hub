# Production Dockerfile for FM27 Command Hub
# Uses Debian slim (glibc) for full Vite 8 / Rolldown & tsx compatibility
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["node", "--import", "tsx", "server.ts"]
