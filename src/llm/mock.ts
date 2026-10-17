import type { AreaSugerida, Categoria, Idioma, Prioridad } from '../domain/schemas.js';
import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';

/**
 * Proveedor **mock** (offline/tests): no llama a ninguna API. Devuelve una
 * clasificación determinista por heurísticas simples. NO es el modelo real y su
 * calidad es solo "plausible"; sirve para smoke tests y para correr el pipeline sin API key.
 */

function lastUserContent(request: LlmRequest): string {
  for (let i = request.messages.length - 1; i >= 0; i -= 1) {
    const message = request.messages[i];
    if (message && message.role === 'user') return message.content;
  }
  return '';
}

function extractMessage(userContent: string): string {
  const match = userContent.match(/"""([\s\S]*?)"""/);
  return (match?.[1] ?? userContent).trim();
}

function detectIdioma(text: string): Idioma {
  // Solo palabras claramente portuguesas (evitar términos idénticos en español como
  // "vendedor", "pedido" o "nota", que darían falsos positivos).
  const pt = /\b(oi|ol[áa]|n[ãa]o|voc[êe]|obrigado|painel|planilha|vendas|cupom|bot[ãa]o|fiscais|mec[âa]nico|diferen[çc]a|preciso|acesso|quantos|conta)\b/i;
  return pt.test(text) ? 'pt' : 'es';
}

function detectCategoria(text: string): Categoria {
  if (/acceso|acesso|permiso|permiss|panel|painel/i.test(text)) return 'acceso';
  if (/automat|autom[áa]tic/i.test(text)) return 'automatizacion';
  if (
    /error|500|no funciona|n[ãa]o funciona|sumiu|some|lento|trava|incorrecto|errado|duplicad|dobl|reembolso|reclam/i.test(
      text,
    )
  ) {
    return 'bug';
  }
  if (/planilha|reporte|datos|cu[áa]ntos|quantos|ventas|vendas|estado|spreadsheet/i.test(text)) {
    return 'datos';
  }
  if (/diferencia|diferen[çc]a|qu[ée] es|que es|c[óo]mo|como|qual|cu[áa]l/i.test(text)) {
    return 'consulta';
  }
  return 'otro';
}

function detectPrioridad(text: string): Prioridad {
  if (
    /urgente|urgent|error 500|duplicad|reclam|notas fiscais|notas fiscales|pago dos veces|no funciona|n[ãa]o funciona|bloquea|campanha|campa[ñn]a/i.test(
      text,
    )
  ) {
    return 'alta';
  }
  if (/lent|mec|cupom|fechamento|sexta|acceso|acesso|automat|painel|panel/i.test(text)) {
    return 'media';
  }
  return 'baja';
}

function detectArea(text: string, categoria: Categoria): AreaSugerida {
  if (/celular|m[óo]vil|movil|bot[ãa]o|bot[óo]n|pantalla|sumiu|some/i.test(text)) return 'frontend';

  switch (categoria) {
    case 'bug':
      return 'backend';
    case 'datos':
      return 'data';
    case 'consulta':
      return 'producto';
    default:
      return 'digital_transformation';
  }
}

function buildResumen(text: string): string {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 20).join(' ');
}

export function createMockProvider(model = 'mock'): LlmProvider {
  return {
    model,

    async complete(request: LlmRequest): Promise<LlmResponse> {
      const mensaje = extractMessage(lastUserContent(request));
      const categoria = detectCategoria(mensaje);
      const requiereInfo = mensaje.split(/\s+/).filter(Boolean).length < 8;

      const clasificacion = {
        id: '',
        categoria,
        prioridad: detectPrioridad(mensaje),
        area_sugerida: detectArea(mensaje, categoria),
        idioma: detectIdioma(mensaje),
        resumen: buildResumen(mensaje) || 'solicitud sin detalle',
        requiere_info: requiereInfo,
        pregunta_seguimiento: requiereInfo
          ? '¿Puedes dar más detalle (alcance, usuarios y desde cuándo) para poder actuar?'
          : null,
        confianza: 0.5,
        version_prompt: 'mock',
      };

      const content = JSON.stringify(clasificacion);
      const tokens = Math.max(1, Math.ceil(content.length / 4));

      return {
        content,
        usage: { promptTokens: tokens, completionTokens: tokens, totalTokens: tokens * 2 },
        model,
        latencyMs: 0,
      };
    },
  };
}
