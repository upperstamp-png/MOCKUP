/**
 * @file texture-manager.ts
 * @description Gerenciador centralizado de texturas, máscaras de tecido e estampas adicionadas no Admin
 */

export interface UniformTexture {
  id: string;
  name: string;
  category: 'mask_part' | 'fabric_texture' | 'pattern';
  url: string;
  thumbnailUrl?: string;
  targetPart?: string; // 'all' | 'front' | 'back' | 'sleeves' | 'collar' | 'custom'
  blendMode?: 'normal' | 'multiply' | 'overlay' | 'soft-light';
  opacity?: number;
  createdAt: string;
}

export const DEFAULT_UNIFORM_TEXTURES: UniformTexture[] = [
  {
    id: 'tex_dryfit_micro',
    name: 'Dry-Fit Esportivo Microfurado',
    category: 'fabric_texture',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="5" cy="5" r="1.5" fill="%23000000" opacity="0.12"/><circle cx="15" cy="15" r="1.5" fill="%23000000" opacity="0.12"/></svg>',
    targetPart: 'all',
    blendMode: 'multiply',
    opacity: 0.75,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tex_piquet_sport',
    name: 'Piquet Texturizado Favo',
    category: 'fabric_texture',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M0 0 L8 8 L16 0 L8 8 L0 16" fill="none" stroke="%23000000" stroke-width="0.8" opacity="0.08"/></svg>',
    targetPart: 'all',
    blendMode: 'multiply',
    opacity: 0.65,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tex_stripes_sublimated',
    name: 'Listras Verticais Esportivas',
    category: 'pattern',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="0" y="0" width="20" height="40" fill="%23000000" opacity="0.1"/><rect x="20" y="0" width="20" height="40" fill="%23ffffff" opacity="0.05"/></svg>',
    targetPart: 'front',
    blendMode: 'overlay',
    opacity: 0.85,
    createdAt: new Date().toISOString(),
  },
];

const STORAGE_KEY = 'mockup_admin_uniform_textures';

export function getCustomUniformTextures(): UniformTexture[] {
  if (typeof window === 'undefined') return DEFAULT_UNIFORM_TEXTURES;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_UNIFORM_TEXTURES));
      return DEFAULT_UNIFORM_TEXTURES;
    }
    return JSON.parse(saved);
  } catch {
    return DEFAULT_UNIFORM_TEXTURES;
  }
}

export function saveCustomUniformTexture(texture: UniformTexture): UniformTexture[] {
  if (typeof window === 'undefined') return DEFAULT_UNIFORM_TEXTURES;
  const current = getCustomUniformTextures();
  const updated = [texture, ...current.filter((t) => t.id !== texture.id)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Erro ao salvar textura:', err);
  }
  return updated;
}

export function deleteCustomUniformTexture(id: string): UniformTexture[] {
  if (typeof window === 'undefined') return DEFAULT_UNIFORM_TEXTURES;
  const current = getCustomUniformTextures();
  const updated = current.filter((t) => t.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Erro ao excluir textura:', err);
  }
  return updated;
}
