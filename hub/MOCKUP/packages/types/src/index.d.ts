/**
 * @file index.ts
 * @description Tipos TypeScript compartilhados entre Frontend, Backend API e Canvas Engine
 */
export type TenantStatus = 'active' | 'blocked' | 'expired';
export type LicenseStatus = 'active' | 'blocked' | 'expired';
export type ApparelCategory = 'futebol' | 'basquete' | 'polo' | 'camiseta' | 'bone' | 'moletom' | 'outros';
export type MockupView = 'front' | 'back';
export type ElementType = 'logo' | 'text' | 'number';
export type TextAlignment = 'left' | 'center' | 'right';
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
    serial_key_prefix: string;
    max_devices: number;
    expires_at: string;
    status: LicenseStatus;
    created_at: string;
    updated_at: string;
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
    tenant_id?: string | null;
    title: string;
    category: ApparelCategory;
    front_shadow_url: string;
    back_shadow_url: string;
    mask_url: string;
    mask_back_url?: string;
    thumbnail_url: string;
    created_at: string;
    updated_at: string;
}
export interface Pattern {
    id: string;
    tenant_id?: string | null;
    title: string;
    category: string;
    svg_file_url: string;
    thumbnail_url: string;
    created_at: string;
}
export interface MockupExport {
    id: string;
    tenant_id: string;
    user_id?: string | null;
    client_name: string;
    front_png_url: string;
    back_png_url: string;
    sales_board_url: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}
export interface BaseElement {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    opacity: number;
    visible: boolean;
    view: MockupView;
    zIndex: number;
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
    fontWeight: string | number;
    letterSpacing: number;
    color: string;
    align: TextAlignment;
    strokeColor?: string;
    strokeWidth?: number;
}
export interface NumberElement extends BaseElement {
    type: 'number';
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: string | number;
    letterSpacing: number;
    color: string;
    strokeColor?: string;
    strokeWidth?: number;
}
export type MockupElement = LogoElement | TextElement | NumberElement;
export interface CanvasTransform {
    zoom: number;
    panX: number;
    panY: number;
}
export interface DuotoneColors {
    colorA: string;
    colorB: string;
}
export interface MockupCanvasProps {
    model: ApparelModel;
    pattern?: Pattern | null;
    colorA: string;
    colorB: string;
    elements: MockupElement[];
    view: MockupView;
    selectedElementId?: string | null;
    onSelectElement?: (id: string | null) => void;
    onChangeElements?: (elements: MockupElement[]) => void;
    width?: number;
    height?: number;
    readonly?: boolean;
}
export interface RenderPipelineOptions {
    ctx: CanvasRenderingContext2D;
    targetWidth: number;
    targetHeight: number;
    model: ApparelModel;
    patternImage?: HTMLImageElement | ImageBitmap | null;
    maskImage?: HTMLImageElement | ImageBitmap | null;
    shadowImage?: HTMLImageElement | ImageBitmap | null;
    elements: MockupElement[];
    view: MockupView;
    backgroundColor?: string;
}
export interface SalesBoardExportOptions {
    frontCanvas: HTMLCanvasElement;
    backCanvas: HTMLCanvasElement;
    modelTitle: string;
    clientName?: string;
    colors: {
        colorA: string;
        colorB: string;
    };
    tenantName?: string;
    generatedAt?: string;
}
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
    deviceFingerprint: string;
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
    device: {
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
    currentDeviceId: string;
}
export interface RevokeDeviceRequest {
    deviceId: string;
}
export interface RevokeDeviceResponse {
    success: boolean;
    message: string;
    revokedDeviceId: string;
}
export interface JWTPayload {
    sub: string;
    tenantId: string;
    licenseId: string;
    deviceId: string;
    role: 'seller' | 'admin' | 'tenant_admin';
    permissions: string[];
    iat: number;
    exp: number;
}
export interface ApiErrorResponse {
    statusCode: number;
    error: string;
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
}
//# sourceMappingURL=index.d.ts.map