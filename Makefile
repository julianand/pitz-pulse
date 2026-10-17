.PHONY: install dev build start test test-watch lint format typecheck llm-ping results eval docker-up docker-down

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

# Prueba rápida de una configuración LLM (usa el .env actual). Ej: make llm-ping ARGS="MSG-01"
llm-ping:
	npx tsx scripts/ping-llm.ts $(ARGS)

# Genera data/resultados.json a partir de data/mensajes.json (F4). MOCK=1 para offline.
results:
	tsx scripts/generate-results.ts

# Evalúa data/resultados.json contra data/etiquetas_esperadas.json (F6). No llama al modelo.
eval:
	tsx scripts/eval.ts

docker-up:
	docker compose up --build

docker-down:
	docker compose down
