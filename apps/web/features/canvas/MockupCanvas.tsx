'use client';

/**
 * @file MockupCanvas.tsx
 * @description Componente React responsivo para renderização interativa do mockup adaptando-se perfeitamente a 100vh
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  MockupModel,
  Pattern,
  MockupElement,
  MockupView,
} from '@mockup/types';
import {
  applyDuotoneToSVG,
  renderCompositeMockup,
  hitTestHandles,
  hitTestElement,
  hitTestMockupPart,
  GarmentPart,
  assetCache,
  HandleType,
  STANDARD_20_COLORS,
  StandardColor,
} from '@mockup/canvas-engine';
import { Palette, Check } from 'lucide-react';

interface MockupCanvasProps {
  model: MockupModel;
  pattern?: Pattern | null;
  backgroundColor?: string;
  colorA: string;
  colorB: string;
  collarColor?: string;
  frontColor?: string;
  backColor?: string;
  sleeveLeftColor?: string;
  sleeveRightColor?: string;
  sleevesColor?: string;
  selectedPart?: GarmentPart;
  elements: MockupElement[];
  view?: MockupView;
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onSelectPart?: (part: GarmentPart) => void;
  onChangeColorA?: (color: string) => void;
  onChangeColorB?: (color: string) => void;
  onChangeBackgroundColor?: (color: string) => void;
  onChangeCollarColor?: (color: string) => void;
  onChangeFrontColor?: (color: string) => void;
  onChangeBackColor?: (color: string) => void;
  onChangeSleeveLeftColor?: (color: string) => void;
  onChangeSleeveRightColor?: (color: string) => void;
  onChangeSleevesColor?: (color: string) => void;
  onChangeElements?: (elements: MockupElement[]) => void;
  width?: number;
  height?: number;
}

export const MockupCanvas: React.FC<MockupCanvasProps> = ({
  model,
  pattern,
  backgroundColor,
  colorA,
  colorB,
  collarColor,
  frontColor,
  backColor,
  sleeveLeftColor,
  sleeveRightColor,
  sleevesColor,
  selectedPart,
  elements,
  view = 'both',
  selectedElementId,
  onSelectElement,
  onSelectPart,
  onChangeColorA,
  onChangeColorB,
  onChangeBackgroundColor,
  onChangeCollarColor,
  onChangeFrontColor,
  onChangeBackColor,
  onChangeSleeveLeftColor,
  onChangeSleeveRightColor,
  onChangeSleevesColor,
  onChangeElements,
  width = 600,
  height = 600,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dynamic responsive canvas size
  const [canvasSize, setCanvasSize] = useState({ width, height });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: containerW, height: containerH } = entry.contentRect;
        if (containerW > 0 && containerH > 0) {
          const side = Math.min(containerW - 16, containerH - 16);
          const finalSize = Math.max(320, Math.floor(side));
          setCanvasSize({ width: finalSize, height: finalSize });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const curWidth = canvasSize.width;
  const curHeight = canvasSize.height;

  // Imagens processadas em cache (Todas as 14 máscaras carregadas)
  const [patternBitmap, setPatternBitmap] = useState<HTMLImageElement | ImageBitmap | null>(null);
  const [bgMaskImage, setBgMaskImage] = useState<HTMLImageElement | null>(null);
  const [frontMaskImage, setFrontMaskImage] = useState<HTMLImageElement | null>(null);
  const [backMaskImage, setBackMaskImage] = useState<HTMLImageElement | null>(null);
  const [sleeveLeftMaskImage, setSleeveLeftMaskImage] = useState<HTMLImageElement | null>(null);
  const [sleeveRightMaskImage, setSleeveRightMaskImage] = useState<HTMLImageElement | null>(null);
  const [collarMaskImage, setCollarMaskImage] = useState<HTMLImageElement | null>(null);
  const [escudoMaskImage, setEscudoMaskImage] = useState<HTMLImageElement | null>(null);
  const [logoFrontMaskImage, setLogoFrontMaskImage] = useState<HTMLImageElement | null>(null);
  const [logoBackMaskImage, setLogoBackMaskImage] = useState<HTMLImageElement | null>(null);
  const [numberFrontMaskImage, setNumberFrontMaskImage] = useState<HTMLImageElement | null>(null);
  const [numberBackMaskImage, setNumberBackMaskImage] = useState<HTMLImageElement | null>(null);
  const [nameBackTopMaskImage, setNameBackTopMaskImage] = useState<HTMLImageElement | null>(null);
  const [nameBackBottomMaskImage, setNameBackBottomMaskImage] = useState<HTMLImageElement | null>(null);
  const [shadowImage, setShadowImage] = useState<HTMLImageElement | null>(null);

  // Estados de Interação do Mouse / Transformações
  const [isInteracting, setIsInteracting] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [initialElementState, setInitialElementState] = useState<MockupElement | null>(null);

  // Floating Contextual Quick-Picker Position
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);

  // Zoom e Pan da viewport
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Auto-foco ao alternar entre Frente, Costas ou Ambos
  useEffect(() => {
    if (view === 'front') {
      setZoom(1.35);
      setPan({ x: curWidth * 0.18, y: 0 });
    } else if (view === 'back') {
      setZoom(1.35);
      setPan({ x: -curWidth * 0.18, y: 0 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [view, curWidth]);

  // 1. Carregamento de todas as 14 Máscaras Modulares e da Camada Superior Multiply
  useEffect(() => {
    let isMounted = true;

    const loadAllAssets = async () => {
      try {
        const [
          loadedShadow,
          loadedBgMask,
          loadedFrontMask,
          loadedBackMask,
          loadedSleeveLeftMask,
          loadedSleeveRightMask,
          loadedCollarMask,
          loadedEscudoMask,
          loadedLogoFrontMask,
          loadedLogoBackMask,
          loadedNumberFrontMask,
          loadedNumberBackMask,
          loadedNameBackTopMask,
          loadedNameBackBottomMask,
        ] = await Promise.all([
          assetCache.loadImage(model.front_shadow_url || '/assets/MOCKUP_MULTIPLAY.png'),
          assetCache.loadImage(model.background_mask_url || '/assets/background_mask.png'),
          assetCache.loadImage(model.front_mask_url || '/assets/frente_mask.png'),
          assetCache.loadImage(model.back_mask_url || '/assets/costas_mask.png'),
          assetCache.loadImage(model.sleeve_left_mask_url || '/assets/manga_esquerda_mask.png'),
          assetCache.loadImage(model.sleeve_right_mask_url || '/assets/mnagas_direita_mask.png'),
          assetCache.loadImage(model.collar_mask_url || '/assets/gola_mask.png'),
          assetCache.loadImage(model.escudo_mask_url || '/assets/escudo_mask.png'),
          assetCache.loadImage(model.logomarca_frente_mask_url || '/assets/logomarca_frente_mask.png'),
          assetCache.loadImage(model.logomarca_costas_mask_url || '/assets/logomarca_costas_mask.png'),
          assetCache.loadImage(model.numero_frente_mask_url || '/assets/numero_frente_mask.png'),
          assetCache.loadImage(model.numero_costas_mask_url || '/assets/numero_costas_mask.png'),
          assetCache.loadImage(model.nome_costas_acima_mask_url || '/assets/nome_costas_acima_mask.png'),
          assetCache.loadImage(model.nome_costas_barra_mask_url || '/assets/nome_costas_barra_mask.png'),
        ]);

        if (isMounted) {
          setShadowImage(loadedShadow);
          setBgMaskImage(loadedBgMask);
          setFrontMaskImage(loadedFrontMask);
          setBackMaskImage(loadedBackMask);
          setSleeveLeftMaskImage(loadedSleeveLeftMask);
          setSleeveRightMaskImage(loadedSleeveRightMask);
          setCollarMaskImage(loadedCollarMask);
          setEscudoMaskImage(loadedEscudoMask);
          setLogoFrontMaskImage(loadedLogoFrontMask);
          setLogoBackMaskImage(loadedLogoBackMask);
          setNumberFrontMaskImage(loadedNumberFrontMask);
          setNumberBackMaskImage(loadedNumberBackMask);
          setNameBackTopMaskImage(loadedNameBackTopMask);
          setNameBackBottomMaskImage(loadedNameBackBottomMask);
        }
      } catch (err) {
        console.error('Erro ao carregar máscaras e texturas do modelo:', err);
      }
    };

    loadAllAssets();
    return () => {
      isMounted = false;
    };
  }, [model]);

  // 2. Processamento de Estampas e Texturas (SVG Duotone ou Imagens PNG/JPG/WebP)
  useEffect(() => {
    let isMounted = true;

    const processPattern = async () => {
      if (!pattern || !pattern.svg_file_url) {
        setPatternBitmap(null);
        return;
      }

      try {
        const url = pattern.svg_file_url;
        if (url.startsWith('<svg')) {
          const resultBitmap = await applyDuotoneToSVG(url, colorA, colorB);
          if (isMounted) setPatternBitmap(resultBitmap);
        } else if (url.startsWith('data:image/svg') || url.endsWith('.svg')) {
          const res = await fetch(url);
          const svgRaw = await res.text();
          const resultBitmap = await applyDuotoneToSVG(svgRaw, colorA, colorB);
          if (isMounted) setPatternBitmap(resultBitmap);
        } else {
          // Carrega imagem raster (PNG, JPG, WebP)
          const loadedImg = await assetCache.loadImage(url);
          if (isMounted) setPatternBitmap(loadedImg);
        }
      } catch (err) {
        console.error('Erro ao processar estampa/textura:', err);
      }
    };

    processPattern();
    return () => {
      isMounted = false;
    };
  }, [pattern, colorA, colorB]);

  // 3. Pré-carregamento dos logos
  useEffect(() => {
    elements.forEach(async (el) => {
      if (el.type === 'logo' && el.url) {
        try {
          const img = await assetCache.loadImage(el.url);
          (el as unknown as { _imageInstance?: HTMLImageElement })._imageInstance = img;
        } catch {
          // Ignora falha de logo
        }
      }
    });
  }, [elements]);

  // 4. Renderização do Canvas (Composição em Camadas)
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = curWidth * dpr;
    canvas.height = curHeight * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Aplica Pan e Zoom da Viewport
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Filtra elementos para a visualização atual
    const visibleElements =
      view === 'both'
        ? elements
        : elements.filter((el) => el.view === view || el.view === 'both' || !el.view);

    renderCompositeMockup({
      ctx,
      canvasWidth: curWidth,
      canvasHeight: curHeight,
      backgroundMask: bgMaskImage,
      frontMask: frontMaskImage,
      backMask: backMaskImage,
      sleeveLeftMask: sleeveLeftMaskImage,
      sleeveRightMask: sleeveRightMaskImage,
      collarMask: collarMaskImage,
      patternImage: patternBitmap,
      shadowImage,
      backgroundColor: backgroundColor || '#ffffff',
      colorA,
      colorB,
      collarColor: collarColor || colorB,
      frontColor: frontColor || colorA,
      backColor: backColor || colorA,
      sleeveLeftColor: sleeveLeftColor || sleevesColor || colorA,
      sleeveRightColor: sleeveRightColor || sleevesColor || colorA,
      sleevesColor: sleevesColor || colorA,
      elements: visibleElements,
      view: 'front',
      selectedElementId,
      showBoundingBoxes: true,
    });

    ctx.restore();
  }, [
    curWidth,
    curHeight,
    pan,
    zoom,
    view,
    bgMaskImage,
    frontMaskImage,
    backMaskImage,
    sleeveLeftMaskImage,
    sleeveRightMaskImage,
    collarMaskImage,
    patternBitmap,
    shadowImage,
    backgroundColor,
    colorA,
    colorB,
    collarColor,
    frontColor,
    backColor,
    sleeveLeftColor,
    sleeveRightColor,
    sleevesColor,
    elements,
    selectedElementId,
  ]);

  useEffect(() => {
    drawScene();
  }, [drawScene]);

  // 5. Coordenadas Locais com Zoom e Pan
  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement>
  ): { x: number; y: number; screenX: number; screenY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, screenX: 0, screenY: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const localX = (rawX - pan.x) / zoom;
    const localY = (rawY - pan.y) / zoom;

    return { x: localX, y: localY, screenX: rawX, screenY: rawY };
  };

  // 6. Manipulação de Eventos do Mouse (Seleção Direta ao Clicar na Peça)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const { x, y, screenX, screenY } = getCanvasCoords(e);

    // 1. Verifica se clicou em uma alça do elemento ativo
    if (selectedElementId) {
      const selectedEl = elements.find((el) => el.id === selectedElementId);
      if (selectedEl) {
        const handle = hitTestHandles({ x, y }, selectedEl, curWidth, curHeight);
        if (handle) {
          setActiveHandle(handle);
          setIsInteracting(true);
          setDragStartPos({ x, y });
          setInitialElementState({ ...selectedEl });
          return;
        }
      }
    }

    // 2. Verifica se clicou em algum Decal (Logo, Nome, Número)
    const reversed = [...elements].reverse();
    for (const el of reversed) {
      if (hitTestElement({ x, y }, el, curWidth, curHeight)) {
        onSelectElement?.(el.id);
        onSelectPart?.(null);
        setFloatingPos(null);

        // Se o elemento for travado (ex: escudo oficial), não inicia arrasto nem manipulação
        if (!el.locked && el.slot !== 'escudo') {
          setActiveHandle('body');
          setIsInteracting(true);
          setDragStartPos({ x, y });
          setInitialElementState({ ...el });
        }
        return;
      }
    }

    // 3. HIT-TEST DAS PARTES MODULARES E ZONAS DE DECAL
    const hitPart = hitTestMockupPart({ x, y }, curWidth, curHeight, {
      collarMask: collarMaskImage,
      frontMask: frontMaskImage,
      backMask: backMaskImage,
      sleeveLeftMask: sleeveLeftMaskImage,
      sleeveRightMask: sleeveRightMaskImage,
      escudoMask: escudoMaskImage,
      logoFrontMask: logoFrontMaskImage,
      logoBackMask: logoBackMaskImage,
      numberFrontMask: numberFrontMaskImage,
      numberBackMask: numberBackMaskImage,
      nameBackTopMask: nameBackTopMaskImage,
      nameBackBottomMask: nameBackBottomMaskImage,
    });

    if (hitPart) {
      onSelectElement?.(null);
      onSelectPart?.(hitPart);
      setFloatingPos({
        x: Math.min(curWidth - 240, Math.max(10, screenX - 100)),
        y: Math.max(10, screenY - 80),
      });
      return;
    }

    // Clique fora
    onSelectElement?.(null);
    onSelectPart?.(null);
    setFloatingPos(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (!isInteracting || !activeHandle || !dragStartPos || !initialElementState) return;

    const { x, y } = getCanvasCoords(e);
    const dx = x - dragStartPos.x;
    const dy = y - dragStartPos.y;

    const updated = { ...initialElementState };

    if (activeHandle === 'body') {
      updated.x = initialElementState.x + dx / curWidth;
      updated.y = initialElementState.y + dy / curHeight;
    } else if (activeHandle === 'rotate') {
      const centerX = initialElementState.x * curWidth;
      const centerY = initialElementState.y * curHeight;
      const angleRad = Math.atan2(y - centerY, x - centerX);
      updated.rotation = angleRad + Math.PI / 2;
    } else if (activeHandle.startsWith('scale')) {
      const scaleDelta = (dx + dy) / (curWidth * 0.5);
      const newScale = Math.max(0.05, initialElementState.scaleX + scaleDelta);
      updated.scaleX = newScale;
      updated.scaleY = newScale;
    }

    onChangeElements?.(elements.map((el) => (el.id === updated.id ? updated : el)));
  };

  const handleMouseUp = () => {
    setIsInteracting(false);
    setActiveHandle(null);
    setDragStartPos(null);
    setInitialElementState(null);
    setIsPanning(false);
  };

  // Cor ativa para a parte selecionada
  const getPartColor = (part: GarmentPart): string => {
    switch (part) {
      case 'collar':
        return collarColor || colorB;
      case 'front':
        return frontColor || colorA;
      case 'back':
        return backColor || colorA;
      case 'sleeve_left':
        return sleeveLeftColor || sleevesColor || colorA;
      case 'sleeve_right':
        return sleeveRightColor || sleevesColor || colorA;
      case 'sleeves':
        return sleevesColor || colorA;
      case 'body':
      default:
        return colorA;
    }
  };

  const currentActiveColor = getPartColor(selectedPart || null);

  const handlePartColorChange = (hex: string) => {
    switch (selectedPart) {
      case 'collar':
        onChangeCollarColor?.(hex);
        break;
      case 'front':
        onChangeFrontColor?.(hex);
        onChangeColorA?.(hex);
        break;
      case 'back':
        onChangeBackColor?.(hex);
        break;
      case 'sleeve_left':
        onChangeSleeveLeftColor?.(hex);
        break;
      case 'sleeve_right':
        onChangeSleeveRightColor?.(hex);
        break;
      case 'sleeves':
        onChangeSleevesColor?.(hex);
        break;
      case 'body':
      default:
        onChangeColorA?.(hex);
        onChangeColorB?.(hex);
        onChangeBackgroundColor?.(hex);
        break;
    }
  };

  const getPartTitle = (part: GarmentPart): string => {
    switch (part) {
      case 'collar':
        return 'Gola Careca';
      case 'front':
        return 'Frente da Camisa';
      case 'back':
        return 'Costas da Camisa';
      case 'sleeve_left':
        return 'Manga Esquerda';
      case 'sleeve_right':
        return 'Manga Direita';
      case 'sleeves':
        return 'Mangas';
      case 'escudo':
        return 'Escudo / Brasão (Peito)';
      case 'logomarca_frente':
        return 'Patrocínio Frente';
      case 'logomarca_costas':
        return 'Patrocínio Costas';
      case 'numero_frente':
        return 'Número Frontal';
      case 'numero_costas':
        return 'Número Dorsal';
      case 'nome_costas_acima':
        return 'Nome do Atleta (Costas)';
      case 'nome_costas_barra':
        return 'Texto da Barra (Costas)';
      case 'body':
      default:
        return 'Corpo da Camisa';
    }
  };

  const activeColorObj =
    STANDARD_20_COLORS.find(
      (c) => c.hex.toLowerCase() === currentActiveColor.toLowerCase()
    ) || STANDARD_20_COLORS[0];

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-center w-full h-full min-h-0 select-none overflow-hidden studio-canvas-grid rounded-3xl border border-wise-border bg-white shadow-wise p-2"
    >
      {/* Controles Flutuantes da Viewport (Zoom / Pan Reset) */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-wise-border shadow-sm text-xs text-wise-ink font-bold">
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
          className="p-1 hover:text-wise-on-primary hover:bg-wise-primary rounded-full transition-colors"
          title="Diminuir Zoom"
        >
          -
        </button>
        <span className="w-10 text-center font-mono text-[11px] font-bold">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(3.0, z + 0.15))}
          className="p-1 hover:text-wise-on-primary hover:bg-wise-primary rounded-full transition-colors"
          title="Aumentar Zoom"
        >
          +
        </button>
        <button
          onClick={() => {
            if (view === 'front') {
              setZoom(1.35);
              setPan({ x: curWidth * 0.18, y: 0 });
            } else if (view === 'back') {
              setZoom(1.35);
              setPan({ x: -curWidth * 0.18, y: 0 });
            } else {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }
          }}
          className="ml-1 px-2 py-0.5 text-[9px] bg-wise-canvas-soft hover:bg-wise-border rounded-full transition-colors font-bold"
        >
          Reset
        </button>
      </div>

      {/* FLOATING QUICK COLOR PICKER COM AS 20 CORES PADRÃO TRAVADAS */}
      {selectedPart && floatingPos && (
        <div
          style={{ left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }}
          className="absolute z-30 bg-white/95 backdrop-blur-md border border-wise-border rounded-2xl p-2.5 shadow-wise-lg space-y-1.5 animate-in fade-in zoom-in-95 duration-150 max-w-[230px]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-wise-border pb-1">
            <div className="flex items-center gap-1 text-[11px] font-black text-wise-ink truncate">
              <Palette className="w-3 h-3 text-wise-ink shrink-0" />
              <span className="truncate">{getPartTitle(selectedPart)}</span>
            </div>
            <span className="text-[9px] font-mono font-black text-wise-ink-deep bg-wise-primary-pale px-1.5 py-0.5 rounded-full shrink-0">
              {activeColorObj.pantone}
            </span>
          </div>

          {/* Grid compacto das 20 cores travadas (10 x 2) */}
          <div className="grid grid-cols-10 gap-1">
            {STANDARD_20_COLORS.map((c: StandardColor) => (
              <button
                key={c.id}
                onClick={() => handlePartColorChange(c.hex)}
                className={`h-5 w-5 rounded-md border border-wise-border hover:scale-125 transition-transform shadow-xs flex items-center justify-center relative ${
                  currentActiveColor.toLowerCase() === c.hex.toLowerCase()
                    ? 'ring-1.5 ring-wise-ink scale-110 z-10'
                    : ''
                }`}
                style={{ backgroundColor: c.hex }}
                title={`${c.name} (${c.pantone})`}
              >
                {currentActiveColor.toLowerCase() === c.hex.toLowerCase() && (
                  <Check
                    className={`w-2.5 h-2.5 stroke-[3] rounded-full ${
                      ['#ffffff', '#7dd3fc', '#38bdf8', '#facc15', '#eab308', '#22c55e', '#94a3b8'].includes(
                        c.hex.toLowerCase()
                      )
                        ? 'text-wise-ink bg-black/15'
                        : 'text-white bg-black/30'
                    }`}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas Element com Dimensionamento Responsivo */}
      <canvas
        ref={canvasRef}
        style={{
          width: `${curWidth}px`,
          height: `${curHeight}px`,
          cursor: isPanning ? 'grab' : activeHandle ? 'crosshair' : 'pointer',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="touch-none shadow-sm rounded-2xl max-w-full max-h-full"
      />
    </div>
  );
};
