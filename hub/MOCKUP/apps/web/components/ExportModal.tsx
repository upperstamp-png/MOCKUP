'use client';

import React, { useEffect, useState } from 'react';
import {
  MockupModel,
  Pattern,
  MockupElement,
  LayerState,
} from '@mockup/types';
import {
  exportMockup,
  exportSalesBoard,
  applyDuotoneToSVG,
  assetCache,
} from '@mockup/canvas-engine';
import { useMockupStore } from '@/features/studio/store/mockupStore';
import { hubAsset, portalFetch, PortalApiError } from '@/lib/api-client';
import {
  X,
  Share2,
  Download,
  CheckCircle2,
  Loader2,
  Phone,
  FileImage,
  AlertTriangle,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  initialClientName?: string;
  customerId?: string | null;
  artProjectId?: string | null;
  customers?: Array<{ id: string; name: string }>;
  artProjects?: Array<{ id: string; title: string; customer_name: string }>;
  unitLabel?: string;
  canSaveToPortal?: boolean;
  onClose: () => void;
  onSaved?: (artProjectId: string, versionNumber: number) => void;
  model: MockupModel;
  pattern: Pattern | null;
  colorA: string;
  colorB: string;
  elements: MockupElement[];
  getLayerState?: () => LayerState;
}

function blobToJpegDataUrl(blob: Blob, maxWidth = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Contexto 2D indisponível.');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  initialClientName = '',
  customerId = null,
  artProjectId = null,
  customers = [],
  artProjects = [],
  unitLabel = 'KING SPORTS · PORTAL DO FRANQUEADO',
  canSaveToPortal = true,
  onClose,
  onSaved,
  model,
  pattern,
  colorA,
  colorB,
  elements,
  getLayerState,
}) => {
  const [clientName, setClientName] = useState(initialClientName);
  const [selectedArtId, setSelectedArtId] = useState(artProjectId || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || '');
  const [versionNotes, setVersionNotes] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBoardUrl, setGeneratedBoardUrl] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setClientName(initialClientName);
  }, [initialClientName]);

  useEffect(() => {
    setSelectedArtId(artProjectId || '');
  }, [artProjectId]);

  useEffect(() => {
    setSelectedCustomerId(customerId || '');
  }, [customerId]);

  if (!isOpen) return null;

  const safeLoadOptionalImage = async (url?: string): Promise<HTMLImageElement | null> => {
    if (!url) return null;
    try {
      return await assetCache.loadImage(hubAsset(url));
    } catch {
      return null;
    }
  };

  const handleGenerateSalesBoard = async () => {
    setIsGenerating(true);
    setGeneratedBoardUrl(null);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const storeState = useMockupStore.getState();
      const currentLayerState: LayerState = getLayerState
        ? getLayerState()
        : {
            version: 1,
            modelId: model.id,
            patternId: pattern?.id,
            colorA,
            colorB,
            collarColor: storeState.collarColor,
            frontColor: storeState.frontColor,
            backColor: storeState.backColor,
            sleeveLeftColor: storeState.sleeveLeftColor,
            sleeveRightColor: storeState.sleeveRightColor,
            sleevesColor: storeState.sleevesColor,
            elements,
            view: 'both',
            clientName: clientName.trim(),
            updatedAt: new Date().toISOString(),
          };

      let patternBitmap: HTMLImageElement | ImageBitmap | null = null;
      if (pattern && pattern.svg_file_url) {
        const url = pattern.svg_file_url;
        if (url.startsWith('<svg')) {
          patternBitmap = await applyDuotoneToSVG(url, storeState.colorA, storeState.colorB);
        } else if (url.startsWith('data:image/svg') || url.toLowerCase().includes('.svg')) {
          const resolvedUrl = hubAsset(url);
          const res = await fetch(resolvedUrl);
          const svgRaw = await res.text();
          if (svgRaw.includes('<svg')) {
            patternBitmap = await applyDuotoneToSVG(svgRaw, storeState.colorA, storeState.colorB);
          } else {
            patternBitmap = await assetCache.loadImage(resolvedUrl);
          }
        } else {
          patternBitmap = await assetCache.loadImage(hubAsset(url));
        }
      }

      const [
        frontShadow,
        backShadow,
        bgMask,
        frontMask,
        backMask,
        sleeveLeftMask,
        sleeveRightMask,
        collarMask,
      ] = await Promise.all([
        assetCache.loadImage(hubAsset(model.front_shadow_url || '/assets/MOCKUP_MULTIPLAY.png')),
        assetCache.loadImage(hubAsset(model.back_shadow_url || '/assets/MOCKUP_MULTIPLAY.png')),
        safeLoadOptionalImage(model.background_mask_url || model.mask_url),
        safeLoadOptionalImage(model.front_mask_url),
        safeLoadOptionalImage(model.back_mask_url),
        safeLoadOptionalImage(model.sleeve_left_mask_url),
        safeLoadOptionalImage(model.sleeve_right_mask_url),
        safeLoadOptionalImage(model.collar_mask_url),
      ]);

      const partColors = {
        backgroundColor: storeState.backgroundColor || '#ffffff',
        colorA: storeState.colorA,
        colorB: storeState.colorB,
        collarColor: storeState.collarColor,
        frontColor: storeState.frontColor,
        backColor: storeState.backColor,
        sleeveLeftColor: storeState.sleeveLeftColor,
        sleeveRightColor: storeState.sleeveRightColor,
        sleevesColor: storeState.sleevesColor,
        backgroundMask: bgMask,
        frontMask,
        backMask,
        sleeveLeftMask,
        sleeveRightMask,
        collarMask,
      };

      const frontBlob = await exportMockup({
        model,
        patternImage: patternBitmap,
        maskImage: bgMask || frontShadow,
        shadowImage: frontShadow,
        elements,
        view: 'front',
        targetWidth: 2000,
        targetHeight: 2000,
        ...partColors,
      });

      const backBlob = await exportMockup({
        model,
        patternImage: patternBitmap,
        maskImage: bgMask || backShadow,
        shadowImage: backShadow,
        elements,
        view: 'back',
        targetWidth: 2000,
        targetHeight: 2000,
        ...partColors,
      });

      const resolvedName = clientName.trim() || 'Uniforme Personalizado';
      const salesBoardBlob = await exportSalesBoard({
        frontCanvasBlob: frontBlob,
        backCanvasBlob: backBlob,
        modelTitle: model.title,
        clientName: resolvedName,
        tenantName: unitLabel,
        colorA: storeState.frontColor || storeState.colorA,
        colorB: storeState.collarColor || storeState.colorB,
        category: model.category,
      });

      const compactDataUrl = await blobToJpegDataUrl(salesBoardBlob, 1400);
      const boardObjectUrl = URL.createObjectURL(salesBoardBlob);
      setGeneratedBoardUrl(boardObjectUrl);

      if (canSaveToPortal) {
        let targetArtId = selectedArtId;

        if (!targetArtId && selectedCustomerId) {
          const createdProject = await portalFetch<{ project: { id: string } }>('/arts', {
            method: 'POST',
            body: JSON.stringify({
              customerId: selectedCustomerId,
              title: `Uniforme ${model.title} · ${resolvedName}`,
              briefing:
                versionNotes.trim() ||
                `Mockup ilustrativo inicial criado no Studio 3D (${model.title}).`,
            }),
          });
          targetArtId = createdProject.project.id;
          setSelectedArtId(targetArtId);
        }

        if (targetArtId) {
          const fileSlug = resolvedName.toLowerCase().replace(/[^a-z0-9]+/gi, '_');
          const verRes = await portalFetch<{
            version: { version_number: number };
            invalidatedApprovals: number;
          }>(`/arts/${targetArtId}/versions`, {
            method: 'POST',
            body: JSON.stringify({
              artifactKind: 'mockup_ilustrativo',
              fileName: `prancha_${fileSlug}.jpg`,
              mimeType: 'image/jpeg',
              dataUrl: compactDataUrl,
              previewSummary: `${model.title} · Frente ${storeState.frontColor || storeState.colorA} / Gola ${storeState.collarColor || storeState.colorB}`,
              layerState: {
                ...currentLayerState,
                clientName: resolvedName,
                updatedAt: new Date().toISOString(),
              },
              notes:
                versionNotes.trim() ||
                'Prancha comercial salva via Studio 3D (mockup ilustrativo).',
            }),
          });
          const vNum = verRes.version.version_number;
          setSaveMessage(
            `Salvo no histórico versionado do Studio de Artes como v${vNum}${
              verRes.invalidatedApprovals > 0
                ? ' (aprovação anterior substituída — necessária nova validação)'
                : ''
            }.`
          );
          onSaved?.(targetArtId, vNum);
        } else {
          setSaveMessage(
            'Prancha gerada apenas para download local. Selecione um cliente/projeto acima se desejar gravar versão oficial no banco.'
          );
        }
      } else {
        setSaveMessage('Prancha gerada para visualização e download.');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof PortalApiError
          ? err.message
          : 'Erro ao gerar ou persistir a prancha comercial.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!whatsappNumber.trim()) {
      setErrorMessage('Informe o número de WhatsApp com DDD antes de abrir o aplicativo.');
      return;
    }
    const cleanPhone = whatsappNumber.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Olá ${clientName || ''}! Segue a prévia visual ilustrativa do seu uniforme modelo *${model.title}* desenvolvida na King Sports. Fico à disposição para validação!`
    );
    window.open(`https://wa.me/55${cleanPhone}?text=${message}`, '_blank');
  };

  const handleDownload = () => {
    if (!generatedBoardUrl) return;
    const a = document.createElement('a');
    a.href = generatedBoardUrl;
    a.download = `Proposta_${(clientName || model.title).replace(/\s+/g, '_')}_${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="apple-glass rounded-[32px] w-full max-w-2xl overflow-hidden flex flex-col">
        <div className="px-7 py-5 border-b border-white/12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl apple-glass-cta flex items-center justify-center text-white font-bold">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-wise-ink tracking-tight">
                Exportar &amp; Versionar Prancha Comercial
              </h2>
              <p className="text-xs text-wise-body">
                Geração em alta resolução com registro imutável no Storage privado da unidade
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="p-2 text-wise-body hover:text-wise-ink rounded-full bg-white/6 hover:bg-white/15 border border-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-7 space-y-5 overflow-y-auto max-h-[78vh]">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-500/15 border border-rose-400/35 text-xs text-rose-100">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
              <span>{errorMessage}</span>
            </div>
          )}

          {canSaveToPortal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1.5">
                  Projeto de Arte Existente
                </label>
                <select
                  value={selectedArtId}
                  onChange={(e) => setSelectedArtId(e.target.value)}
                  className="w-full apple-glass-well rounded-2xl px-3.5 py-2.5 text-xs text-wise-ink font-semibold outline-none"
                >
                  <option value="" className="bg-[#181818]">
                    -- Criar novo projeto para o cliente --
                  </option>
                  {artProjects.map((ap) => (
                    <option key={ap.id} value={ap.id} className="bg-[#181818]">
                      {ap.title} ({ap.customer_name})
                    </option>
                  ))}
                </select>
              </div>
              {!selectedArtId && (
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1.5">
                    Vincular ao Cliente CRM
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedCustomerId(nextId);
                      const matched = customers.find((c) => c.id === nextId);
                      if (matched && !clientName.trim()) {
                        setClientName(matched.name);
                      }
                    }}
                    className="w-full apple-glass-well rounded-2xl px-3.5 py-2.5 text-xs text-wise-ink font-semibold outline-none"
                  >
                    <option value="" className="bg-[#181818]">
                      Apenas download local (sem vínculo)
                    </option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#181818]">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1.5">
                Nome do Cliente / Equipe na Prancha
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Atlético Vila Nova FC"
                className="w-full apple-glass-well focus:border-blue-400/70 rounded-2xl px-4 py-2.5 text-xs text-wise-ink font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1.5">
                WhatsApp do Cliente (abre app externo)
              </label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="(11) 98765-4321"
                className="w-full apple-glass-well focus:border-blue-400/70 rounded-2xl px-4 py-2.5 text-xs text-wise-ink font-semibold outline-none"
              />
            </div>
          </div>

          {canSaveToPortal && (
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1.5">
                Observações desta versão (opcional)
              </label>
              <input
                type="text"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                placeholder="Ex: Ajuste na cor da gola e posicionamento do escudo"
                className="w-full apple-glass-well rounded-2xl px-4 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
          )}

          {!generatedBoardUrl ? (
            <button
              type="button"
              onClick={handleGenerateSalesBoard}
              disabled={isGenerating}
              className="w-full apple-glass-cta disabled:opacity-50 text-white font-semibold py-3.5 rounded-full text-xs transition-all flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando Prancha 2000×2000px &amp; Salvando...</span>
                </>
              ) : (
                <>
                  <FileImage className="w-4 h-4" />
                  <span>GERAR PRANCHA &amp; SALVAR VERSÃO</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl overflow-hidden apple-glass-well p-3">
                <img
                  src={generatedBoardUrl}
                  alt="Prancha Comercial"
                  className="w-full h-auto max-h-64 object-contain mx-auto rounded-2xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 bg-white/8 hover:bg-white/15 text-wise-ink font-semibold py-3 rounded-full text-xs transition-all border border-white/15"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PNG</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="flex items-center justify-center gap-2 apple-glass-cta text-white font-semibold py-3 rounded-full text-xs transition-all"
                >
                  <Phone className="w-4 h-4" />
                  <span>Abrir WhatsApp Web</span>
                </button>
              </div>

              {saveMessage && (
                <div className="flex items-start justify-center gap-2 text-xs text-emerald-300 font-semibold text-center">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{saveMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
