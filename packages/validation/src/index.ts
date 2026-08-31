import { z } from 'zod';

// ==========================================
// 1. SCHEMAS DE ELEMENTOS & LAYER STATE
// ==========================================

export const baseElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['logo', 'text', 'number']),
  x: z.number(),
  y: z.number(),
  scaleX: z.number().positive(),
  scaleY: z.number().positive(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  view: z.enum(['front', 'back']),
  zIndex: z.number().int(),
});

export const logoElementSchema = baseElementSchema.extend({
  type: z.literal('logo'),
  url: z.string().url('URL da logo deve ser válida'),
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive(),
  aspectRatio: z.number().positive(),
});

export const textElementSchema = baseElementSchema.extend({
  type: z.literal('text'),
  text: z.string().min(1, 'Texto não pode estar vazio').max(100),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(8).max(500),
  fontWeight: z.union([z.string(), z.number()]),
  letterSpacing: z.number(),
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Cor hexadecimal inválida'),
  align: z.enum(['left', 'center', 'right']),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().min(0).max(50).optional(),
});

export const numberElementSchema = baseElementSchema.extend({
  type: z.literal('number'),
  text: z.string().min(1).max(4, 'Número esportivo deve ter até 4 dígitos'),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(10).max(800),
  fontWeight: z.union([z.string(), z.number()]),
  letterSpacing: z.number(),
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Cor hexadecimal inválida'),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().min(0).max(50).optional(),
});

export const mockupElementSchema = z.discriminatedUnion('type', [
  logoElementSchema,
  textElementSchema,
  numberElementSchema,
]);

export const layerStateSchema = z.object({
  version: z.number().int().default(1),
  modelId: z.string().min(1),
  patternId: z.string().nullable().optional(),
  colorA: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/),
  colorB: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/),
  elements: z.array(mockupElementSchema),
  view: z.enum(['front', 'back']).default('front'),
  selectedElementId: z.string().nullable().optional(),
  clientName: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  updatedAt: z.string().datetime().optional().default(() => new Date().toISOString()),
});

// ==========================================
// 2. SERVER EXPORT SCHEMA
// ==========================================

export const serverExportSchema = z.object({
  modelId: z.string().min(1),
  layerState: layerStateSchema,
  clientName: z.string().trim().max(120).default('Cliente'),
  format: z.enum(['png', 'jpeg']).default('png'),
  width: z.number().int().min(500).max(4000).default(2000),
  height: z.number().int().min(500).max(4000).default(2000),
});

// ==========================================
// 3. SESSÕES, HEARTBEAT & AUTENTICAÇÃO
// ==========================================

export const heartbeatSchema = z.object({
  sessionToken: z.string().min(16),
  deviceLabel: z.string().max(150).optional(),
});

export const terminateSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const createSellerSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(150),
  role: z.enum(['tenant_admin', 'seller']).default('seller'),
  password: z.string().min(6).optional(),
});

export const userLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  deviceLabel: z.string().max(150).optional(),
});

// ==========================================
// 4. BILLING & WEBHOOKS
// ==========================================

export const billingWebhookSchema = z.object({
  event: z.enum(['payment_confirmed', 'payment_failed', 'subscription_renewed', 'subscription_canceled']),
  tenantId: z.string().uuid(),
  externalSubscriptionId: z.string().min(1),
  timestamp: z.string(),
  signature: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

// ==========================================
// 5. LEGACY LICENSE & ADMIN SCHEMAS
// ==========================================

export const licenseValidateSchema = z.object({
  serialKey: z.string().trim().min(10).max(64),
  deviceFingerprint: z.string().trim().min(16).max(128).optional(),
  deviceName: z.string().trim().max(100).optional(),
});

export const revokeDeviceSchema = z.object({
  deviceId: z.string().uuid(),
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(3).max(150),
  cnpj: z.string().trim(),
  status: z.enum(['active', 'blocked', 'expired']).default('active'),
});

export const createLicenseSchema = z.object({
  tenantId: z.string().uuid(),
  maxDevices: z.number().int().min(1).max(1000).default(3),
  expiresAt: z.string().datetime(),
  status: z.enum(['active', 'blocked', 'expired']).default('active'),
});

export const createApparelModelSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(100),
  category: z.enum(['futebol', 'basquete', 'polo', 'camiseta', 'bone', 'moletom', 'outros']),
  frontShadowUrl: z.string().url(),
  backShadowUrl: z.string().url(),
  maskUrl: z.string().url(),
  maskBackUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url(),
});

export const createPatternSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  svgFileUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
});
