'use client';

export class PortalApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code = 'PORTAL_API_ERROR', details?: unknown) {
    super(message);
    this.name = 'PortalApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const API_BASE = '/api/v1';

export const HUB_BASE_PATH = '/hub';

export function hubAsset(assetPath: string): string {
  if (!assetPath) return assetPath;
  if (
    assetPath.startsWith('http://') ||
    assetPath.startsWith('https://') ||
    assetPath.startsWith('data:') ||
    assetPath.startsWith('blob:') ||
    assetPath.startsWith(`${HUB_BASE_PATH}/`) ||
    assetPath === HUB_BASE_PATH
  ) {
    return assetPath;
  }
  const normalized = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${HUB_BASE_PATH}${normalized}`;
}

export async function portalFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { message: await response.text().catch(() => 'Erro inesperado') };

  if (!response.ok) {
    throw new PortalApiError(
      data.message || `Erro HTTP ${response.status}`,
      response.status,
      data.code || 'API_ERROR',
      data.details ?? data.releaseGate ?? data
    );
  }

  return data as T;
}

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatBrl(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined || cents === '') return 'Não configurado';
  return brlFormatter.format(Number(cents) / 100);
}

export function formatDateBr(
  value: string | null | undefined,
  options?: { withTime?: boolean; timeZone?: string }
): string {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T12:00:00Z` : value;
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('pt-BR', {
    timeZone: options?.timeZone || 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(options?.withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export async function fileToDataUrl(file: File): Promise<{ fileName: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve({ fileName: file.name, dataUrl: reader.result });
      } else {
        reject(new Error('Falha ao ler arquivo selecionado.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao processar arquivo.'));
    reader.readAsDataURL(file);
  });
}

// Compatibilidade enxuta caso componentes legados do Studio ainda importem apiClient
export const apiClient = {
  async listExports() {
    return portalFetch<{ items: unknown[] }>('/arts');
  },
};
