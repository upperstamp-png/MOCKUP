/**
 * @file colors.ts
 * @description As 20 Cores Padrão Oficiais do TexCraft QuickMockup com nomes e correspondências Pantone
 */

export interface StandardColor {
  id: string;
  name: string;
  hex: string;
  pantone: string;
}

export const STANDARD_20_COLORS: StandardColor[] = [
  { id: 'c1', name: 'Preto Absoluto', hex: '#0f172a', pantone: 'Black C' },
  { id: 'c2', name: 'Branco Puro', hex: '#ffffff', pantone: 'Bright White' },
  { id: 'c3', name: 'Azul Bebê', hex: '#7dd3fc', pantone: '290 C' },
  { id: 'c4', name: 'Azul Celeste', hex: '#38bdf8', pantone: '298 C' },
  { id: 'c5', name: 'Azul Royal', hex: '#1d4ed8', pantone: '286 C' },
  { id: 'c6', name: 'Azul Marinho', hex: '#0c2340', pantone: '289 C' },
  { id: 'c7', name: 'Vermelho Rubro', hex: '#dc2626', pantone: '186 C' },
  { id: 'c8', name: 'Vinho / Grená', hex: '#881337', pantone: '209 C' },
  { id: 'c9', name: 'Amarelo Canário', hex: '#facc15', pantone: '109 C' },
  { id: 'c10', name: 'Amarelo Ouro', hex: '#eab308', pantone: '123 C' },
  { id: 'c11', name: 'Laranja Fogo', hex: '#ea580c', pantone: '021 C' },
  { id: 'c12', name: 'Verde Esmeralda', hex: '#059669', pantone: '347 C' },
  { id: 'c13', name: 'Verde Bandeira', hex: '#15803d', pantone: '356 C' },
  { id: 'c14', name: 'Verde Neon', hex: '#22c55e', pantone: '802 C' },
  { id: 'c15', name: 'Verde Musgo', hex: '#3f6212', pantone: '574 C' },
  { id: 'c16', name: 'Roxo Imperial', hex: '#7c3aed', pantone: '2685 C' },
  { id: 'c17', name: 'Rosa Magenta', hex: '#ec4899', pantone: '806 C' },
  { id: 'c18', name: 'Dourado Campeão', hex: '#d97706', pantone: '7555 C' },
  { id: 'c19', name: 'Cinza Prata', hex: '#94a3b8', pantone: 'Cool Gray 6 C' },
  { id: 'c20', name: 'Cinza Chumbo', hex: '#334155', pantone: '432 C' },
];

/**
 * Valida e garante que a cor pertença estritamente à paleta padrão de 20 cores
 */
export function normalizeToStandardColor(hex: string): string {
  const found = STANDARD_20_COLORS.find(
    (c) => c.hex.toLowerCase() === hex.toLowerCase()
  );
  return found ? found.hex : STANDARD_20_COLORS[0].hex;
}
