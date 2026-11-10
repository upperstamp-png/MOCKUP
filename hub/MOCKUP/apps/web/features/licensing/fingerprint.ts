/**
 * @file fingerprint.ts
 * @description Gerador de fingerprint composto de dispositivo para validação e licenciamento B2B
 */

import { DeviceFingerprintData } from '@mockup/types';

/**
 * Gera um hash SHA-256 no browser via Web Crypto API
 */
async function sha256Browser(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Coleta uma impressão digital gráfica do Canvas 2D
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'canvas-unsupported';

    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial', sans-serif";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = '#069';
    ctx.fillText('MockupB2B, <canvas> 1.0', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Uniform & Decal Engine', 4, 35);

    return canvas.toDataURL();
  } catch {
    return 'canvas-blocked';
  }
}

/**
 * Coleta informações de GPU via WebGL
 */
function getWebGLInfo(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: 'unsupported', renderer: 'unsupported' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return { vendor: 'generic', renderer: 'generic' };

    return {
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown',
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown',
    };
  } catch {
    return { vendor: 'blocked', renderer: 'blocked' };
  }
}

/**
 * Gera o fingerprint composto completo do dispositivo
 */
export async function generateDeviceFingerprint(): Promise<{
  fingerprintHash: string;
  details: DeviceFingerprintData;
}> {
  const canvasHashRaw = getCanvasFingerprint();
  const webgl = getWebGLInfo();

  const details: DeviceFingerprintData = {
    userAgent: navigator.userAgent,
    language: navigator.language || 'pt-BR',
    screenResolution: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
    colorDepth: window.screen.colorDepth || 24,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    canvasHash: await sha256Browser(canvasHashRaw),
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
  };

  const rawFingerprintString = [
    details.userAgent,
    details.language,
    details.screenResolution,
    details.timezone,
    details.canvasHash,
    details.webglVendor,
    details.webglRenderer,
    details.hardwareConcurrency,
  ].join('###');

  const fingerprintHash = await sha256Browser(rawFingerprintString);

  return {
    fingerprintHash,
    details,
  };
}
