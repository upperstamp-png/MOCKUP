/**
 * @file exporter.ts
 * @description Exportador em Alta Resolução (2000x2000px) e Gerador de Prancha Comercial de Vendas (Sales Board)
 */

import type { MockupElement, MockupModel, MockupView } from '@mockup/types';
import { renderCompositeMockup } from './pipeline.js';
import { assetCache } from './cache.js';

export interface ExportHighResOptions {
  model: MockupModel;
  patternImage?: HTMLImageElement | ImageBitmap | null;
  maskImage?: HTMLImageElement | ImageBitmap | null;
  shadowImage?: HTMLImageElement | ImageBitmap | null;
  elements: MockupElement[];
  view: MockupView;
  targetWidth?: number;
  targetHeight?: number;
  backgroundColor?: string;
}

/**
 * Exporta o mockup em altíssima resolução (2000x2000px) usando Offscreen Canvas ou elemento temporário
 */
export async function exportMockup(options: ExportHighResOptions): Promise<Blob> {
  const targetWidth = options.targetWidth || 2000;
  const targetHeight = options.targetHeight || 2000;

  // Cria canvas isolado para renderização em alta resolução
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const ctx = exportCanvas.getContext('2d', { alpha: true });

  if (!ctx) {
    throw new Error('Não foi possível inicializar o contexto 2D para exportação.');
  }

  // Pre-carrega imagens de decals se houver
  for (const el of options.elements) {
    if (el.type === 'logo' && el.url) {
      try {
        const logoImg = await assetCache.loadImage(el.url);
        (el as unknown as { _imageInstance?: HTMLImageElement })._imageInstance = logoImg;
      } catch {
        // Ignora falha de imagem individual
      }
    }
  }

  // Renderiza a composição completa sem caixas de seleção
  renderCompositeMockup({
    ctx,
    canvasWidth: targetWidth,
    canvasHeight: targetHeight,
    maskImage: options.maskImage,
    patternImage: options.patternImage,
    shadowImage: options.shadowImage,
    elements: options.elements,
    view: options.view,
    showBoundingBoxes: false,
    backgroundColor: options.backgroundColor || '#ffffff',
  });

  return new Promise<Blob>((resolve, reject) => {
    exportCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Falha ao gerar Blob PNG do Mockup.'));
      }
    }, 'image/png');
  });
}

export interface SalesBoardProps {
  frontCanvasBlob: Blob;
  backCanvasBlob: Blob;
  modelTitle: string;
  clientName?: string;
  colorA: string;
  colorB: string;
  tenantName?: string;
  category?: string;
}

/**
 * Gera a Prancha Comercial de Vendas (Sales Board 2000x2000px) formatada para WhatsApp e apresentações
 */
export async function exportSalesBoard(props: SalesBoardProps): Promise<Blob> {
  const boardWidth = 2000;
  const boardHeight = 2000;

  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = boardWidth;
  boardCanvas.height = boardHeight;
  const ctx = boardCanvas.getContext('2d');

  if (!ctx) {
    throw new Error('Erro ao inicializar contexto da Prancha Comercial.');
  }

  // 1. Fundo Gradiente Elegante
  const gradient = ctx.createLinearGradient(0, 0, 0, boardHeight);
  gradient.addColorStop(0, '#0f172a'); // Slate 900
  gradient.addColorStop(1, '#1e293b'); // Slate 800
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, boardWidth, boardHeight);

  // 2. Cabeçalho Comercial
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(props.tenantName || 'CONFECÇÃO & UNIFORMES PROFISSIONAIS', 80, 110);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '32px Inter, sans-serif';
  ctx.fillText(`Modelo: ${props.modelTitle.toUpperCase()} • Categoria: ${(props.category || 'Geral').toUpperCase()}`, 80, 160);

  if (props.clientName) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 32px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`CLIENTE: ${props.clientName.toUpperCase()}`, boardWidth - 80, 110);

    ctx.fillStyle = '#64748b';
    ctx.font = '24px Inter, sans-serif';
    const dateStr = new Date().toLocaleDateString('pt-BR');
    ctx.fillText(`Gerado em: ${dateStr}`, boardWidth - 80, 155);
  }

  // Linha divisória
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 195);
  ctx.lineTo(boardWidth - 80, 195);
  ctx.stroke();

  // 3. Carrega e Desenha os Mockups da Frente e Costas Lado a Lado
  const frontUrl = URL.createObjectURL(props.frontCanvasBlob);
  const backUrl = URL.createObjectURL(props.backCanvasBlob);

  const frontImg = await assetCache.loadImage(frontUrl, false);
  const backImg = await assetCache.loadImage(backUrl, false);

  const mockupSize = 860;
  const posY = 240;

  // Painel Frente (Card)
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(80, posY, mockupSize, mockupSize + 120, 24);
  ctx.fill();
  ctx.stroke();

  ctx.drawImage(frontImg, 80 + 30, posY + 20, mockupSize - 60, mockupSize - 60);

  // Label Frente
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VISTA FRONTAL', 80 + mockupSize / 2, posY + mockupSize + 70);

  // Painel Costas (Card)
  const backPosX = boardWidth - 80 - mockupSize;
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(backPosX, posY, mockupSize, mockupSize + 120, 24);
  ctx.fill();
  ctx.stroke();

  ctx.drawImage(backImg, backPosX + 30, posY + 20, mockupSize - 60, mockupSize - 60);

  // Label Costas
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VISTA COSTAS', backPosX + mockupSize / 2, posY + mockupSize + 70);

  // Libera Object URLs
  URL.revokeObjectURL(frontUrl);
  URL.revokeObjectURL(backUrl);

  // 4. Rodapé com Paleta de Cores e Informações Técnicas
  const footerY = 1320;
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(80, footerY, boardWidth - 160, 560, 24);
  ctx.fill();
  ctx.stroke();

  // Título do Bloco de Cores
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PALETA DE CORES DA PEÇA', 130, footerY + 70);

  // Amostra Cor A
  ctx.fillStyle = props.colorA;
  ctx.beginPath();
  ctx.roundRect(130, footerY + 110, 80, 80, 16);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px Inter, sans-serif';
  ctx.fillText('COR PRINCIPAL (A)', 230, footerY + 145);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '26px monospace';
  ctx.fillText(props.colorA.toUpperCase(), 230, footerY + 180);

  // Amostra Cor B
  ctx.fillStyle = props.colorB;
  ctx.beginPath();
  ctx.roundRect(700, footerY + 110, 80, 80, 16);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px Inter, sans-serif';
  ctx.fillText('COR SECUNDÁRIA (B)', 800, footerY + 145);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '26px monospace';
  ctx.fillText(props.colorB.toUpperCase(), 800, footerY + 180);

  // Bloco de Notas Comerciais
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '26px Inter, sans-serif';
  ctx.fillText('• Estampa digital em alta definição com proteção UV e tecnologia dry-fit', 130, footerY + 260);
  ctx.fillText('• As cores do mockup podem apresentar variações mínimas conforme a calibragem do tecido e tela', 130, footerY + 310);
  ctx.fillText('• Logotipos e numerações com recorte digital e alinhamento milimétrico industrial', 130, footerY + 360);

  // Carimbo de Aprovação
  ctx.fillStyle = '#0ea5e9';
  ctx.font = 'bold 30px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('PRONTO PARA ENVIO VIA WHATSAPP / APROVAÇÃO', boardWidth - 130, footerY + 500);

  return new Promise<Blob>((resolve, reject) => {
    boardCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Erro ao exportar Prancha Comercial em Blob PNG.'));
      }
    }, 'image/png');
  });
}
