/**
 * @file duotone.ts
 * @description Engine de processamento de estampas SVG com substituição de cores duotone (Cor A e Cor B)
 */

import { assetCache } from './cache.js';

// Expressões regulares para correspondência de cores pretas e brancas
const BLACK_COLOR_REGEX = /^(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1(\.0+)?\s*\))$/i;
const WHITE_COLOR_REGEX = /^(#ffffff|#fff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*1(\.0+)?\s*\))$/i;

/**
 * Normaliza uma cor CSS para formato hexadecimal padrão #RRGGBB
 */
export function normalizeHexColor(color: string): string {
  const trimmed = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}

/**
 * Aplica transformação Duotone ao SVG bruto:
 * Preto (#000000 / black) -> Cor A
 * Branco (#FFFFFF / white) -> Cor B
 * 
 * Preserva:
 * - Opacidade e transparências (fill-opacity, stroke-opacity)
 * - Gradientes lineares e radiais
 * - Proporções, viewBox e definições
 * 
 * @param svgRaw Conteúdo textual do SVG
 * @param colorA Cor para substituir as partes escuras/pretas
 * @param colorB Cor para substituir as partes claras/brancas
 * @returns Promise com HTMLImageElement ou ImageBitmap pronto para renderização
 */
export async function applyDuotoneToSVG(
  svgRaw: string,
  colorA: string,
  colorB: string
): Promise<HTMLImageElement | ImageBitmap> {
  if (!svgRaw || typeof svgRaw !== 'string' || !svgRaw.includes('<svg')) {
    throw new Error('Conteúdo SVG inválido ou corrompido');
  }

  const normA = normalizeHexColor(colorA);
  const normB = normalizeHexColor(colorB);

  let processedSvg = svgRaw;

  // 1. Processamento via DOMParser (Ambiente Browser)
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgRaw, 'image/svg+xml');

      const parserError = doc.querySelector('parsererror');
      if (!parserError) {
        const allElements = doc.querySelectorAll('*');
        allElements.forEach((el) => {
          const tag = el.tagName.toLowerCase();

          // Processa atributo 'fill'
          const fill = el.getAttribute('fill');
          if (fill) {
            if (BLACK_COLOR_REGEX.test(fill.trim()) || fill.trim().toLowerCase() === '#000000') {
              el.setAttribute('fill', normA);
            } else if (WHITE_COLOR_REGEX.test(fill.trim()) || fill.trim().toLowerCase() === '#ffffff') {
              el.setAttribute('fill', normB);
            }
          } else if (['path', 'polygon', 'rect', 'circle', 'ellipse', 'text'].includes(tag)) {
            // Em SVG o fill padrão é preto, então atribui Cor A
            el.setAttribute('fill', normA);
          }

          // Processa atributo 'stroke'
          const stroke = el.getAttribute('stroke');
          if (stroke) {
            if (BLACK_COLOR_REGEX.test(stroke.trim())) {
              el.setAttribute('stroke', normA);
            } else if (WHITE_COLOR_REGEX.test(stroke.trim())) {
              el.setAttribute('stroke', normB);
            }
          }

          // Processa atributo 'stop-color' (gradientes)
          const stopColor = el.getAttribute('stop-color');
          if (stopColor) {
            if (BLACK_COLOR_REGEX.test(stopColor.trim())) {
              el.setAttribute('stop-color', normA);
            } else if (WHITE_COLOR_REGEX.test(stopColor.trim())) {
              el.setAttribute('stop-color', normB);
            }
          }

          // Processa estilos inline
          const style = el.getAttribute('style');
          if (style) {
            let newStyle = style
              .replace(/fill\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/gi, `fill: ${normA}`)
              .replace(/fill\s*:\s*(#ffffff|#fff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi, `fill: ${normB}`)
              .replace(/stroke\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/gi, `stroke: ${normA}`)
              .replace(/stroke\s*:\s*(#ffffff|#fff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi, `stroke: ${normB}`)
              .replace(/stop-color\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/gi, `stop-color: ${normA}`)
              .replace(/stop-color\s*:\s*(#ffffff|#fff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi, `stop-color: ${normB}`);
            el.setAttribute('style', newStyle);
          }
        });

        const serializer = new XMLSerializer();
        processedSvg = serializer.serializeToString(doc);
      }
    } catch {
      // Fallback
    }
  }

  // 2. Substituição via Regex (Fallback adicional)
  processedSvg = processedSvg
    .replace(/fill="(#000000|#000|black|rgb\(0,\s*0,\s*0\))"/gi, `fill="${normA}"`)
    .replace(/fill="(#ffffff|#fff|white|rgb\(255,\s*255,\s*255\))"/gi, `fill="${normB}"`)
    .replace(/stroke="(#000000|#000|black|rgb\(0,\s*0,\s*0\))"/gi, `stroke="${normA}"`)
    .replace(/stroke="(#ffffff|#fff|white|rgb\(255,\s*255,\s*255\))"/gi, `stroke="${normB}"`);

  // 3. Conversão para Blob e Carregamento como Imagem
  const blob = new Blob([processedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await assetCache.loadImage(objectUrl, false);
    URL.revokeObjectURL(objectUrl);
    return img;
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw new Error(`Erro ao renderizar SVG Duotone: ${err}`);
  }
}
