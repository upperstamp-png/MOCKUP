'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ApparelModel,
  Pattern,
  MockupElement,
  MockupView,
} from '@mockup/types';
import { Header } from '@/components/Header';
import { MockupCanvas } from '@/features/canvas/MockupCanvas';
import { StandardColorGrid } from '@/components/StandardColorGrid';
import { DecalManager } from '@/components/DecalManager';
import { ExportModal } from '@/components/ExportModal';
import { useMockupStore, GarmentPart } from '@/features/studio/store/mockupStore';
import { useHistoryStore } from '@/features/studio/store/historyStore';
import { useSessionStore } from '@/features/studio/store/sessionStore';
import {
  AlertCircle,
  Shirt,
  Sparkles,
  Layers,
  Check,
} from 'lucide-react';

// ==========================================
// SEED INLINE ASSETS PARA FALLBACK
// ==========================================

const DEFAULT_SVG_PATTERNS: Pattern[] = [
  {
    id: 'pat_thunder',
    title: 'Thunder',
    category: 'Esportivo',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <polygon points="0,0 400,0 200,800 0,800" fill="#ffffff" fill-opacity="0.9"/>
      <polygon points="450,0 800,0 600,800 250,800" fill="#ffffff" fill-opacity="0.6"/>
      <polygon points="650,0 800,0 800,800 700,800" fill="#ffffff" fill-opacity="0.3"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pat_stripes',
    title: 'Listras',
    category: 'Futebol',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <rect x="100" y="0" width="100" height="800" fill="#ffffff"/>
      <rect x="300" y="0" width="100" height="800" fill="#ffffff"/>
      <rect x="500" y="0" width="100" height="800" fill="#ffffff"/>
      <rect x="700" y="0" width="100" height="800" fill="#ffffff"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pat_chevron',
    title: 'Chevron',
    category: 'Moderno',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <path d="M0,100 L400,300 L800,100 L800,200 L400,400 L0,200 Z" fill="#ffffff"/>
      <path d="M0,300 L400,500 L800,300 L800,400 L400,600 L0,400 Z" fill="#ffffff"/>
      <path d="M0,500 L400,700 L800,500 L800,600 L400,800 L0,600 Z" fill="#ffffff"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pat_camo',
    title: 'Camuflado',
    category: 'Tático',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <rect x="50" y="50" width="120" height="120" fill="#ffffff" fill-opacity="0.8"/>
      <rect x="250" y="100" width="180" height="100" fill="#ffffff" fill-opacity="0.5"/>
      <rect x="500" y="80" width="140" height="150" fill="#ffffff" fill-opacity="0.7"/>
      <rect x="100" y="300" width="160" height="120" fill="#ffffff" fill-opacity="0.6"/>
      <rect x="400" y="350" width="200" height="140" fill="#ffffff" fill-opacity="0.8"/>
      <rect x="150" y="550" width="180" height="160" fill="#ffffff" fill-opacity="0.7"/>
      <rect x="450" y="600" width="220" height="120" fill="#ffffff" fill-opacity="0.5"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
];

const DEFAULT_MODELS: ApparelModel[] = [
  {
    id: 'model_camisa_gola_careca',
    title: 'Camisa Gola Careca',
    category: 'futebol',
    front_shadow_url: '/assets/MOCKUP_MULTIPLAY.png',
    back_shadow_url: '/assets/MOCKUP_MULTIPLAY.png',
    mask_url: '/assets/background_mask.png',
    background_mask_url: '/assets/background_mask.png',
    front_mask_url: '/assets/frente_mask.png',
    back_mask_url: '/assets/costas_mask.png',
    sleeve_left_mask_url: '/assets/manga_esquerda_mask.png',
    sleeve_right_mask_url: '/assets/mnagas_direita_mask.png',
    collar_mask_url: '/assets/gola_mask.png',
    escudo_mask_url: '/assets/escudo_mask.png',
    logomarca_frente_mask_url: '/assets/logomarca_frente_mask.png',
    logomarca_costas_mask_url: '/assets/logomarca_costas_mask.png',
    numero_frente_mask_url: '/assets/numero_frente_mask.png',
    numero_costas_mask_url: '/assets/numero_costas_mask.png',
    nome_costas_acima_mask_url: '/assets/nome_costas_acima_mask.png',
    nome_costas_barra_mask_url: '/assets/nome_costas_barra_mask.png',
    thumbnail_url: '/assets/MOCKUP_MULTIPLAY.png',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function StudioContent() {
  const searchParams = useSearchParams();
  const reopenExportId = searchParams.get('reopen');

  // Zustand Stores
  const {
    modelId,
    view,
    colorA,
    colorB,
    backgroundColor,
    collarColor,
    frontColor,
    backColor,
    sleeveLeftColor,
    sleeveRightColor,
    sleevesColor,
    selectedPart,
    elements,
    selectedElementId,
    setPattern,
    setColorA,
    setColorB,
    setCollarColor,
    setFrontColor,
    setBackColor,
    setSleeveLeftColor,
    setSleeveRightColor,
    setSleevesColor,
    setSelectedPart,
    setSelectedElementId,
    updateElementsBatch,
    loadLayerState,
    getLayerState,
  } = useMockupStore();

  const { pushSnapshot, undo, redo, past, future } = useHistoryStore();
  const { isSessionLimitReached, startHeartbeat, stopHeartbeat } = useSessionStore();

  const [models] = useState<ApparelModel[]>(DEFAULT_MODELS);
  const [patterns] = useState<Pattern[]>(DEFAULT_SVG_PATTERNS);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<'customizer' | 'decals'>('customizer');

  // Inicialização de Sessão & Heartbeat
  useEffect(() => {
    startHeartbeat('Notebook Vendas');
    return () => stopHeartbeat();
  }, [startHeartbeat, stopHeartbeat]);

  // Se um elemento decal for selecionado, muda a aba para Decals automaticamente
  useEffect(() => {
    if (selectedElementId) {
      setInfoTab('decals');
    }
  }, [selectedElementId]);

  // Se uma parte da camisa for clicada, muda a aba para Customizer automaticamente
  useEffect(() => {
    if (selectedPart) {
      setInfoTab('customizer');
    }
  }, [selectedPart]);

  // Reabrir Mockup do Histórico
  useEffect(() => {
    if (!reopenExportId) return;

    async function loadExport() {
      try {
        const token = localStorage.getItem('mockup_auth_token');
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4444/api/v1';
        const res = await fetch(`${apiBase}/exports/${reopenExportId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const exportData = await res.json();
          if (exportData?.layer_state) {
            const matchedModel = models.find((m) => m.id === exportData.layer_state.modelId) || models[0];
            const matchedPattern = patterns.find((p) => p.id === exportData.layer_state.patternId);
            loadLayerState(exportData.layer_state, matchedModel, matchedPattern);
          }
        }
      } catch (err) {
        console.error('Erro ao reabrir mockup:', err);
      }
    }

    loadExport();
  }, [reopenExportId, models, patterns, loadLayerState]);

  const currentModel = models.find((m) => m.id === modelId) || models[0];
  const currentPattern = patterns.find((p) => p.id === useMockupStore.getState().patternId) || null;

  const handleElementsChange = (newElements: MockupElement[]) => {
    updateElementsBatch(newElements);
    pushSnapshot(getLayerState());
  };

  const handleUndo = () => {
    const prevState = undo(getLayerState());
    if (prevState) loadLayerState(prevState);
  };

  const handleRedo = () => {
    const nextState = redo(getLayerState());
    if (nextState) loadLayerState(nextState);
  };

  const getPartBadgeLabel = () => {
    switch (selectedPart) {
      case 'collar':
        return '🧣 Editando: Gola Careca';
      case 'front':
        return '👕 Editando: Frente da Camisa';
      case 'back':
        return '👕 Editando: Costas da Camisa';
      case 'sleeve_left':
        return '💪 Editando: Manga Esquerda';
      case 'sleeve_right':
        return '💪 Editando: Manga Direita';
      default:
        return '👕 Editando: Uniforme';
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-wise-canvas-soft">
      {/* Session Limit Banner */}
      {isSessionLimitReached && (
        <div className="bg-wise-warning text-wise-warning-content px-6 py-2 text-xs font-black flex items-center justify-between z-50 border-b border-wise-warning-deep/20 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-wise-warning-deep" />
            <span>Limite de terminais simultâneos atingido no plano. Encerre sessões antigas para continuar.</span>
          </div>
        </div>
      )}

      {/* Header Unificado */}
      <Header
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        modelTitle={currentModel.title}
      />

      {/* Main Studio View - DIVISÃO EXATA 50% ESQUERDA (INFORMAÇÕES) / 50% DIREITA (VIEW) OTIMIZADO EM 100VH */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ========================================================= */}
        {/* BLOCO DA ESQUERDA (50%): ESTRUTURA SEQUENCIAL COMPACTA    */}
        {/* ========================================================= */}
        <div className="w-1/2 bg-wise-canvas border-r border-wise-border p-4 overflow-y-auto flex flex-col gap-3.5 select-none shadow-xs">
          {/* Navegação de Abas Superiores */}
          <div className="flex bg-wise-canvas-soft p-1 rounded-full border border-wise-border shrink-0">
            <button
              onClick={() => setInfoTab('customizer')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-black rounded-full transition-all ${
                infoTab === 'customizer'
                  ? 'bg-wise-canvas text-wise-ink shadow-sm'
                  : 'text-wise-body hover:text-wise-ink'
              }`}
            >
              <Shirt className="w-3.5 h-3.5" />
              <span>Personalização do Uniforme</span>
            </button>

            <button
              onClick={() => setInfoTab('decals')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-black rounded-full transition-all ${
                infoTab === 'decals'
                  ? 'bg-wise-canvas text-wise-ink shadow-sm'
                  : 'text-wise-body hover:text-wise-ink'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Logos, Nomes & Números</span>
            </button>
          </div>

          {/* ========================================================= */}
          {/* ESTRUTURA SEQUENCIAL DO MENU ESQUERDO                     */}
          {/* ========================================================= */}
          {infoTab === 'customizer' && (
            <div className="space-y-3.5">
              {/* ---------------------------------------------------- */}
              {/* 1. ESCOLHER MODELO DE CAMISA                         */}
              {/* ---------------------------------------------------- */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-wise-mute uppercase tracking-wider flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-wise-ink text-white inline-flex items-center justify-center text-[9px]">1</span>
                    Modelo de Camisa
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-wise-primary-pale text-wise-ink-deep font-bold">
                    Ativo
                  </span>
                </div>

                <div className="py-2 px-3 rounded-2xl bg-wise-primary-pale/40 border border-wise-primary flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white border border-wise-border flex items-center justify-center p-1 shadow-xs">
                      <img
                        src={currentModel.thumbnail_url || '/assets/MOCKUP_MULTIPLAY.png'}
                        alt={currentModel.title}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-black text-wise-ink uppercase block leading-none">
                        {currentModel.title}
                      </span>
                      <p className="text-[10px] text-wise-body font-medium mt-0.5">
                        Frente & Costas (Máscaras separadas)
                      </p>
                    </div>
                  </div>

                  <span className="w-5 h-5 rounded-full bg-wise-primary text-wise-on-primary flex items-center justify-center shadow-xs shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                </div>
              </div>

              {/* ---------------------------------------------------- */}
              {/* 2. COR DA GOLA (TROCA APENAS A COR DA GOLA)          */}
              {/* ---------------------------------------------------- */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-wise-mute uppercase tracking-wider flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-wise-ink text-white inline-flex items-center justify-center text-[9px]">2</span>
                    Cor da Gola
                  </span>
                  <span className="text-[9px] text-wise-body font-medium">
                    (Ou clique na gola no canvas)
                  </span>
                </div>

                <StandardColorGrid
                  label="Gola Careca"
                  sublabel="Troca exclusivamente a gola de acordo com a máscara"
                  selectedColor={collarColor}
                  onChange={(hex) => {
                    setCollarColor(hex); // Troca APENAS a cor da gola
                    pushSnapshot(getLayerState());
                  }}
                />
              </div>

              {/* ---------------------------------------------------- */}
              {/* 3. TEXTURAS (TROCA A TEXTURA DO TECIDO)              */}
              {/* ---------------------------------------------------- */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-wise-mute uppercase tracking-wider flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-wise-ink text-white inline-flex items-center justify-center text-[9px]">3</span>
                    Texturas
                  </span>
                  <span className="text-[9px] font-bold text-wise-mute">
                    {patterns.length + 1} opções
                  </span>
                </div>

                <div className="p-2.5 rounded-2xl bg-wise-canvas-soft border border-wise-border">
                  <div className="grid grid-cols-5 gap-1.5">
                    {/* Botão Sem Textura (Liso) */}
                    <button
                      onClick={() => {
                        setPattern(null);
                        pushSnapshot(getLayerState());
                      }}
                      className={`flex flex-col items-center p-1.5 rounded-xl border text-left transition-all ${
                        currentPattern === null
                          ? 'bg-wise-canvas border-wise-primary shadow-sm text-wise-ink'
                          : 'bg-wise-canvas/60 border-wise-border text-wise-body hover:border-wise-mute'
                      }`}
                    >
                      <div className="w-full aspect-square rounded-lg bg-white border border-wise-border flex items-center justify-center mb-0.5 text-wise-ink">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-bold text-center leading-tight">Liso</span>
                    </button>

                    {/* Lista de Texturas */}
                    {patterns.map((p) => {
                      const isSelected = currentPattern?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setPattern(p);
                            pushSnapshot(getLayerState());
                          }}
                          className={`flex flex-col items-center p-1.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-wise-canvas border-wise-primary shadow-sm text-wise-ink'
                              : 'bg-wise-canvas/60 border-wise-border text-wise-body hover:border-wise-mute'
                          }`}
                        >
                          <div className="w-full aspect-square rounded-lg bg-white border border-wise-border flex items-center justify-center mb-0.5">
                            <Sparkles className={`w-3.5 h-3.5 ${isSelected ? 'text-wise-ink' : 'text-wise-mute'}`} />
                          </div>
                          <span className="text-[10px] font-bold text-center line-clamp-1 leading-tight">
                            {p.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ---------------------------------------------------- */}
              {/* 4. CORES DAS TEXTURAS: COR 1 E COR 2                 */}
              {/* ---------------------------------------------------- */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-wise-border pb-1">
                  <span className="text-[10px] font-black text-wise-mute uppercase tracking-wider flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-wise-ink text-white inline-flex items-center justify-center text-[9px]">4</span>
                    Cores das Texturas
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-wise-primary-pale text-wise-ink-deep font-bold">
                    20 Cores Oficiais
                  </span>
                </div>

                {/* 4.1 Cor 1 da Textura */}
                <StandardColorGrid
                  label="Cor 1 da Textura"
                  sublabel="Tom primário"
                  selectedColor={colorA}
                  onChange={(hex) => {
                    setColorA(hex);
                    pushSnapshot(getLayerState());
                  }}
                />

                {/* 4.2 Cor 2 da Textura */}
                <StandardColorGrid
                  label="Cor 2 da Textura"
                  sublabel="Tom secundário"
                  selectedColor={colorB}
                  onChange={(hex) => {
                    setColorB(hex);
                    pushSnapshot(getLayerState());
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB: DECALS (LOGOS, NOMES, NÚMEROS) */}
          {infoTab === 'decals' && (
            <div className="space-y-3">
              <DecalManager
                elements={elements}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onAddElement={(newEl) => {
                  const targetView: MockupView = view === 'back' ? 'back' : 'front';
                  const elementWithView = { ...newEl, view: targetView };
                  useMockupStore.getState().addElement(elementWithView);
                  pushSnapshot(getLayerState());
                }}
                onUpdateElement={(upEl) => {
                  useMockupStore.getState().updateElement(upEl);
                  pushSnapshot(getLayerState());
                }}
                onRemoveElement={(delId) => {
                  useMockupStore.getState().removeElement(delId);
                  pushSnapshot(getLayerState());
                }}
              />
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* BLOCO DA DIREITA (50%): VIEW DO MOCKUP (INTERATIVO)       */}
        {/* ========================================================= */}
        <div className="w-1/2 bg-wise-canvas-soft p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-0">
          {/* Header Superior da View (Apenas badge contextual se houver parte selecionada) */}
          {selectedPart && (
            <div className="w-full flex items-center justify-end mb-2 shrink-0">
              <span className="px-2.5 py-0.5 rounded-full bg-wise-primary text-wise-on-primary font-black text-[10px] animate-pulse">
                {getPartBadgeLabel()}
              </span>
            </div>
          )}

          {/* Canvas Viewport 50% Grande com Dimensionamento Responsivo */}
          <div className="w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            <MockupCanvas
              model={currentModel}
              pattern={currentPattern}
              backgroundColor={backgroundColor}
              colorA={colorA}
              colorB={colorB}
              collarColor={collarColor}
              frontColor={frontColor}
              backColor={backColor}
              sleeveLeftColor={sleeveLeftColor}
              sleeveRightColor={sleeveRightColor}
              sleevesColor={sleevesColor}
              selectedPart={selectedPart}
              elements={elements}
              view={view}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onSelectPart={(part: GarmentPart) => setSelectedPart(part)}
              onChangeColorA={(cA) => {
                setColorA(cA);
                pushSnapshot(getLayerState());
              }}
              onChangeColorB={(cB) => {
                setColorB(cB);
                pushSnapshot(getLayerState());
              }}
              onChangeCollarColor={(cC) => {
                setCollarColor(cC);
                pushSnapshot(getLayerState());
              }}
              onChangeFrontColor={(fc) => {
                setFrontColor(fc);
                pushSnapshot(getLayerState());
              }}
              onChangeBackColor={(bc) => {
                setBackColor(bc);
                pushSnapshot(getLayerState());
              }}
              onChangeSleeveLeftColor={(slc) => {
                setSleeveLeftColor(slc);
                pushSnapshot(getLayerState());
              }}
              onChangeSleeveRightColor={(src) => {
                setSleeveRightColor(src);
                pushSnapshot(getLayerState());
              }}
              onChangeSleevesColor={(cS) => {
                setSleevesColor(cS);
                pushSnapshot(getLayerState());
              }}
              onChangeElements={handleElementsChange}
            />
          </div>
        </div>
      </div>

      {/* Modal de Exportação */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        model={currentModel}
        pattern={currentPattern}
        colorA={colorA}
        colorB={colorB}
        elements={elements}
        getLayerState={getLayerState}
      />
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-wise-canvas-soft flex items-center justify-center text-xs text-wise-mute">Carregando Studio...</div>}>
      <StudioContent />
    </Suspense>
  );
}
