/**
 * @file pantone.ts
 * @description Tabela de aproximação digital de cores Pantone para uniformes esportivos e corporativos
 */

import { PantoneColor } from '@mockup/types';

export const PANTONE_LEGAL_DISCLAIMER =
  'A visualização da cor é uma aproximação digital. O resultado final na confecção pode apresentar variações mínimas conforme o lote do tecido, tipo de tinta têxtil, processo de sublimação/serigrafia e calibração da tela.';

export const ATHLETIC_PANTONE_SWATCHES: PantoneColor[] = [
  { code: 'PANTONE Black 6 C', name: 'Preto Profundo', hex: '#0f172a', rgb: { r: 15, g: 23, b: 42 } },
  { code: 'PANTONE Bright White', name: 'Branco Neve', hex: '#ffffff', rgb: { r: 255, g: 255, b: 255 } },
  { code: 'PANTONE 286 C', name: 'Azul Real Esportivo', hex: '#1d4ed8', rgb: { r: 29, g: 78, b: 216 } },
  { code: 'PANTONE 299 C', name: 'Azul Celeste Céu', hex: '#38bdf8', rgb: { r: 56, g: 189, b: 248 } },
  { code: 'PANTONE 186 C', name: 'Vermelho Campeão', hex: '#dc2626', rgb: { r: 220, g: 38, b: 38 } },
  { code: 'PANTONE 109 C', name: 'Amarelo Canário Ouro', hex: '#facc15', rgb: { r: 250, g: 204, b: 21 } },
  { code: 'PANTONE 356 C', name: 'Verde Gramado Pro', hex: '#059669', rgb: { r: 5, g: 150, b: 105 } },
  { code: 'PANTONE 802 C', name: 'Verde Neon Fluorescente', hex: '#22c55e', rgb: { r: 34, g: 197, b: 94 } },
  { code: 'PANTONE 1655 C', name: 'Laranja Fogo Vibrante', hex: '#ea580c', rgb: { r: 234, g: 88, b: 12 } },
  { code: 'PANTONE 2685 C', name: 'Roxo Imperial Nobre', hex: '#7c3aed', rgb: { r: 124, g: 58, b: 237 } },
  { code: 'PANTONE 124 C', name: 'Dourado Escudo', hex: '#d97706', rgb: { r: 217, g: 119, b: 6 } },
  { code: 'PANTONE Cool Gray 9 C', name: 'Cinza Titânio Grafite', hex: '#475569', rgb: { r: 71, g: 85, b: 105 } },
];

/**
 * Converte HEX (#RRGGBB) em RGB numérico
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Encontra a referência Pantone mais próxima baseada em distância Euclidiana no espaço RGB
 */
export function findClosestPantone(hex: string): {
  pantone: PantoneColor;
  distance: number;
} {
  const target = hexToRgb(hex);
  let bestMatch = ATHLETIC_PANTONE_SWATCHES[0];
  let minDistance = Infinity;

  for (const swatch of ATHLETIC_PANTONE_SWATCHES) {
    const dist = Math.sqrt(
      Math.pow(target.r - swatch.rgb.r, 2) +
      Math.pow(target.g - swatch.rgb.g, 2) +
      Math.pow(target.b - swatch.rgb.b, 2)
    );
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = swatch;
    }
  }

  return {
    pantone: bestMatch,
    distance: minDistance,
  };
}
