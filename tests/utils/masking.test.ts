import { describe, expect, it } from 'vitest';
import { maskSensitive, maskSensitiveWithReport } from '../../src/utils/masking.js';

describe('maskSensitive', () => {
  it('enmascara correos electrónicos', () => {
    const entrada = 'Escribime a julian.pitre@example.com para el acceso.';
    expect(maskSensitive(entrada)).toBe('Escribime a [EMAIL] para el acceso.');
  });

  it('enmascara teléfonos de Brasil con +55', () => {
    expect(maskSensitive('Llamame al +55 11 98765-4321')).toBe('Llamame al [TELEFONO]');
  });

  it('enmascara teléfonos de México con +52', () => {
    expect(maskSensitive('Marca al +52 55 1234 5678')).toBe('Marca al [TELEFONO]');
  });

  it('enmascara teléfonos con código de área entre paréntesis', () => {
    expect(maskSensitive('Contacto: (11) 98765-4321')).toBe('Contacto: [TELEFONO]');
  });

  it('enmascara telefónos locales con guion', () => {
    expect(maskSensitive('mi cel es 98765-4321')).toBe('mi cel es [TELEFONO]');
  });

  it('enmascara CNPJ con formato', () => {
    expect(maskSensitive('El CNPJ 12.345.678/0001-90 está equivocado.')).toBe(
      'El CNPJ [CNPJ] está equivocado.',
    );
  });

  it('enmascara CNPJ sin formato', () => {
    expect(maskSensitive('CNPJ: 12345678000190')).toBe('CNPJ: [CNPJ]');
  });

  it('enmascara CPF con formato', () => {
    expect(maskSensitive('CPF 123.456.789-00')).toBe('CPF [CPF]');
  });

  it('enmascara CPF sin formato', () => {
    expect(maskSensitive('CPF: 12345678900')).toBe('CPF: [CPF]');
  });

  it('enmascara RFC de México', () => {
    expect(maskSensitive('Mi RFC es AABC010101ABC.')).toBe('Mi RFC es [RFC].');
  });

  it('no modifica texto sin datos sensibles', () => {
    const entrada = 'Hola equipo, error 500 al subir el catálogo (MSG-01).';
    expect(maskSensitive(entrada)).toBe(entrada);
  });

  it('enmascara varios tipos en el mismo texto', () => {
    const entrada =
      'Soy Ana, correo ana@example.com, tel +52 55 1234 5678 y CNPJ 12.345.678/0001-90.';
    expect(maskSensitive(entrada)).toBe('Soy Ana, correo [EMAIL], tel [TELEFONO] y CNPJ [CNPJ].');
  });
});

describe('maskSensitiveWithReport', () => {
  it('reporta los tipos y cantidades detectadas', () => {
    const { masked, detections } = maskSensitiveWithReport(
      'a@b.com y c@d.com, tel +55 11 98765-4321',
    );

    expect(masked).toBe('[EMAIL] y [EMAIL], tel [TELEFONO]');
    expect(detections).toContainEqual({ type: 'email', count: 2 });
    expect(detections).toContainEqual({ type: 'telefono', count: 1 });
  });

  it('no reporta detecciones cuando no hay datos sensibles', () => {
    const { detections } = maskSensitiveWithReport('sin datos');
    expect(detections).toEqual([]);
  });

  it('no filtra los valores originales en el reporte', () => {
    const { detections } = maskSensitiveWithReport('correo secreto@example.com');
    expect(JSON.stringify(detections)).not.toContain('secreto@example.com');
  });
});
