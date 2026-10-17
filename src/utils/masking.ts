/**
 * Enmascaramiento de datos sensibles antes de enviar texto al modelo (y antes de
 * loggear o exponer errores).
 *
 * Cubre:
 * - Correos electrónicos.
 * - Teléfonos de Brasil (+55) y México (+52), en formatos con código de país,
 *   paréntesis o guion.
 * - CNPJ (Brasil, 14 dígitos) y CPF (Brasil, 11 dígitos), con o sin formato.
 * - RFC (México).
 *
 * NO cubre (ver `DECISIONES.md`): nombres de personas, direcciones, IDs internos
 * de Pitz, montos, ni identificadores alfanuméricos propios. El enmascaramiento
 * es **no reversible**.
 */

export type SensitiveType = 'email' | 'telefono' | 'cnpj' | 'cpf' | 'rfc';

export interface MaskDetection {
  type: SensitiveType;
  count: number;
}

export interface MaskResult {
  masked: string;
  detections: MaskDetection[];
}

const PLACEHOLDERS: Record<SensitiveType, string> = {
  email: '[EMAIL]',
  telefono: '[TELEFONO]',
  cnpj: '[CNPJ]',
  cpf: '[CPF]',
  rfc: '[RFC]',
};

interface Rule {
  type: SensitiveType;
  source: string;
  flags: string;
}

/**
 * Orden importante: los teléfonos exigen prefijo de país, paréntesis o guion para
 * no confundirse con CPF/CNPJ; por eso van antes que los identificadores, cuyos
 * dígitos "limpios" se reservan para CPF/CNPJ.
 */
const RULES: Rule[] = [
  {
    type: 'email',
    source: '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}',
    flags: 'gi',
  },
  // Teléfonos Brasil (+55).
  {
    type: 'telefono',
    source: '\\+55\\s?\\(?\\d{2}\\)?\\s?\\d{4,5}[\\s-]?\\d{4}',
    flags: 'g',
  },
  // Teléfonos México (+52).
  {
    type: 'telefono',
    source: '\\+52\\s?\\(?\\d{1,3}\\)?\\s?\\d{2,4}\\s?\\d{4}',
    flags: 'g',
  },
  // Teléfonos con código de área entre paréntesis: (11) 98765-4321 / (55) 1234 5678.
  {
    type: 'telefono',
    source: '\\(\\d{2,3}\\)\\s?\\d{3,5}[\\s-]?\\d{4}',
    flags: 'g',
  },
  // Número local con guion: 98765-4321.
  {
    type: 'telefono',
    source: '\\b\\d{4,5}-\\d{4}\\b',
    flags: 'g',
  },
  // CNPJ: 14 dígitos, con o sin formato (12.345.678/0001-90 o 12345678000190).
  {
    type: 'cnpj',
    source: '\\b\\d{2}\\.?\\d{3}\\.?\\d{3}/?\\d{4}-?\\d{2}\\b',
    flags: 'g',
  },
  // CPF: 11 dígitos, con o sin formato (123.456.789-00 o 12345678900).
  {
    type: 'cpf',
    source: '\\b\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}\\b',
    flags: 'g',
  },
  // RFC (México): 3-4 letras + 6 dígitos (fecha) + 3 alfanuméricos.
  {
    type: 'rfc',
    source: '\\b[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}\\b',
    flags: 'gi',
  },
];

/**
 * Enmascara datos sensibles y devuelve además cuántos de cada tipo se detectaron
 * (sin exponer los valores originales).
 */
export function maskSensitiveWithReport(text: string): MaskResult {
  let masked = text;
  const counts = new Map<SensitiveType, number>();

  for (const rule of RULES) {
    const re = new RegExp(rule.source, rule.flags);
    const matches = masked.match(re);

    if (matches && matches.length > 0) {
      counts.set(rule.type, (counts.get(rule.type) ?? 0) + matches.length);
      masked = masked.replace(re, PLACEHOLDERS[rule.type]);
    }
  }

  const detections: MaskDetection[] = [...counts].map(([type, count]) => ({ type, count }));

  return { masked, detections };
}

/** Enmascara datos sensibles y devuelve solo el texto resultante. */
export function maskSensitive(text: string): string {
  return maskSensitiveWithReport(text).masked;
}
