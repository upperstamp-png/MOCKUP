/**
 * @file pipeline.ts
 * @description Pipeline de composição 2D multi-máscaras e blend multiply para mockups fotorrealistas
 */

import type { MockupElement, MockupView } from '@mockup/types';
import { getElementBounds } from './transform.js';

export interface RenderCanvasPipelineOptions {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  maskImage?: HTMLImageElement | ImageBitmap | null;
  backgroundMask?: HTMLImageElement | ImageBitmap | null;
  frontMask?: HTMLImageElement | ImageBitmap | null;
  backMask?: HTMLImageElement | ImageBitmap | null;
  sleeveLeftMask?: HTMLImageElement | ImageBitmap | null;
  sleeveRightMask?: HTMLImageElement | ImageBitmap | null;
  bodyMask?: HTMLImageElement | ImageBitmap | null;
  sleevesMask?: HTMLImageElement | ImageBitmap | null;
  collarMask?: HTMLImageElement | ImageBitmap | null;
  patternImage?: HTMLImageElement | ImageBitmap | null;
  shadowImage?: HTMLImageElement | ImageBitmap | null;
  colorA?: string;
  colorB?: string;
  frontColor?: string;
  backColor?: string;
  sleeveLeftColor?: string;
  sleeveRightColor?: string;
  collarColor?: string;
  sleevesColor?: string;
  elements: MockupElement[];
  view: MockupView;
  selectedElementId?: string | null;
  showBoundingBoxes?: boolean;
  exportScale?: number;
  backgroundColor?: string;
}

/**
 * Renderiza um elemento individual (Logo, Texto ou Número)
 */
export function renderElement(
  ctx: CanvasRenderingContext2D,
  element: MockupElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!element.visible) return;

  const posX = element.x * canvasWidth;
  const posY = element.y * canvasHeight;

  ctx.save();
  ctx.translate(posX, posY);
  ctx.rotate(element.rotation);
  ctx.globalAlpha = element.opacity;

  if (element.type === 'logo') {
    let w = element.naturalWidth * element.scaleX;
    let h = element.naturalHeight * element.scaleY;
    if (element.normWidth || element.slot === 'escudo') {
      const maxW = (element.normWidth || 0.0702) * canvasWidth;
      const maxH = (element.normHeight || 0.0702) * canvasHeight;
      const aspect = element.aspectRatio || (element.naturalWidth / element.naturalHeight) || 1;
      if (maxW / aspect <= maxH) {
        w = maxW;
        h = maxW / aspect;
      } else {
        h = maxH;
        w = maxH * aspect;
      }
    }
    const img = (element as unknown as { _imageInstance?: HTMLImageElement })._imageInstance;
    if (img && img.complete) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = 'rgba(100, 100, 100, 0.4)';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
  } else if (element.type === 'text' || element.type === 'number') {
    let fontSize = element.fontSize;
    if (element.normHeight) {
      fontSize = element.normHeight * canvasHeight * 0.85;
    }
    ctx.scale(element.scaleX, element.scaleY);
    ctx.font = `${element.fontWeight || 'bold'} ${fontSize}px ${element.fontFamily || 'Inter, sans-serif'}`;
    ctx.textAlign = (element.type === 'text' ? element.align : 'center') || 'center';
    ctx.textBaseline = 'middle';

    // Letter spacing se suportado
    if (typeof (ctx as unknown as { letterSpacing?: string }).letterSpacing !== 'undefined') {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${element.letterSpacing || 0}px`;
    }

    // Contorno (Stroke) se houver
    if (element.strokeColor && element.strokeWidth && element.strokeWidth > 0) {
      ctx.strokeStyle = element.strokeColor;
      ctx.lineWidth = element.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(element.text, 0, 0);
    }

    // Preenchimento (Fill)
    ctx.fillStyle = element.color;
    ctx.fillText(element.text, 0, 0);
  }

  ctx.restore();
}

/**
 * Desenha a caixa de seleção e as alças interativas no elemento ativo
 */
export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  element: MockupElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const bounds = getElementBounds(element, canvasWidth, canvasHeight);
  const posX = element.x * canvasWidth;
  const posY = element.y * canvasHeight;

  ctx.save();
  ctx.translate(posX, posY);
  ctx.rotate(element.rotation);

  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  const padding = 6;

  // Caixa de seleção
  const isLocked = element.locked || element.slot === 'escudo';
  ctx.strokeStyle = isLocked ? '#22c55e' : '#7dd3fc'; // Verde para travado, Azul Bebê para livre
  ctx.lineWidth = 1.5;
  ctx.setLineDash(isLocked ? [2, 2] : [4, 4]);
  ctx.strokeRect(-halfW - padding, -halfH - padding, bounds.width + padding * 2, bounds.height + padding * 2);

  // Se o elemento estiver travado (ex: escudo padrão), não renderiza alças de manipulação
  if (isLocked) {
    ctx.restore();
    return;
  }

  // Linha para alça de rotação
  ctx.beginPath();
  ctx.setLineDash([]);
  ctx.moveTo(0, -halfH - padding);
  ctx.lineTo(0, -halfH - padding - 18);
  ctx.stroke();

  // Alça de rotação
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath();
  ctx.arc(0, -halfH - padding - 18, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Alças de redimensionamento nos 4 cantos
  const corners = [
    { x: -halfW - padding, y: -halfH - padding },
    { x: halfW + padding, y: -halfH - padding },
    { x: halfW + padding, y: halfH + padding },
    { x: -halfW - padding, y: halfH + padding },
  ];

  corners.forEach((corner) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.fillRect(corner.x - 4, corner.y - 4, 8, 8);
    ctx.strokeRect(corner.x - 4, corner.y - 4, 8, 8);
  });

  ctx.restore();
}

/**
 * Auxiliar para desenhar conteúdo recortado por uma máscara alfa
 */
function drawMaskedContent(
  targetCtx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  mask: HTMLImageElement | ImageBitmap,
  drawContent: (tempCtx: CanvasRenderingContext2D) => void
): void {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvasWidth;
  tempCanvas.height = canvasHeight;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;

  drawContent(tempCtx);

  tempCtx.globalCompositeOperation = 'destination-in';
  tempCtx.drawImage(mask, 0, 0, canvasWidth, canvasHeight);

  targetCtx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight);
}

/**
 * Executa a composição completa em camadas (Background -> Máscaras Modulares -> Decals -> Multiply por cima)
 */
export function renderCompositeMockup(options: RenderCanvasPipelineOptions): void {
  const {
    ctx,
    canvasWidth,
    canvasHeight,
    maskImage,
    backgroundMask,
    frontMask,
    backMask,
    sleeveLeftMask,
    sleeveRightMask,
    bodyMask,
    sleevesMask,
    collarMask,
    patternImage,
    shadowImage,
    backgroundColor,
    colorA = '#0f172a',
    colorB = '#38bdf8',
    frontColor,
    backColor,
    sleeveLeftColor,
    sleeveRightColor,
    collarColor,
    sleevesColor,
    elements,
    view,
    selectedElementId,
    showBoundingBoxes = true,
  } = options;

  // 0. Limpa o Canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // ==========================================
  // CAMADA 1: BACKGROUND / COR GERAL (SEMPRE BRANCO PADRÃO #ffffff)
  // ==========================================
  const effectiveBgMask = backgroundMask || maskImage;
  if (effectiveBgMask) {
    drawMaskedContent(ctx, canvasWidth, canvasHeight, effectiveBgMask, (tempCtx) => {
      tempCtx.fillStyle = backgroundColor || '#ffffff';
      tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    });
  }

  // ==========================================
  // CAMADA 2: MÁSCARAS MODULARES DE PARTES
  // ==========================================

  // 2.1 Frente da Camisa
  const effectiveFrontMask = frontMask || bodyMask;
  if (effectiveFrontMask) {
    drawMaskedContent(ctx, canvasWidth, canvasHeight, effectiveFrontMask, (tempCtx) => {
      if (patternImage) {
        tempCtx.drawImage(patternImage, 0, 0, canvasWidth, canvasHeight);
      } else {
        tempCtx.fillStyle = frontColor || colorA;
        tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    });
  }

  // 2.2 Costas da Camisa
  if (backMask) {
    drawMaskedContent(ctx, canvasWidth, canvasHeight, backMask, (tempCtx) => {
      if (patternImage) {
        tempCtx.drawImage(patternImage, 0, 0, canvasWidth, canvasHeight);
      } else {
        tempCtx.fillStyle = backColor || colorA;
        tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    });
  }

  // 2.3 Manga Esquerda
  const effectiveSleeveLeftMask = sleeveLeftMask || sleevesMask;
  if (effectiveSleeveLeftMask) {
    drawMaskedContent(ctx, canvasWidth, canvasHeight, effectiveSleeveLeftMask, (tempCtx) => {
      tempCtx.fillStyle = sleeveLeftColor || sleevesColor || colorA;
      tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    });
  }

  // 2.4 Manga Direita
  const effectiveSleeveRightMask = sleeveRightMask || sleevesMask;
  if (effectiveSleeveRightMask) {
    drawMaskedContent(ctx, canvasWidth, canvasHeight, effectiveSleeveRightMask, (tempCtx) => {
      tempCtx.fillStyle = sleeveRightColor || sleevesColor || colorA;
      tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    });
  }

  // 2.5 Gola Careca
  if (collarMask) {
    drawMaskedContent(ctx, canvasWidth, canvasHeight, collarMask, (tempCtx) => {
      tempCtx.fillStyle = collarColor || colorB;
      tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    });
  }

  // ==========================================
  // CAMADA 3: DECALS (Logos, Nomes, Números)
  // ==========================================
  const viewElements = elements
    .filter((el) => el.view === view)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  viewElements.forEach((el) => {
    renderElement(ctx, el, canvasWidth, canvasHeight);
  });

  // ==========================================
  // CAMADA 4: MULTIPLAY POR CIMA DE TUDO (TOP LAYER)
  // ==========================================
  if (shadowImage) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(shadowImage, 0, 0, canvasWidth, canvasHeight);
    ctx.restore();
  }

  // ==========================================
  // OVERLAY: CAIXAS DE SELEÇÃO & INTERAÇÃO
  // ==========================================
  if (showBoundingBoxes && selectedElementId) {
    const selectedEl = viewElements.find((el) => el.id === selectedElementId);
    if (selectedEl) {
      renderSelectionOverlay(ctx, selectedEl, canvasWidth, canvasHeight);
    }
  }
}
