# Atajos finos sobre los scripts de npm (la fuente de la verdad es package.json).
# Ej: `make test` ≡ `npm test`, `make llm-ping ARGS="MSG-01"` ≡ `npm run llm:ping -- MSG-01`.

.PHONY: install dev dev-server dev-web web-install build build-server build-web start test test-watch typecheck lint format llm-ping smoke results eval docker-up docker-down

install:
	npm install

# `dev` levanta backend + frontend juntos (concurrently).
dev:
	npm run dev

dev-server:
	npm run dev:server

dev-web:
	npm run dev:web

web-install:
	npm run web:install

# `build` compila backend + frontend juntos (concurrently).
build:
	npm run build

build-server:
	npm run build:server

build-web:
	npm run build:web

start:
	npm start

typecheck:
	npm run typecheck

test:
	npm test

test-watch:
	npm run test:watch

lint:
	npm run lint

format:
	npm run format

# Prueba rápida de una configuración LLM (usa el .env actual).
llm-ping:
	npm run llm:ping -- $(ARGS)

# Smoke test de la API contra un server levantado (ARGS="--base-url http://localhost:3000").
smoke:
	npm run smoke -- $(ARGS)

# Genera data/resultados.json a partir de data/mensajes.json (MOCK=1 para offline).
results:
	npm run results

# Evalúa data/resultados.json contra data/etiquetas_esperadas.json. No llama al modelo.
eval:
	npm run eval

docker-up:
	docker compose up --build

docker-down:
	docker compose down
