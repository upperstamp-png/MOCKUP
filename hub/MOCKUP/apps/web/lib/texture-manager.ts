/**
 * @file texture-manager.ts
 * @description Gerenciador centralizado de estampas sublimadas e padrões visuais (PNG, JPG, WebP, SVG)
 */

export interface UniformPattern {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  targetPart?: string; // 'all' | 'front' | 'back' | 'sleeves'
  createdAt: string;
}

export const DEFAULT_UNIFORM_PATTERNS: UniformPattern[] = [
  {
    id: 'pat_stripes',
    name: 'Listras Tradicionais',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect width="60" height="60" fill="%23000000"/><rect x="0" y="0" width="30" height="60" fill="%23ffffff"/></svg>',
    targetPart: 'front',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pat_thunder',
    name: 'Thunder Esportivo',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800"><rect width="800" height="800" fill="%23000000"/><polygon points="0,0 400,0 200,800 0,800" fill="%23ffffff" fill-opacity="0.9"/><polygon points="450,0 800,0 600,800 250,800" fill="%23ffffff" fill-opacity="0.6"/><polygon points="650,0 800,0 800,800 700,800" fill="%23ffffff" fill-opacity="0.3"/></svg>',
    targetPart: 'front',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pat_chevron',
    name: 'Chevron / V-Shape',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" fill="%23000000"/><path d="M0 100 L200 200 L400 100 L400 160 L200 260 L0 160 Z" fill="%23ffffff"/><path d="M0 220 L200 320 L400 220 L400 280 L200 380 L0 280 Z" fill="%23ffffff" opacity="0.6"/></svg>',
    targetPart: 'front',
    createdAt: new Date().toISOString(),
  },
];

const STORAGE_KEY = 'mockup_admin_uniform_patterns';

export function getCustomUniformPatterns(): UniformPattern[] {
  if (typeof window === 'undefined') return DEFAULT_UNIFORM_PATTERNS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_UNIFORM_PATTERNS));
      return DEFAULT_UNIFORM_PATTERNS;
    }
    return JSON.parse(saved);
  } catch {
    return DEFAULT_UNIFORM_PATTERNS;
  }
}

export function saveCustomUniformPattern(pattern: UniformPattern): UniformPattern[] {
  if (typeof window === 'undefined') return DEFAULT_UNIFORM_PATTERNS;
  const current = getCustomUniformPatterns();
  const updated = [pattern, ...current.filter((p) => p.id !== pattern.id)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Erro ao salvar estampa:', err);
  }
  return updated;
}

export function deleteCustomUniformPattern(id: string): UniformPattern[] {
  if (typeof window === 'undefined') return DEFAULT_UNIFORM_PATTERNS;
  const current = getCustomUniformPatterns();
  const updated = current.filter((p) => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Erro ao excluir estampa:', err);
  }
  return updated;
}
