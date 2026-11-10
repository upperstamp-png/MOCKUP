'use client';

import { useEffect, useState } from 'react';

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

const API_BASE = (process.env.NEXT_PUBLIC_PORTAL_API_BASE || '/api/v1').replace(/\/+$/, '');

function normalizeBasePath(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === '/') return '';
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
}

export const HUB_BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_HUB_BASE_PATH);

export function getActiveHubBasePath(): string {
  return HUB_BASE_PATH;
}

export function isUnifiedSubpathHost(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  if (HUB_BASE_PATH === '/hub') return true;
  const host = (window.location.hostname || '').toLowerCase();
  if (
    host.startsWith('app.') ||
    host.startsWith('hub.') ||
    host.startsWith('lp.') ||
    host.startsWith('crm.')
  ) {
    return false;
  }
  const pathname = window.location.pathname || '';
  if (pathname === '/hub' || pathname.startsWith('/hub/')) {
    return true;
  }
  const port = window.location.port || '';
  const isLocalGateway =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  return isLocalGateway ? port !== '3333' : Boolean(port && port !== '3333');
}

export function useUnifiedHubPrefix(): '' | '/hub' {
  const [prefix, setPrefix] = useState<'' | '/hub'>(() =>
    HUB_BASE_PATH === '/hub' ? '/hub' : ''
  );

  useEffect(() => {
    setPrefix(isUnifiedSubpathHost() ? '/hub' : '');
  }, []);

  return prefix;
}

export function hubHomePath(query?: string): string {
  const cleanQuery = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return hubPath(`/${cleanQuery}`);
}

export function hubAdminHref(prefix?: '' | '/hub'): string {
  const effective =
    typeof prefix === 'string' ? prefix : isUnifiedSubpathHost() ? '/hub' : '';
  return effective ? `${effective}/admin` : '/admin';
}

function stripLeadingHubPrefix(pathname: string): string {
  if (pathname === '/hub') return '/';
  if (pathname.startsWith('/hub/')) return pathname.slice(4);
  return pathname;
}

export function hubPath(subPath = '/'): string {
  const raw = (subPath || '/').trim();
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }

  const configuredBase = getActiveHubBasePath();
  const effectiveBase = configuredBase || (isUnifiedSubpathHost() ? '/hub' : '');

  const match = raw.match(/^([^?#]*)(.*)$/);
  const rawPath = match ? match[1] : raw;
  const suffix = match ? match[2] : '';

  const normalizedLeading = rawPath
    ? rawPath.startsWith('/')
      ? rawPath
      : `/${rawPath}`
    : '/';
  const cleanPath = stripLeadingHubPrefix(normalizedLeading);

  if (!effectiveBase) {
    return `${cleanPath}${suffix}`;
  }
  if (cleanPath === '/') {
    return `${effectiveBase}${suffix}`;
  }
  return `${effectiveBase}${cleanPath}${suffix}`;
}

export function hubPublicUrl(subPath = '/'): string {
  const targetPath = hubPath(subPath);
  if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
    return targetPath;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${targetPath}`;
  }
  return targetPath;
}

export function hubAsset(assetPath: string): string {
  if (!assetPath) return assetPath;
  const trimmed = assetPath.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('<')
  ) {
    return assetPath;
  }

  const activeBase = getActiveHubBasePath();
  const normalizedLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const cleanPath = stripLeadingHubPrefix(normalizedLeading);

  if (!activeBase) {
    return cleanPath;
  }
  return cleanPath === '/' ? activeBase : `${activeBase}${cleanPath}`;
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
