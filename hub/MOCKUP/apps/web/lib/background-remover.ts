/**
 * @file background-remover.ts
 * @description Módulo de remoção de fundo e auto-recorte (trim) de alta precisão para logotipos, escudos e patrocínios.
 *
 * Funcionalidades:
 * 1. Remoção Externa Contígua (Flood Fill a partir das 4 bordas externas):
 *    - Remove APENAS o fundo de fora da imagem.
 *    - Preserva 100% dos detalhes brancos, textos e cores internas do escudo ou logotipo.
 * 2. Auto-Trim (Recorte Justo ao Bounding Box Real):
 *    - Elimina todas as margens vazias/transparentes ao redor do elemento.
 *    - Faz com que o logo/escudo ocupe 100% da caixa da máscara sem ficar miniaturizado por espaços em branco.
 * 3. Integração com IA Neural (@imgly/background-removal) e Fallback Instantâneo de Matting.
 */

export interface RemoveBackgroundOptions {
  mode?: 'ai' | 'smart-solid' | 'auto';
  tolerance?: number; // 0 a 100 para sensibilidade de cor do fundo
  feather?: number;   // Suavização das bordas
  autoTrim?: boolean; // Se deve recortar rente ao elemento (padrão: true)
}

export interface ProcessedImageResult {
  url: string;
  width: number;
  height: number;
}

/**
 * Recorta uma imagem transparente rente aos seus pixels visíveis (Auto-Trim)
 */
export function autoTrimCanvas(
  sourceCanvas: HTMLCanvasElement,
  alphaThreshold: number = 15,
  padding: number = 2
): HTMLCanvasElement {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceCanvas;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w, maxX = -1, minY = h, maxY = -1;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = data[rowOffset + x * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Se a imagem for totalmente transparente ou já estiver ajustada
  if (maxX < minX || maxY < minY) {
    return sourceCanvas;
  }

  // Aplica padding seguro
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropW = Math.min(w - cropX, (maxX - minX + 1) + padding * 2);
  const cropH = Math.min(h - cropY, (maxY - minY + 1) + padding * 2);

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = cropW;
  trimmedCanvas.height = cropH;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  if (!trimmedCtx) return sourceCanvas;

  trimmedCtx.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    cropW,
    cropH
  );

  return trimmedCanvas;
}

/**
 * Remove o fundo contíguo externo via Flood Fill a partir das 4 bordas,
 * preservando todas as cores internas do elemento e aplicando Auto-Trim.
 */
export async function removeSolidBackground(
  imageSource: string | HTMLImageElement | File | Blob,
  tolerance: number = 32,
  feather: number = 2,
  autoTrim: boolean = true
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        return resolve({
          url: typeof imageSource === 'string' ? imageSource : img.src,
          width: w,
          height: h,
        });
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // 1. Amostra a cor do fundo pelas 4 bordas externas
      let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;
      const samplePixel = (x: number, y: number) => {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] > 50) {
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
          sampleCount++;
        }
      };

      for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 30))) {
        samplePixel(x, 0);
        samplePixel(x, h - 1);
      }
      for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 30))) {
        samplePixel(0, y);
        samplePixel(w - 1, y);
      }

      if (sampleCount > 0) {
        bgR = Math.round(bgR / sampleCount);
        bgG = Math.round(bgG / sampleCount);
        bgB = Math.round(bgB / sampleCount);
      } else {
        bgR = 255; bgG = 255; bgB = 255;
      }

      const tolSq = tolerance * tolerance * 3;
      const featherRange = Math.max(0.05, Math.min(0.5, feather * 0.15));
      const cutoff = 1 - featherRange;

      // 2. Flood Fill BFS começando EXCLUSIVAMENTE nas 4 bordas externas
      const totalPixels = w * h;
      const visited = new Uint8Array(totalPixels);
      const queue = new Int32Array(totalPixels);
      let head = 0;
      let tail = 0;

      const checkAndEnqueue = (x: number, y: number) => {
        const pIdx = y * w + x;
        if (visited[pIdx]) return;
        visited[pIdx] = 1;

        const dIdx = pIdx * 4;
        const a = data[dIdx + 3];
        if (a < 20) {
          queue[tail++] = pIdx;
          return;
        }

        const r = data[dIdx];
        const g = data[dIdx + 1];
        const b = data[dIdx + 2];
        const diffR = r - bgR;
        const diffG = g - bgG;
        const diffB = b - bgB;
        const distSq = diffR * diffR + diffG * diffG + diffB * diffB;

        if (distSq <= tolSq) {
          queue[tail++] = pIdx;
        }
      };

      // Inicia a fila com todas as bordas
      for (let x = 0; x < w; x++) {
        checkAndEnqueue(x, 0);
        checkAndEnqueue(x, h - 1);
      }
      for (let y = 1; y < h - 1; y++) {
        checkAndEnqueue(0, y);
        checkAndEnqueue(w - 1, y);
      }

      // Executa BFS contíguo para remover apenas o exterior
      while (head < tail) {
        const pIdx = queue[head++];
        const x = pIdx % w;
        const y = (pIdx / w) | 0;
        const dIdx = pIdx * 4;

        const r = data[dIdx];
        const g = data[dIdx + 1];
        const b = data[dIdx + 2];
        const a = data[dIdx + 3];

        const diffR = r - bgR;
        const diffG = g - bgG;
        const diffB = b - bgB;
        const distSq = diffR * diffR + diffG * diffG + diffB * diffB;

        if (distSq <= tolSq) {
          const factor = Math.sqrt(distSq) / (tolerance * 1.732);
          if (factor < cutoff) {
            data[dIdx + 3] = 0;
          } else {
            data[dIdx + 3] = Math.round(a * (factor - cutoff) / featherRange);
          }
        }

        // Vizinhos 4-conectados
        if (x > 0) checkAndEnqueue(x - 1, y);
        if (x < w - 1) checkAndEnqueue(x + 1, y);
        if (y > 0) checkAndEnqueue(x, y - 1);
        if (y < h - 1) checkAndEnqueue(x, y + 1);
      }

      ctx.putImageData(imgData, 0, 0);

      // 3. Auto-Trim (Recorte Justo ao Bounding Box)
      let finalCanvas = canvas;
      if (autoTrim) {
        finalCanvas = autoTrimCanvas(canvas, 15, 2);
      }

      resolve({
        url: finalCanvas.toDataURL('image/png'),
        width: finalCanvas.width,
        height: finalCanvas.height,
      });
    };

    img.onerror = () => {
      reject(new Error('Falha ao processar imagem para remoção de fundo'));
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else if (imageSource instanceof File || imageSource instanceof Blob) {
      img.src = URL.createObjectURL(imageSource);
    } else if (imageSource instanceof Image) {
      img.src = imageSource.src;
    }
  });
}

/**
 * Remove o fundo com IA ou Matting Contíguo Externo e Auto-Trim de alta precisão
 */
export async function removeImageBackground(
  imageSource: string | File | Blob,
  options?: RemoveBackgroundOptions
): Promise<ProcessedImageResult> {
  const mode = options?.mode || 'auto';
  const autoTrim = options?.autoTrim !== false;

  // Se modo for matting contíguo inteligente
  if (mode === 'smart-solid') {
    return removeSolidBackground(imageSource, options?.tolerance, options?.feather, autoTrim);
  }

  try {
    if (typeof window !== 'undefined' && mode === 'ai') {
      // @ts-ignore
      const imgly = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
      if (imgly && imgly.removeBackground) {
        const blob = await imgly.removeBackground(imageSource, {
          model: 'small',
          output: {
            format: 'image/png',
            quality: 1.0,
          },
        });

        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const rawUrl = reader.result as string;
            if (autoTrim) {
              const testImg = new Image();
              testImg.onload = () => {
                const c = document.createElement('canvas');
                c.width = testImg.naturalWidth;
                c.height = testImg.naturalHeight;
                const cCtx = c.getContext('2d');
                if (cCtx) {
                  cCtx.drawImage(testImg, 0, 0);
                  const trimmed = autoTrimCanvas(c, 15, 2);
                  resolve({
                    url: trimmed.toDataURL('image/png'),
                    width: trimmed.width,
                    height: trimmed.height,
                  });
                  return;
                }
                resolve({ url: rawUrl, width: testImg.naturalWidth, height: testImg.naturalHeight });
              };
              testImg.src = rawUrl;
            } else {
              resolve({ url: rawUrl, width: 300, height: 300 });
            }
          };
          reader.readAsDataURL(blob);
        });
      }
    }
  } catch (err) {
    console.warn('Fallback para remoção contígua de alta precisão:', err);
  }

  // Executa remoção contígua externa com Auto-Trim
  return removeSolidBackground(imageSource, options?.tolerance, options?.feather, autoTrim);
}
