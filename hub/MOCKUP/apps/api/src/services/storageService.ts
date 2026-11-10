import crypto from 'node:crypto';
import { supabaseAdmin } from '../plugins/supabase.js';

export type PortalBucket =
  | 'portal-art-files'
  | 'portal-documents'
  | 'portal-ticket-attachments'
  | 'portal-receipts'
  | 'portal-sandbox';

const BUCKET_RULES: Record<
  PortalBucket,
  { maxBytes: number; allowedMimes: string[] }
> = {
  'portal-art-files': {
    maxBytes: 50 * 1024 * 1024,
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'],
  },
  'portal-documents': {
    maxBytes: 25 * 1024 * 1024,
    allowedMimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  },
  'portal-ticket-attachments': {
    maxBytes: 25 * 1024 * 1024,
    allowedMimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4'],
  },
  'portal-receipts': {
    maxBytes: 15 * 1024 * 1024,
    allowedMimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  },
  'portal-sandbox': {
    maxBytes: 100 * 1024 * 1024,
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'],
  },
};

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return base.slice(0, 120) || 'arquivo';
}

export function parseDataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string; ext: string } | null {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?(?:;(base64))?,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return {
    buffer,
    mimeType,
    ext: extMap[mimeType] || 'bin',
  };
}

export async function uploadPrivatePortalFile(params: {
  bucket: PortalBucket;
  unitId: string | null; // NULL apenas para arquivos de modelo compartilhado da rede
  folder: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ storageBucket: PortalBucket; storagePath: string; fileName: string; mimeType: string; sizeBytes: number }> {
  const rule = BUCKET_RULES[params.bucket];
  if (!rule) {
    throw new Error(`Bucket inválido: ${params.bucket}`);
  }
  const normalizedMime = params.mimeType.split(';')[0].trim().toLowerCase();
  if (!rule.allowedMimes.includes(normalizedMime)) {
    throw new Error(
      `Tipo de arquivo '${normalizedMime}' não permitido no bucket '${params.bucket}'. Aceitos: ${rule.allowedMimes.join(', ')}`
    );
  }
  if (params.buffer.byteLength <= 0 || params.buffer.byteLength > rule.maxBytes) {
    throw new Error(
      `Tamanho de arquivo inválido (${params.buffer.byteLength} bytes). Limite máximo: ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`
    );
  }

  const safeName = sanitizeFilename(params.fileName);
  const safeFolder = params.folder.replace(/[^a-zA-Z0-9/_-]/g, '_').replace(/^\/+|\/+$/g, '');
  const prefix = params.unitId ? params.unitId : 'shared-network';
  const uniquePrefix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const storagePath = `${prefix}/${safeFolder}/${uniquePrefix}_${safeName}`;

  const { error } = await supabaseAdmin.storage
    .from(params.bucket)
    .upload(storagePath, params.buffer, {
      contentType: normalizedMime,
      upsert: false,
    });

  if (error) {
    throw new Error(`Falha ao gravar arquivo no Supabase Storage (${params.bucket}): ${error.message}`);
  }

  return {
    storageBucket: params.bucket,
    storagePath,
    fileName: safeName,
    mimeType: normalizedMime,
    sizeBytes: params.buffer.byteLength,
  };
}

export async function createAuthorizedSignedUrl(params: {
  bucket: PortalBucket;
  storagePath: string;
  authorizedUnitId: string;
  allowNetworkScope?: boolean;
  expiresInSeconds?: number;
}): Promise<string> {
  const cleanPath = params.storagePath.replace(/^\/+/, '');
  const isSharedDoc = params.bucket === 'portal-documents' && cleanPath.startsWith('shared-network/');
  const isOwnUnitPath = cleanPath.startsWith(`${params.authorizedUnitId}/`);

  if (!params.allowNetworkScope && !isOwnUnitPath && !isSharedDoc) {
    throw new Error('FORBIDDEN_STORAGE_PATH');
  }

  const { data, error } = await supabaseAdmin.storage
    .from(params.bucket)
    .createSignedUrl(cleanPath, params.expiresInSeconds ?? 300);

  if (error || !data?.signedUrl) {
    throw new Error(`Não foi possível gerar URL assinada: ${error?.message || 'arquivo indisponível'}`);
  }

  return data.signedUrl;
}
