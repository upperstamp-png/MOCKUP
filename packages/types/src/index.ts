/**
 * @file index.ts
 * @description Tipos TypeScript compartilhados para o ecossistema B2B TexCraft QuickMockup
 */

// ==========================================
// 1. ENUMS & CONSTANTES DE DOMÍNIO
// ==========================================

export type TenantStatus = 'active' | 'blocked' | 'expired';

export type LicenseStatus = 'active' | 'blocked' | 'expired';

export type SellerRole = 'tenant_admin' | 'seller';

export type SellerStatus = 'active' | 'blocked' | 'invited';

export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ApparelCategory =
  | 'futebol'
  | 'basquete'
  | 'polo'
  | 'camiseta'
  | 'bone'
  | 'moletom'
  | 'outros';

export type MockupView = 'front' | 'back' | 'both';

export type ElementType = 'logo' | 'text' | 'number';

export type TextAlignment = 'left' | 'center' | 'right';

// ==========================================
// 2. ENTIDADES DO BANCO DE DADOS (SUPABASE)
// ==========================================

export interface Tenant {
  id: string;
  name: string;
  cnpj: string;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface License {
  id: string;
  tenant_id: string;
  serial_key_hash: string;
  serial_key_prefix: string; // Ex: MOCK-XXXX-...
  max_devices: number;
  max_active_sessions?: number;
  expires_at: string;
  status: LicenseStatus;
  created_at: string;
  updated_at: string;
}

export interface SellerProfile {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  role: SellerRole;
  status: SellerStatus;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ActiveSession {
  id: string;
  tenant_id: string;
  license_id: string;
  user_id: string;
  device_label: string;
  user_agent?: string;
  ip_address?: string;
  session_token_hash: string;
  last_seen_at: string;
  created_at: string;
  seller?: Partial<SellerProfile>;
}

export interface Device {
  id: string;
  license_id: string;
  tenant_id: string;
  fingerprint_hash: string;
  device_name: string;
  user_agent: string;
  ip_address?: string;
  last_login: string;
  created_at: string;
  is_active: boolean;
}

export interface ApparelModel {
  id: string;
  tenant_id?: string | null; // null se for modelo global do sistema
  title: string;
  category: ApparelCategory;
  front_shadow_url: string;
  back_shadow_url: string;
  mask_url: string;
  mask_back_url?: string;
  background_mask_url?: string;
  front_mask_url?: string;
  back_mask_url?: string;
  sleeve_left_mask_url?: string;
  sleeve_right_mask_url?: string;
  body_mask_url?: string;
  sleeves_mask_url?: string;
  collar_mask_url?: string;
  escudo_mask_url?: string;
  logomarca_frente_mask_url?: string;
  logomarca_costas_mask_url?: string;
  numero_frente_mask_url?: string;
  numero_costas_mask_url?: string;
  nome_costas_acima_mask_url?: string;
  nome_costas_barra_mask_url?: string;
  thumbnail_url: string;
  created_at: string;
  updated_at: string;
}

export type MockupModel = ApparelModel;

export interface Pattern {
  id: string;
  tenant_id?: string | null; // null se for estampa global do sistema
  title: string;
  category: string;
  svg_file_url: string;
  thumbnail_url: string;
  created_at: string;
}

// ==========================================
// 3. LAYER STATE & ESTRUTURA DO EDITOR 2D
// ==========================================

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number; // Posição normalizada (0.0 a 1.0)
  y: number; // Posição normalizada (0.0 a 1.0)
  scaleX: number;
  scaleY: number;
  rotation: number; // Radianos
  opacity: number; // 0.0 a 1.0
  visible: boolean;
  view: MockupView; // 'front' | 'back'
  zIndex: number;
  locked?: boolean; // Trava posição e tamanho fixos no padrão
  slot?: string; // Ex: 'escudo', 'numero_frente', etc.
  normWidth?: number; // Largura proporcional ao canvas (0.0 a 1.0)
  normHeight?: number; // Altura proporcional ao canvas (0.0 a 1.0)
}

export interface LogoElement extends BaseElement {
  type: 'logo';
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: string;
  letterSpacing?: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  align?: TextAlignment;
}

export interface NumberElement extends BaseElement {
  type: 'number';
  text: string; // Ex: '10', '07'
  fontFamily: string;
  fontSize: number;
  fontWeight?: string;
  letterSpacing?: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export type MockupElement = LogoElement | TextElement | NumberElement;

export type GarmentPartType =
  | 'collar'
  | 'front'
  | 'back'
  | 'sleeve_left'
  | 'sleeve_right'
  | 'body'
  | 'sleeves'
  | 'escudo'
  | 'logomarca_frente'
  | 'logomarca_costas'
  | 'numero_frente'
  | 'numero_costas'
  | 'nome_costas_acima'
  | 'nome_costas_barra'
  | null;

/**
 * Estrutura serializável completa do estado de um Mockup (LayerState)
 */
export interface LayerState {
  version: number;
  modelId: string;
  patternId?: string | null;
  backgroundColor?: string;
  colorA: string;
  colorB: string;
  frontColor?: string;
  backColor?: string;
  sleeveLeftColor?: string;
  sleeveRightColor?: string;
  collarColor?: string;
  sleevesColor?: string;
  selectedPart?: GarmentPartType;
  elements: MockupElement[];
  view: MockupView;
  selectedElementId?: string | null;
  clientName?: string;
  notes?: string;
  updatedAt: string;
}

export type MockupState = LayerState;

export interface MockupExport {
  id: string;
  tenant_id: string;
  seller_id?: string | null;
  user_id?: string | null;
  client_name: string;
  layer_state: LayerState;
  front_png_url: string;
  back_png_url: string;
  sales_board_url: string;
  combined_png_url?: string | null;
  status: ExportStatus;
  width: number;
  height: number;
  processing_time_ms: number;
  watermark_applied: boolean;
  error_code?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ==========================================
// 4. PANTONE & APROXIMAÇÃO DE CORES TÊXTEIS
// ==========================================

export interface PantoneColor {
  code: string;
  name: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
}

// ==========================================
// 5. SERVER-SIDE EXPORT DTOs
// ==========================================

export interface ServerExportRequest {
  modelId: string;
  layerState: LayerState;
  clientName?: string;
  format?: 'png' | 'jpeg';
  width?: number;
  height?: number;
}

export interface ServerExportResponse {
  success: boolean;
  exportId: string;
  frontPngUrl: string;
  backPngUrl: string;
  salesBoardUrl: string;
  watermarkApplied: boolean;
  processingTimeMs: number;
}

// ==========================================
// 6. SESSÕES, HEARTBEAT & AUTENTICAÇÃO
// ==========================================

export interface HeartbeatRequest {
  sessionToken: string;
  deviceLabel?: string;
}

export interface HeartbeatResponse {
  valid: boolean;
  activeSessionsCount: number;
  maxSessions: number;
  licenseStatus: LicenseStatus;
  message?: string;
}

export interface TerminateSessionRequest {
  sessionId: string;
}

export interface TerminateSessionResponse {
  success: boolean;
  terminatedSessionId: string;
}

export interface JWTPayload {
  sub: string; // Seller Profile ID
  tenantId: string;
  licenseId: string;
  sessionId?: string;
  deviceId?: string;
  role: SellerRole;
  permissions: string[];
  iat: number;
  exp: number;
}

// ==========================================
// 7. BILLING DESACOPLADO
// ==========================================

export interface CreateCustomerDTO {
  tenantId: string;
  name: string;
  cnpj: string;
  email: string;
}

export interface CreateSubscriptionDTO {
  tenantId: string;
  planId: string;
  priceCents: number;
  customerExternalId: string;
}

export interface BillingProvider {
  createCustomer(data: CreateCustomerDTO): Promise<{ externalCustomerId: string }>;
  createSubscription(data: CreateSubscriptionDTO): Promise<{ externalSubscriptionId: string; status: string }>;
  cancelSubscription(externalSubscriptionId: string): Promise<{ success: boolean; status: string }>;
  getSubscription(externalSubscriptionId: string): Promise<{ status: string; currentPeriodEnd: string }>;
}

export interface BillingWebhookPayload {
  event: 'payment_confirmed' | 'payment_failed' | 'subscription_renewed' | 'subscription_canceled';
  tenantId: string;
  externalSubscriptionId: string;
  timestamp: string;
  signature: string;
  metadata?: Record<string, unknown>;
}

// ==========================================
// 8. LICENCIAMENTO & SERIAL DE CONTRATO
// ==========================================

export interface DeviceFingerprintData {
  userAgent: string;
  language: string;
  screenResolution: string;
  colorDepth: number;
  timezone: string;
  canvasHash: string;
  webglVendor: string;
  webglRenderer: string;
  hardwareConcurrency: number;
}

export interface LicenseValidateRequest {
  serialKey: string;
  deviceFingerprint?: string;
  deviceName?: string;
  fingerprintDetails?: Partial<DeviceFingerprintData>;
}

export interface LicenseValidateResponse {
  valid: boolean;
  token: string;
  tenant: {
    id: string;
    name: string;
    cnpj: string;
  };
  license: {
    id: string;
    status: LicenseStatus;
    expiresAt: string;
    maxDevices: number;
    activeDevicesCount: number;
  };
  device?: {
    id: string;
    name: string;
    registeredAt: string;
  };
}

export interface LicenseStatusResponse {
  valid: boolean;
  status: LicenseStatus;
  expiresAt: string;
  tenantId: string;
  tenantName: string;
  maxDevices: number;
  activeDevicesCount: number;
  currentDeviceId?: string;
}

export interface RevokeDeviceRequest {
  deviceId: string;
}

export interface RevokeDeviceResponse {
  success: boolean;
  message: string;
  revokedDeviceId: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
}
