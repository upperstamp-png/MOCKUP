/**
 * @file hit-test-mask.ts
 * @description Hit testing pixel-perfect para identificar cliques em partes separadas (Gola, Frente, Costas, Mangas e Zonas de Decal: Escudo, Logos, Nomes, Números)
 */

export type GarmentPart =
  | 'collar'
  | 'front'
  | 'back'
  | 'sleeve_left'
  | 'sleeve_right'
  | 'body'
  | 'sleeves'
  | 'escudo'
  | 'logomarca_frente'
  | 'logomarca_costas'
  | 'numero_frente'
  | 'numero_costas'
  | 'nome_costas_acima'
  | 'nome_costas_barra'
  | null;

export function hitTestMockupPart(
  point: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  masks: {
    collarMask?: HTMLImageElement | null;
    frontMask?: HTMLImageElement | null;
    backMask?: HTMLImageElement | null;
    sleeveLeftMask?: HTMLImageElement | null;
    sleeveRightMask?: HTMLImageElement | null;
    bodyMask?: HTMLImageElement | null;
    sleevesMask?: HTMLImageElement | null;
    escudoMask?: HTMLImageElement | null;
    logoFrontMask?: HTMLImageElement | null;
    logoBackMask?: HTMLImageElement | null;
    numberFrontMask?: HTMLImageElement | null;
    numberBackMask?: HTMLImageElement | null;
    nameBackTopMask?: HTMLImageElement | null;
    nameBackBottomMask?: HTMLImageElement | null;
  }
): GarmentPart {
  const normX = point.x / canvasWidth;
  const normY = point.y / canvasHeight;

  if (normX < 0 || normX > 1 || normY < 0 || normY > 1) {
    return null;
  }

  const testCanvas = document.createElement('canvas');
  testCanvas.width = 1;
  testCanvas.height = 1;
  const testCtx = testCanvas.getContext('2d', { willReadFrequently: true });
  if (!testCtx) return null;

  const checkPixel = (mask: HTMLImageElement | null | undefined): boolean => {
    if (!mask || !mask.complete || mask.naturalWidth === 0) return false;
    testCtx.clearRect(0, 0, 1, 1);
    testCtx.drawImage(
      mask,
      normX * mask.naturalWidth,
      normY * mask.naturalHeight,
      1,
      1,
      0,
      0,
      1,
      1
    );
    const pixel = testCtx.getImageData(0, 0, 1, 1).data;
    return pixel[3] > 30;
  };

  // 1. Zonas de Alta Especificidade (Decals / Aplicações)
  if (checkPixel(masks.escudoMask)) return 'escudo';
  if (checkPixel(masks.numberFrontMask)) return 'numero_frente';
  if (checkPixel(masks.logoFrontMask)) return 'logomarca_frente';
  if (checkPixel(masks.numberBackMask)) return 'numero_costas';
  if (checkPixel(masks.nameBackTopMask)) return 'nome_costas_acima';
  if (checkPixel(masks.nameBackBottomMask)) return 'nome_costas_barra';
  if (checkPixel(masks.logoBackMask)) return 'logomarca_costas';

  // 2. Testa Gola (alta prioridade no decote)
  if (checkPixel(masks.collarMask)) return 'collar';

  // 3. Testa Manga Esquerda
  if (checkPixel(masks.sleeveLeftMask)) return 'sleeve_left';

  // 4. Testa Manga Direita
  if (checkPixel(masks.sleeveRightMask)) return 'sleeve_right';

  // Fallback para máscara de mangas combinada
  if (checkPixel(masks.sleevesMask)) return 'sleeves';

  // 5. Testa Frente
  if (checkPixel(masks.frontMask)) return 'front';

  // 6. Testa Costas
  if (checkPixel(masks.backMask)) return 'back';

  // Fallback para corpo combinado
  if (checkPixel(masks.bodyMask)) return 'body';

  return null;
}
