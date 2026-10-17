# Atajos finos sobre los scripts de npm (la fuente de la verdad es package.json).
# Ej: `make test` ≡ `npm test`, `make llm-ping ARGS="MSG-01"` ≡ `npm run llm:ping -- MSG-01`.

.PHONY: install dev build start test test-watch typecheck lint format llm-ping results eval docker-up docker-down

install:
	npm install

dev:
	npm run dev

build:
	npm run build

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
