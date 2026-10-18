# syntax=docker/dockerfile:1
# Nota: este Dockerfile se completa y verifica en F9 (verificación diferida).

FROM node:24-alpine AS base
WORKDIR /app

# --- dependencias (backend) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build backend (TypeScript) ---
FROM deps AS build-server
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build:server

# --- dependencias (frontend) ---
FROM base AS deps-web
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci

# --- build frontend (Vite) ---
FROM deps-web AS build-web
COPY web ./web
RUN npm --prefix web run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build-server /app/dist ./dist
COPY --from=build-web /app/web/dist ./web/dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
