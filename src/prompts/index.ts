import type { LlmMessage } from '../llm/types.js';
import { buildMessages as buildMessagesV1, VERSION as VERSION_V1 } from './classify.v1.js';
import { buildMessages as buildMessagesV2, VERSION as VERSION_V2 } from './classify.v2.js';

export interface PromptModule {
  VERSION: string;
  buildMessages: (input: { id: string; mensaje: string }) => LlmMessage[];
}

/**
 * Registry de prompts versionados. La versión activa se elige por env (`PROMPT_VERSION`)
 * y se inyecta en la salida. Agregar una versión = importar el archivo y registrarlo aquí.
 */
const PROMPTS: Record<string, PromptModule> = {
  [VERSION_V1]: { VERSION: VERSION_V1, buildMessages: buildMessagesV1 },
  [VERSION_V2]: { VERSION: VERSION_V2, buildMessages: buildMessagesV2 },
};

export const PROMPT_VERSIONS: string[] = Object.keys(PROMPTS);

export function resolverPrompt(version: string): PromptModule {
  const prompt = PROMPTS[version];

  if (!prompt) {
    throw new Error(
      `Prompt desconocido: "${version}". Versiones disponibles: ${PROMPT_VERSIONS.join(', ')}`,
    );
  }

  return prompt;
}
