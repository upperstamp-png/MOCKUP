'use client';

import React, { useState } from 'react';
import {
  MockupModel,
  Pattern,
  MockupElement,
  LayerState,
} from '@mockup/types';
import { exportMockup, exportSalesBoard, applyDuotoneToSVG, assetCache } from '@mockup/canvas-engine';
import {
  X,
  Share2,
  Download,
  CheckCircle2,
  Loader2,
  Phone,
  FileImage,
  ShieldAlert,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: MockupModel;
  pattern: Pattern | null;
  colorA: string;
  colorB: string;
  elements: MockupElement[];
  getLayerState?: () => LayerState;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  model,
  pattern,
  colorA,
  colorB,
  elements,
  getLayerState,
}) => {
  const [clientName, setClientName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBoardUrl, setGeneratedBoardUrl] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [watermarkApplied, setWatermarkApplied] = useState(false);

  if (!isOpen) return null;

  const handleGenerateSalesBoard = async () => {
    setIsGenerating(true);
    setGeneratedBoardUrl(null);
    setIsSaved(false);
    setWatermarkApplied(false);

    try {
      const currentLayerState: LayerState = getLayerState
        ? getLayerState()
        : {
            version: 1,
            modelId: model.id,
            patternId: pattern?.id,
            colorA,
            colorB,
            elements,
            view: 'front',
            clientName: clientName.trim(),
            updatedAt: new Date().toISOString(),
          };

      // Tenta exportação Server-Side via API Fastify
      const token = typeof window !== 'undefined' ? localStorage.getItem('mockup_auth_token') : null;
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4444/api/v1';

      if (token) {
        try {
          const res = await fetch(`${apiBase}/exports/server`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              modelId: model.id,
              layerState: currentLayerState,
              clientName: clientName.trim() || 'Cliente VIP',
              width: 2000,
              height: 2000,
            }),
          });

          if (res.ok) {
            const serverData = await res.json();
            setGeneratedBoardUrl(serverData.salesBoardUrl);
            setWatermarkApplied(serverData.watermarkApplied);
            setIsSaved(true);
            setIsGenerating(false);
            return;
          }
        } catch {
          // Fallback para renderização client-side
        }
      }

      // Fallback Client-Side de alta fidelidade
      let patternBitmap: HTMLImageElement | ImageBitmap | null = null;
      if (pattern && pattern.svg_file_url) {
        let svgRaw = '';
        if (pattern.svg_file_url.startsWith('<svg')) {
          svgRaw = pattern.svg_file_url;
        } else {
          const res = await fetch(pattern.svg_file_url);
          svgRaw = await res.text();
        }
        patternBitmap = await applyDuotoneToSVG(svgRaw, colorA, colorB);
      }

      const [frontShadow, backShadow, frontMask, backMask] = await Promise.all([
        assetCache.loadImage(model.front_shadow_url),
        assetCache.loadImage(model.back_shadow_url),
        assetCache.loadImage(model.mask_url),
        assetCache.loadImage(model.mask_back_url || model.mask_url),
      ]);

      const frontBlob = await exportMockup({
        model,
        patternImage: patternBitmap,
        maskImage: frontMask,
        shadowImage: frontShadow,
        elements,
        view: 'front',
        targetWidth: 2000,
        targetHeight: 2000,
      });

      const backBlob = await exportMockup({
        model,
        patternImage: patternBitmap,
        maskImage: backMask,
        shadowImage: backShadow,
        elements,
        view: 'back',
        targetWidth: 2000,
        targetHeight: 2000,
      });

      const salesBoardBlob = await exportSalesBoard({
        frontCanvasBlob: frontBlob,
        backCanvasBlob: backBlob,
        modelTitle: model.title,
        clientName: clientName.trim() || 'Cliente VIP',
        colorA,
        colorB,
        category: model.category,
      });

      const boardUrl = URL.createObjectURL(salesBoardBlob);
      setGeneratedBoardUrl(boardUrl);
      setIsSaved(true);
    } catch (err) {
      console.error('Erro ao gerar exportação:', err);
      alert('Ocorreu um erro ao gerar a prancha comercial.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!whatsappNumber.trim()) {
      alert('Por favor, informe o número de WhatsApp com DDD.');
      return;
    }
    const cleanPhone = whatsappNumber.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Olá ${clientName || ''}! Segue a proposta visual do seu uniforme modelo *${model.title}* desenvolvida especialmente para você. Fico à disposição para fecharmos o pedido!`
    );
    window.open(`https://wa.me/55${cleanPhone}?text=${message}`, '_blank');
  };

  const handleDownload = () => {
    if (!generatedBoardUrl) return;
    const a = document.createElement('a');
    a.href = generatedBoardUrl;
    a.download = `Proposta_${model.title.replace(/\s+/g, '_')}_${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-wise-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-wise-canvas border border-wise-border rounded-4xl w-full max-w-2xl overflow-hidden shadow-wise-lg flex flex-col">
        {/* Header */}
        <div className="px-8 py-5 border-b border-wise-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-wise-primary flex items-center justify-center text-wise-on-primary font-black">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-wise-ink">Exportar Prancha Comercial</h2>
              <p className="text-xs text-wise-body">Alta Resolução 2000x2000px com Persistência</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-wise-body hover:text-wise-ink rounded-full hover:bg-wise-canvas-soft transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 space-y-6 overflow-y-auto max-h-[75vh]">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-wise-ink mb-1.5">
                Nome do Cliente / Equipe
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Santos Futebol Clube"
                className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-wise-ink mb-1.5">
                WhatsApp do Cliente (com DDD)
              </label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="(11) 98765-4321"
                className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
              />
            </div>
          </div>

          {/* Action Button */}
          {!generatedBoardUrl ? (
            <button
              onClick={handleGenerateSalesBoard}
              disabled={isGenerating}
              className="w-full bg-wise-primary hover:bg-wise-primary-active disabled:opacity-50 text-wise-on-primary font-black py-4 rounded-full text-xs transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Renderizando no Servidor...
                </>
              ) : (
                <>
                  <FileImage className="w-4 h-4" />
                  GERAR PRANCHA COMERCIAL EM ALTA DEFINIÇÃO
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              {watermarkApplied && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-wise-warning/20 border border-wise-warning-deep/30 text-xs text-wise-warning-content font-bold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Marca d'água aplicada (Plano Demonstração).</span>
                </div>
              )}

              {/* Preview Box */}
              <div className="rounded-3xl overflow-hidden border border-wise-border bg-wise-canvas-soft p-3 relative group">
                <img
                  src={generatedBoardUrl}
                  alt="Prancha Comercial"
                  className="w-full h-auto max-h-64 object-contain mx-auto rounded-2xl"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 bg-wise-canvas-soft hover:bg-wise-border text-wise-ink font-bold py-3.5 rounded-full text-xs transition-all border border-wise-border"
                >
                  <Download className="w-4 h-4" />
                  Baixar Imagem PNG
                </button>
                <button
                  onClick={handleSendWhatsApp}
                  className="flex items-center justify-center gap-2 bg-wise-primary hover:bg-wise-primary-active text-wise-on-primary font-black py-3.5 rounded-full text-xs transition-all shadow-sm"
                >
                  <Phone className="w-4 h-4" />
                  Enviar no WhatsApp
                </button>
              </div>

              {isSaved && (
                <div className="flex items-center justify-center gap-2 text-xs text-wise-positive font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Proposta salva com sucesso no histórico</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
