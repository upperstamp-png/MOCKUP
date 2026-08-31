/**
 * @file transform.ts
 * @description Geometria, bounding boxes, hit-testing e transformações para elementos do Canvas
 */

import type { MockupElement } from '@mockup/types';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Calcula o Bounding Box de um elemento em coordenadas locais
 */
export function getElementBounds(
  element: MockupElement,
  canvasWidth: number = 1000,
  canvasHeight: number = 1000
): { width: number; height: number } {
  if (element.type === 'logo') {
    if (element.normWidth || element.slot === 'escudo') {
      const maxW = (element.normWidth || 0.0702) * canvasWidth;
      const maxH = (element.normHeight || 0.0702) * canvasHeight;
      const aspect = element.aspectRatio || (element.naturalWidth / element.naturalHeight) || 1;
      if (maxW / aspect <= maxH) {
        return { width: maxW, height: maxW / aspect };
      } else {
        return { width: maxH * aspect, height: maxH };
      }
    }
    return {
      width: element.naturalWidth * element.scaleX,
      height: element.naturalHeight * element.scaleY,
    };
  }

  if (element.type === 'text' || element.type === 'number') {
    let fontSize = element.fontSize;
    if (element.normHeight) {
      fontSize = element.normHeight * canvasHeight * 0.85;
    }
    // Estimativa precisa da largura da fonte
    const charWidth = fontSize * 0.6;
    const width = element.text.length * charWidth + (element.letterSpacing || 0) * (element.text.length - 1);
    const height = fontSize * 1.2;
    return {
      width: width * element.scaleX,
      height: height * element.scaleY,
    };
  }

  return { width: 100, height: 100 };
}

/**
 * Verifica se um ponto (x, y) está dentro do elemento considerando rotação e escala
 */
export function hitTestElement(
  point: Point,
  element: MockupElement,
  canvasWidth: number,
  canvasHeight: number
): boolean {
  if (!element.visible) return false;

  const bounds = getElementBounds(element, canvasWidth, canvasHeight);
  const elementAbsX = element.x * canvasWidth;
  const elementAbsY = element.y * canvasHeight;

  // Translação para a origem do elemento
  const dx = point.x - elementAbsX;
  const dy = point.y - elementAbsY;

  // Rotação inversa
  const cos = Math.cos(-element.rotation);
  const sin = Math.sin(-element.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;

  return (
    localX >= -halfW &&
    localX <= halfW &&
    localY >= -halfH &&
    localY <= halfH
  );
}

/**
 * Identifica a alça de controle clicada (rotate, resize-nw, resize-se, etc.)
 */
export type HandleType = 'rotate' | 'scale-se' | 'scale-sw' | 'scale-ne' | 'scale-nw' | 'body' | null;

export function hitTestHandles(
  point: Point,
  element: MockupElement,
  canvasWidth: number,
  canvasHeight: number,
  handleRadius: number = 10
): HandleType {
  // Elementos travados (ex: escudo oficial) não possuem alças manipuláveis
  if (element.locked || element.slot === 'escudo') {
    return null;
  }

  const bounds = getElementBounds(element);
  const elementAbsX = element.x * canvasWidth;
  const elementAbsY = element.y * canvasHeight;

  const dx = point.x - elementAbsX;
  const dy = point.y - elementAbsY;

  const cos = Math.cos(-element.rotation);
  const sin = Math.sin(-element.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;

  // Alça de Rotação (acima do topo)
  const rotateHandleY = -halfH - 24;
  if (Math.hypot(localX, localY - rotateHandleY) <= handleRadius) {
    return 'rotate';
  }

  // Alças de cantos
  if (Math.hypot(localX - halfW, localY - halfH) <= handleRadius) return 'scale-se';
  if (Math.hypot(localX + halfW, localY - halfH) <= handleRadius) return 'scale-sw';
  if (Math.hypot(localX - halfW, localY + halfH) <= handleRadius) return 'scale-ne';
  if (Math.hypot(localX + halfW, localY + halfH) <= handleRadius) return 'scale-nw';

  // Corpo do elemento
  if (localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH) {
    return 'body';
  }

  return null;
}
