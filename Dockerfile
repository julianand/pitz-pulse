# syntax=docker/dockerfile:1
# Nota: este Dockerfile se completa y verifica en F9 (verificación diferida).
# En F3 se agrega prisma/ y en F7 el build del frontend.

FROM node:24-alpine AS base
WORKDIR /app

# --- dependencias ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build (TypeScript) ---
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
