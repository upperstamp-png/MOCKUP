import crypto from 'node:crypto';
import { supabaseAdmin } from '../../plugins/supabase.js';
import type {
  LicenseValidateRequest,
  LicenseValidateResponse,
  LicenseStatusResponse,
  RevokeDeviceResponse,
  License,
  Tenant,
  Device,
} from '@mockup/types';

export class LicensingService {
  /**
   * Gera hash SHA-256 consistente para chaves seriais
   */
  public static hashSerialKey(serialKey: string): string {
    return crypto.createHash('sha256').update(serialKey.trim()).digest('hex');
  }

  /**
   * Valida chave de licença, limites de dispositivo e gera token JWT
   */
  public async validateLicense(
    data: LicenseValidateRequest,
    ipAddress?: string,
    jwtSigner?: (payload: object) => string
  ): Promise<LicenseValidateResponse> {
    const serialHash = LicensingService.hashSerialKey(data.serialKey);

    // 1. Busca licença pelo Hash
    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('*, tenant:tenants(*)')
      .eq('serial_key_hash', serialHash)
      .single();

    if (licenseError || !license) {
      // Registra tentativa com falha no log de auditoria
      await this.logAudit({
        actor_type: 'system',
        action: 'LICENSE_VALIDATION_FAILED',
        details: { reason: 'SERIAL_NOT_FOUND', prefix: data.serialKey.substring(0, 8) },
        ip_address: ipAddress,
      });

      const err = new Error('Chave de licença não encontrada ou inválida');
      (err as unknown as { statusCode: number; code: string }).statusCode = 404;
      (err as unknown as { statusCode: number; code: string }).code = 'LICENSE_NOT_FOUND';
      throw err;
    }

    const typedLicense = license as unknown as License & { tenant: Tenant };

    // 2. Valida Status da Licença
    if (typedLicense.status === 'blocked') {
      const err = new Error('Esta licença está bloqueada administrativamente');
      (err as unknown as { statusCode: number; code: string }).statusCode = 403;
      (err as unknown as { statusCode: number; code: string }).code = 'LICENSE_BLOCKED';
      throw err;
    }

    // 3. Valida Data de Expiração
    if (new Date(typedLicense.expires_at) < new Date()) {
      // Atualiza status se expirada
      await supabaseAdmin.from('licenses').update({ status: 'expired' }).eq('id', typedLicense.id);
      const err = new Error('A licença informada expirou');
      (err as unknown as { statusCode: number; code: string }).statusCode = 403;
      (err as unknown as { statusCode: number; code: string }).code = 'LICENSE_EXPIRED';
      throw err;
    }

    // 4. Valida Tenant Associado
    if (!typedLicense.tenant || typedLicense.tenant.status !== 'active') {
      const err = new Error('A empresa/tenant vinculada a esta licença está inativa');
      (err as unknown as { statusCode: number; code: string }).statusCode = 403;
      (err as unknown as { statusCode: number; code: string }).code = 'TENANT_INACTIVE';
      throw err;
    }

    // 5. Verifica Dispositivos Registrados
    const { data: existingDevices } = await supabaseAdmin
      .from('devices')
      .select('*')
      .eq('license_id', typedLicense.id)
      .eq('is_active', true);

    const activeDevices = (existingDevices || []) as Device[];
    const currentDevice = activeDevices.find((d) => d.fingerprint_hash === data.deviceFingerprint);

    let deviceRecord: Device;

    if (currentDevice) {
      // Dispositivo já registrado: atualiza last_login e IP
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('devices')
        .update({
          last_login: new Date().toISOString(),
          ip_address: ipAddress,
          user_agent: data.fingerprintDetails?.userAgent,
        })
        .eq('id', currentDevice.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      deviceRecord = updated as Device;
    } else {
      // Novo dispositivo tentando ativação: verifica limite de licença
      if (activeDevices.length >= typedLicense.max_devices) {
        await this.logAudit({
          tenant_id: typedLicense.tenant_id,
          actor_type: 'device',
          action: 'DEVICE_LIMIT_REACHED',
          details: {
            licenseId: typedLicense.id,
            maxDevices: typedLicense.max_devices,
            activeCount: activeDevices.length,
          },
          ip_address: ipAddress,
        });

        const err = new Error(
          `Limite de dispositivos ativos atingido (${activeDevices.length}/${typedLicense.max_devices}). Revogue um dispositivo existente no painel.`
        );
        (err as unknown as { statusCode: number; code: string }).statusCode = 409;
        (err as unknown as { statusCode: number; code: string }).code = 'DEVICE_LIMIT_EXCEEDED';
        throw err;
      }

      // Registra novo dispositivo
      const { data: createdDevice, error: createErr } = await supabaseAdmin
        .from('devices')
        .insert({
          license_id: typedLicense.id,
          tenant_id: typedLicense.tenant_id,
          fingerprint_hash: data.deviceFingerprint,
          device_name: data.deviceName || 'Web Browser',
          user_agent: data.fingerprintDetails?.userAgent,
          ip_address: ipAddress,
          is_active: true,
          last_login: new Date().toISOString(),
        })
        .select()
        .single();

      if (createErr) throw createErr;
      deviceRecord = createdDevice as Device;
    }

    // 6. Registra Auditoria de Sucesso
    await this.logAudit({
      tenant_id: typedLicense.tenant_id,
      actor_type: 'device',
      actor_id: deviceRecord.id,
      action: 'DEVICE_AUTHENTICATED',
      details: {
        licenseId: typedLicense.id,
        deviceName: deviceRecord.device_name,
      },
      ip_address: ipAddress,
    });

    // 7. Gera JWT
    const token = jwtSigner
      ? jwtSigner({
          sub: deviceRecord.id,
          tenantId: typedLicense.tenant_id,
          licenseId: typedLicense.id,
          deviceId: deviceRecord.id,
          role: 'seller',
          permissions: ['mockup:create', 'mockup:export', 'patterns:read', 'models:read'],
        })
      : '';

    return {
      valid: true,
      token,
      tenant: {
        id: typedLicense.tenant.id,
        name: typedLicense.tenant.name,
        cnpj: typedLicense.tenant.cnpj,
      },
      license: {
        id: typedLicense.id,
        status: typedLicense.status,
        expiresAt: typedLicense.expires_at,
        maxDevices: typedLicense.max_devices,
        activeDevicesCount: activeDevices.length + (currentDevice ? 0 : 1),
      },
      device: {
        id: deviceRecord.id,
        name: deviceRecord.device_name,
        registeredAt: deviceRecord.created_at,
      },
    };
  }

  /**
   * Revoga a ativação de um dispositivo
   */
  public async revokeDevice(
    deviceId: string,
    tenantId: string,
    actorId?: string,
    ipAddress?: string
  ): Promise<RevokeDeviceResponse> {
    const { data: device, error: findError } = await supabaseAdmin
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .eq('tenant_id', tenantId)
      .single();

    if (findError || !device) {
      const err = new Error('Dispositivo não encontrado ou não pertence a este tenant');
      (err as unknown as { statusCode: number; code: string }).statusCode = 404;
      (err as unknown as { statusCode: number; code: string }).code = 'DEVICE_NOT_FOUND';
      throw err;
    }

    const { error: updateError } = await supabaseAdmin
      .from('devices')
      .update({ is_active: false })
      .eq('id', deviceId);

    if (updateError) throw updateError;

    await this.logAudit({
      tenant_id: tenantId,
      actor_type: 'seller',
      actor_id: actorId,
      action: 'DEVICE_REVOKED',
      details: { revokedDeviceId: deviceId },
      ip_address: ipAddress,
    });

    return {
      success: true,
      message: 'Dispositivo revogado com sucesso.',
      revokedDeviceId: deviceId,
    };
  }

  /**
   * Obtém o status da licença do tenant autenticado
   */
  public async getLicenseStatus(
    tenantId: string,
    licenseId: string,
    currentDeviceId: string
  ): Promise<LicenseStatusResponse> {
    const { data: license, error } = await supabaseAdmin
      .from('licenses')
      .select('*, tenant:tenants(*), devices:devices(*)')
      .eq('id', licenseId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !license) {
      const err = new Error('Licença não encontrada');
      (err as unknown as { statusCode: number; code: string }).statusCode = 404;
      (err as unknown as { statusCode: number; code: string }).code = 'LICENSE_NOT_FOUND';
      throw err;
    }

    const typedLicense = license as unknown as License & {
      tenant: Tenant;
      devices: Device[];
    };
    const activeDevices = (typedLicense.devices || []).filter((d: Device) => d.is_active);

    return {
      valid: typedLicense.status === 'active' && new Date(typedLicense.expires_at) > new Date(),
      status: typedLicense.status,
      expiresAt: typedLicense.expires_at,
      tenantId: typedLicense.tenant_id,
      tenantName: typedLicense.tenant.name,
      maxDevices: typedLicense.max_devices,
      activeDevicesCount: activeDevices.length,
      currentDeviceId,
    };
  }

  /**
   * Registra eventos na tabela de auditoria
   */
  private async logAudit(payload: {
    tenant_id?: string;
    actor_type: string;
    actor_id?: string;
    action: string;
    details?: Record<string, unknown>;
    ip_address?: string;
  }): Promise<void> {
    try {
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: payload.tenant_id || null,
        actor_type: payload.actor_type,
        actor_id: payload.actor_id || null,
        action: payload.action,
        details: payload.details || {},
        ip_address: payload.ip_address || null,
      });
    } catch {
      // Ignora erro de auditoria para não interromper fluxo crítico
    }
  }
}

export const licensingService = new LicensingService();
