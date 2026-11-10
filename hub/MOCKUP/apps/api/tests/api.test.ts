import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LicensingService } from '../dist/modules/licensing/licensing.service.js';
import { shouldApplyWatermark } from '../dist/modules/exports/server-renderer.js';
import {
  licenseValidateSchema,
  createTenantSchema,
  layerStateSchema,
  serverExportSchema,
  heartbeatSchema,
  billingWebhookSchema,
} from '@mockup/validation';

describe('Fastify API, Licensing & SaaS Engine - Testes Unitários', () => {
  it('deve gerar hash SHA-256 determinístico para a mesma chave serial', () => {
    const key = 'MOCK-PRO-2026-DEV01';
    const hash1 = LicensingService.hashSerialKey(key);
    const hash2 = LicensingService.hashSerialKey(key);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it('deve aplicar watermark corretamente para tenants em trial ou expirados', () => {
    // Trial deve ter watermark
    assert.strictEqual(
      shouldApplyWatermark({
        tenantStatus: 'active',
        licenseStatus: 'active',
        licenseExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        isTrial: true,
      }),
      true
    );

    // Licença expirada deve ter watermark
    assert.strictEqual(
      shouldApplyWatermark({
        tenantStatus: 'active',
        licenseStatus: 'active',
        licenseExpiresAt: new Date(Date.now() - 86400000).toISOString(),
        isTrial: false,
      }),
      true
    );

    // Tenant ativo e com licença válida não deve ter watermark
    assert.strictEqual(
      shouldApplyWatermark({
        tenantStatus: 'active',
        licenseStatus: 'active',
        licenseExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        isTrial: false,
      }),
      false
    );
  });

  it('deve validar schema de LayerState e exportação server-side', () => {
    const validLayerState = {
      version: 1,
      modelId: 'model_soccer',
      colorA: '#0f172a',
      colorB: '#38bdf8',
      view: 'front' as const,
      elements: [
        {
          id: 'num_10',
          type: 'number' as const,
          x: 0.5,
          y: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          visible: true,
          view: 'front' as const,
          zIndex: 1,
          text: '10',
          fontFamily: 'Impact',
          fontSize: 100,
          fontWeight: 'bold',
          letterSpacing: 0,
          color: '#ffffff',
        },
      ],
      clientName: 'Grêmio FC',
    };

    const parsed = layerStateSchema.safeParse(validLayerState);
    assert.strictEqual(parsed.success, true);

    const exportParsed = serverExportSchema.safeParse({
      modelId: 'model_soccer',
      layerState: validLayerState,
      clientName: 'Grêmio FC',
    });
    assert.strictEqual(exportParsed.success, true);
  });

  it('deve validar payload de heartbeat e webhook de billing', () => {
    const validHeartbeat = heartbeatSchema.safeParse({
      sessionToken: 'session_token_1234567890',
      deviceLabel: 'Terminal Vendas 01',
    });
    assert.strictEqual(validHeartbeat.success, true);

    const validWebhook = billingWebhookSchema.safeParse({
      event: 'payment_confirmed',
      tenantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      externalSubscriptionId: 'sub_12345',
      timestamp: new Date().toISOString(),
      signature: 'sha256_signature_hex',
    });
    assert.strictEqual(validWebhook.success, true);
  });

  it('deve validar schema de ativação de licença com sucesso', () => {
    const validPayload = {
      serialKey: 'MOCK-PRO-2026-DEV01',
      deviceFingerprint: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      deviceName: 'Terminal Caixa 01',
    };

    const result = licenseValidateSchema.safeParse(validPayload);
    assert.strictEqual(result.success, true);
  });

  it('deve validar criação de tenant com CNPJ válido', () => {
    const tenantPayload = {
      name: 'Fábrica Confecções Têxteis Ltda',
      cnpj: '12.345.678/0001-90',
      status: 'active' as const,
    };

    const result = createTenantSchema.safeParse(tenantPayload);
    assert.strictEqual(result.success, true);
  });
});
