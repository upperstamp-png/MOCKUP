/**
 * @file cache.ts
 * @description Gerenciamento de cache de imagens, SVGs processados e ImageBitmaps para máxima performance
 */

class AssetCache {
  private imageCache = new Map<string, HTMLImageElement>();
  private bitmapCache = new Map<string, ImageBitmap>();
  private pendingPromises = new Map<string, Promise<HTMLImageElement>>();

  /**
   * Carrega uma imagem a partir de uma URL (com cache em memória)
   */
  public async loadImage(url: string, crossOrigin: boolean = true): Promise<HTMLImageElement> {
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url)!;
    }

    if (this.pendingPromises.has(url)) {
      return this.pendingPromises.get(url)!;
    }

    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        this.imageCache.set(url, img);
        this.pendingPromises.delete(url);
        resolve(img);
      };
      img.onerror = (err) => {
        this.pendingPromises.delete(url);
        reject(new Error(`Falha ao carregar imagem em [${url}]: ${err}`));
      };
      img.src = url;
    });

    this.pendingPromises.set(url, loadPromise);
    return loadPromise;
  }

  /**
   * Carrega e converte imagem para ImageBitmap (se suportado pelo navegador)
   */
  public async loadBitmap(url: string): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'undefined') {
      return this.loadImage(url);
    }

    if (this.bitmapCache.has(url)) {
      return this.bitmapCache.get(url)!;
    }

    try {
      const img = await this.loadImage(url);
      const bitmap = await createImageBitmap(img);
      this.bitmapCache.set(url, bitmap);
      return bitmap;
    } catch {
      // Fallback para HTMLImageElement se bitmap falhar
      return this.loadImage(url);
    }
  }

  /**
   * Limpa todo o cache de assets
   */
  public clear(): void {
    this.bitmapCache.forEach((bitmap) => {
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
    });
    this.bitmapCache.clear();
    this.imageCache.clear();
    this.pendingPromises.clear();
  }
}

export const assetCache = new AssetCache();
