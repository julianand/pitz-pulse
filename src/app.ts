import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type Express } from 'express';
import type { ClassifyInput } from './agents/classifier/index.js';
import { env } from './config/env.js';
import type { ModelPrices } from './config/prices.js';
import { crearProvider } from './llm/factory.js';
import type { LlmMessage, LlmProvider } from './llm/types.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import { resolverPrompt } from './prompts/index.js';
import { healthRouter } from './routes/health.js';
import { crearApiRouter } from './routes/index.js';

/** Dependencias inyectables (tests) con wiring real por defecto. */
export interface AppDeps {
  provider?: LlmProvider;
  versionPrompt?: string;
  buildMessages?: (input: ClassifyInput) => LlmMessage[];
  prices?: ModelPrices;
  confidenceThreshold?: number;
  /** Directorio del build del frontend que sirve Express (`false` = no servir estáticos). */
  webDist?: string | false;
}

/**
 * Construye la app de Express: JSON, logger de acceso, `/health` (público), la API
 * `/solicitudes` (con auth) y el manejo central de errores.
 */
export function createApp(deps: AppDeps = {}): Express {
  const app = express();

  const versionPrompt = deps.versionPrompt ?? env.PROMPT_VERSION;
  const prompt = resolverPrompt(versionPrompt);

  const prices = deps.prices ?? {
    inputPer1M: env.PRICE_INPUT_PER_1M,
    outputPer1M: env.PRICE_OUTPUT_PER_1M,
  };

  app.use(express.json());
  app.use(requestLogger);

  app.use('/health', healthRouter);

  app.use(
    crearApiRouter({
      provider: deps.provider ?? crearProvider(),
      versionPrompt,
      buildMessages: deps.buildMessages ?? prompt.buildMessages,
      prices,
      confidenceThreshold: deps.confidenceThreshold ?? env.CONFIDENCE_THRESHOLD,
    }),
  );

  // Frontend compilado (`web/dist`): se sirve en el mismo origen (sin CORS). Si no
  // existe el build, se omite y las rutas desconocidas siguen respondiendo JSON 404.
  const webDistConfig = deps.webDist === undefined ? env.WEB_DIST : deps.webDist;

  if (webDistConfig) {
    const webDist = resolve(process.cwd(), webDistConfig);

    if (existsSync(webDist)) {
      app.use(express.static(webDist));

      // Fallback SPA: solo para **navegaciones del navegador**, que piden `text/html`
      // explícitamente. Un `Accept: */*` (fetch/curl/Postman) NO debe recibir HTML: tiene
      // que seguir siendo el 404 JSON de la API.
      app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        if (req.path.startsWith('/solicitudes') || req.path.startsWith('/health')) {
          next();
          return;
        }
        if (!req.headers.accept?.includes('text/html')) {
          next();
          return;
        }
        res.sendFile(resolve(webDist, 'index.html'));
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
