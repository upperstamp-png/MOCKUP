/**
 * @file server-renderer.ts
 * @description Renderizador server-side de mockups e pranchas comerciais de alta definição (2000x2000px)
 */

import { LayerState, MockupElement } from '@mockup/types';

export interface RenderContext {
  layerState: LayerState;
  modelTitle: string;
  clientName: string;
  tenantName: string;
  applyWatermark: boolean;
}

/**
 * Regra centralizada de marca d'água no servidor
 */
export function shouldApplyWatermark(params: {
  tenantStatus: string;
  licenseStatus: string;
  licenseExpiresAt: string;
  isTrial?: boolean;
}): boolean {
  if (params.tenantStatus !== 'active') return true;
  if (params.licenseStatus !== 'active') return true;
  if (new Date(params.licenseExpiresAt) < new Date()) return true;
  if (params.isTrial) return true;
  return false;
}

/**
 * Gera a composição SVG vetorial em alta resolução (2000x2000px) pronta para renderização server-side
 */
export function generateServerSalesBoardSvg(ctx: RenderContext): string {
  const { layerState, modelTitle, clientName, tenantName, applyWatermark } = ctx;

  const frontElements = (layerState.elements || []).filter((el) => el.view === 'front');
  const backElements = (layerState.elements || []).filter((el) => el.view === 'back');

  const renderElementsSvg = (elements: MockupElement[], offsetX: number, offsetY: number, scale: number) => {
    return elements
      .map((el) => {
        const posX = offsetX + el.x * 800 * scale;
        const posY = offsetY + el.y * 800 * scale;
        const rotDeg = (el.rotation * 180) / Math.PI;

        if (el.type === 'text' || el.type === 'number') {
          const fontSize = el.fontSize * scale * (el.scaleX || 1);
          return `
            <g transform="translate(${posX}, ${posY}) rotate(${rotDeg})">
              ${el.strokeColor && el.strokeWidth ? `
                <text 
                  text-anchor="${el.type === 'text' ? el.align : 'middle'}" 
                  dominant-baseline="central" 
                  font-family="${el.fontFamily || 'Inter, sans-serif'}" 
                  font-size="${fontSize}" 
                  font-weight="${el.fontWeight || 'bold'}" 
                  fill="none" 
                  stroke="${el.strokeColor}" 
                  stroke-width="${(el.strokeWidth || 4) * scale}"
                  stroke-linejoin="round"
                >${el.text}</text>` : ''}
              <text 
                text-anchor="${el.type === 'text' ? el.align : 'middle'}" 
                dominant-baseline="central" 
                font-family="${el.fontFamily || 'Inter, sans-serif'}" 
                font-size="${fontSize}" 
                font-weight="${el.fontWeight || 'bold'}" 
                fill="${el.color}"
              >${el.text}</text>
            </g>
          `;
        }
        return '';
      })
      .join('');
  };

  const watermarkSvg = applyWatermark
    ? `
      <g opacity="0.18">
        <text x="1000" y="800" text-anchor="middle" font-size="140" font-weight="900" fill="#ffffff" transform="rotate(-30, 1000, 800)">TEXCRAFT PROPOSTA</text>
        <text x="1000" y="1100" text-anchor="middle" font-size="60" font-weight="bold" fill="#ffffff" transform="rotate(-30, 1000, 1100)">VERSÃO DE DEMONSTRAÇÃO</text>
      </g>
    `
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="2000" height="2000" fill="url(#bgGrad)"/>

  <!-- Header -->
  <text x="80" y="110" font-family="Inter, system-ui, sans-serif" font-size="54" font-weight="bold" fill="#ffffff">${tenantName}</text>
  <text x="80" y="160" font-family="Inter, system-ui, sans-serif" font-size="30" fill="#94a3b8">MODELO: ${modelTitle.toUpperCase()} • RENDERIZAÇÃO INDUSTRIAL 2D</text>

  <text x="1920" y="110" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="32" font-weight="bold" fill="#38bdf8">CLIENTE: ${clientName.toUpperCase()}</text>
  <text x="1920" y="155" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="24" fill="#64748b">Data: ${new Date().toLocaleDateString('pt-BR')}</text>
  <line x1="80" y1="195" x2="1920" y2="195" stroke="#334155" stroke-width="2"/>

  <!-- Card Frente -->
  <g transform="translate(80, 240)" filter="url(#shadow)">
    <rect width="860" height="980" rx="24" fill="#1e293b" stroke="#334155" stroke-width="3"/>
    <!-- Silhouette Base -->
    <path d="M250,140 L350,200 L450,200 L550,140 L720,300 L630,400 L560,320 L560,800 L240,800 L240,320 L170,400 L80,300 Z" fill="${layerState.colorA}" transform="translate(50, 40) scale(0.9)"/>
    <path d="M250,140 L350,200 L450,200 L550,140 L720,300 L630,400 L560,320 L560,800 L240,800 L240,320 L170,400 L80,300 Z" fill="${layerState.colorB}" opacity="0.35" transform="translate(50, 40) scale(0.9)"/>
    <!-- Elements -->
    ${renderElementsSvg(frontElements, 50, 40, 0.9)}
    <text x="430" y="930" text-anchor="middle" font-family="Inter, sans-serif" font-size="36" font-weight="bold" fill="#ffffff">VISTA FRONTAL</text>
  </g>

  <!-- Card Costas -->
  <g transform="translate(1060, 240)" filter="url(#shadow)">
    <rect width="860" height="980" rx="24" fill="#1e293b" stroke="#334155" stroke-width="3"/>
    <!-- Silhouette Base -->
    <path d="M250,140 L350,200 L450,200 L550,140 L720,300 L630,400 L560,320 L560,800 L240,800 L240,320 L170,400 L80,300 Z" fill="${layerState.colorA}" transform="translate(50, 40) scale(0.9)"/>
    <path d="M250,140 L350,200 L450,200 L550,140 L720,300 L630,400 L560,320 L560,800 L240,800 L240,320 L170,400 L80,300 Z" fill="${layerState.colorB}" opacity="0.35" transform="translate(50, 40) scale(0.9)"/>
    <!-- Elements -->
    ${renderElementsSvg(backElements, 50, 40, 0.9)}
    <text x="430" y="930" text-anchor="middle" font-family="Inter, sans-serif" font-size="36" font-weight="bold" fill="#ffffff">VISTA COSTAS</text>
  </g>

  <!-- Footer Paleta e Informações Técnicas -->
  <g transform="translate(80, 1300)">
    <rect width="1840" height="580" rx="24" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <text x="60" y="70" font-family="Inter, sans-serif" font-size="36" font-weight="bold" fill="#ffffff">PALETA DE CORES DA CONFECÇÃO</text>

    <!-- Cor A -->
    <rect x="60" y="110" width="80" height="80" rx="16" fill="${layerState.colorA}" stroke="#ffffff" stroke-width="2"/>
    <text x="160" y="145" font-family="Inter, sans-serif" font-size="30" font-weight="bold" fill="#f8fafc">COR PRINCIPAL (A)</text>
    <text x="160" y="180" font-family="monospace" font-size="26" fill="#94a3b8">${layerState.colorA.toUpperCase()}</text>

    <!-- Cor B -->
    <rect x="650" y="110" width="80" height="80" rx="16" fill="${layerState.colorB}" stroke="#ffffff" stroke-width="2"/>
    <text x="750" y="145" font-family="Inter, sans-serif" font-size="30" font-weight="bold" fill="#f8fafc">COR SECUNDÁRIA (B)</text>
    <text x="750" y="180" font-family="monospace" font-size="26" fill="#94a3b8">${layerState.colorB.toUpperCase()}</text>

    <!-- Notas -->
    <text x="60" y="270" font-family="Inter, sans-serif" font-size="26" fill="#cbd5e1">• Composição digital em alta definição com mapa de sombras e dobras reais do tecido</text>
    <text x="60" y="320" font-family="Inter, sans-serif" font-size="26" fill="#cbd5e1">• Numeração e nomes com alinhamento e proporção escalados para corte industrial</text>
    <text x="60" y="370" font-family="Inter, sans-serif" font-size="24" fill="#94a3b8">• A cor física pode apresentar variações mínimas conforme o lote têxtil e calibragem do monitor</text>

    <text x="1780" y="520" text-anchor="end" font-family="Inter, sans-serif" font-size="30" font-weight="bold" fill="#0ea5e9">PROPOSTA PRONTA PARA ENVIO VIA WHATSAPP</text>
  </g>

  <!-- Watermark Layer -->
  ${watermarkSvg}
</svg>`;
}
