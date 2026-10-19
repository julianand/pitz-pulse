# syntax=docker/dockerfile:1
# Imagen única: compila el backend (tsc) y el frontend (Vite), y en runtime sirve ambos
# desde Express. La BD SQLite vive en el volumen montado en /app/data (ver docker-compose.yml).

FROM node:24-alpine AS base
# `openssl` es requisito de los engines de Prisma sobre Alpine (musl).
RUN apk add --no-cache openssl
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
# La API key del frontend se "hornea" en el bundle al compilar (el navegador no lee env en
# runtime). Se recibe como build arg desde `docker-compose.yml`, que la toma de `.env`
# (la misma que usa el backend en API_KEY). El default coincide con el del backend.
ARG VITE_API_KEY=dev-api-key
COPY web ./web
RUN VITE_API_KEY="$VITE_API_KEY" npm --prefix web run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV WEB_DIST=web/dist

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Esquema + migraciones, y el cliente de Prisma generado dentro de la imagen.
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build-server /app/dist ./dist
COPY --from=build-web /app/web/dist ./web/dist

EXPOSE 3000
# Aplica migraciones y arranca (la BD persiste en el volumen).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
