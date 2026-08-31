/**
 * @file api-client.ts
 * @description Cliente HTTP tipado para comunicação com a Fastify Backend API
 */

import {
  LicenseValidateRequest,
  LicenseValidateResponse,
  LicenseStatusResponse,
  RevokeDeviceResponse,
  MockupExport,
} from '@mockup/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('mockup_auth_token');
    }
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('mockup_auth_token', token);
      } else {
        localStorage.removeItem('mockup_auth_token');
      }
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Erro na requisição');
      (error as unknown as { statusCode: number; code: string; details: unknown }).statusCode = response.status;
      (error as unknown as { statusCode: number; code: string; details: unknown }).code = data.code || 'UNKNOWN_ERROR';
      (error as unknown as { statusCode: number; code: string; details: unknown }).details = data.details;
      throw error;
    }

    return data as T;
  }

  /**
   * Valida licença e registra/autentica dispositivo
   */
  public async validateLicense(payload: LicenseValidateRequest): Promise<LicenseValidateResponse> {
    const res = await this.request<LicenseValidateResponse>('/license/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  /**
   * Consulta status da licença
   */
  public async getLicenseStatus(): Promise<LicenseStatusResponse> {
    return this.request<LicenseStatusResponse>('/license/status');
  }

  /**
   * Revoga dispositivo
   */
  public async revokeDevice(deviceId: string): Promise<RevokeDeviceResponse> {
    return this.request<RevokeDeviceResponse>('/license/revoke-device', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
  }

  /**
   * Salva registro histórico de exportação
   */
  public async createExportRecord(payload: {
    clientName: string;
    frontPngUrl: string;
    backPngUrl: string;
    salesBoardUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<MockupExport> {
    return this.request<MockupExport>('/exports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Lista histórico de exportações
   */
  public async listExports(): Promise<{ exports: MockupExport[] }> {
    return this.request<{ exports: MockupExport[] }>('/exports');
  }
}

export const apiClient = new ApiClient();
