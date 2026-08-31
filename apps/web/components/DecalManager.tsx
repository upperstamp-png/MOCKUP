'use client';

import React, { useState } from 'react';
import {
  MockupElement,
  LogoElement,
  TextElement,
  NumberElement,
  MockupView,
} from '@mockup/types';
import {
  Upload,
  Type,
  Hash,
  Trash2,
  Plus,
  Shield,
  Briefcase,
  Wand2,
  Loader2,
} from 'lucide-react';
import { removeImageBackground } from '@/lib/background-remover';

interface DecalManagerProps {
  elements: MockupElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onAddElement: (element: MockupElement) => void;
  onUpdateElement?: (element: MockupElement) => void;
  onRemoveElement: (id: string) => void;
}

const SPORTS_FONTS = [
  { name: 'Impact Pro', value: 'Impact, sans-serif' },
  { name: 'Inter Sport', value: 'Inter, sans-serif' },
  { name: 'Trebuchet Bold', value: 'Trebuchet MS, sans-serif' },
  { name: 'Arial Black', value: 'Arial Black, sans-serif' },
  { name: 'Courier Tech', value: 'Courier New, monospace' },
];

export const DecalManager: React.FC<DecalManagerProps> = ({
  elements,
  selectedElementId,
  onSelectElement,
  onAddElement,
  onUpdateElement,
  onRemoveElement,
}) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'logo' | 'text' | 'number'>('quick');
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  // Form states
  const [inputText, setInputText] = useState('SILVA');
  const [inputNumber, setInputNumber] = useState('10');
  const [selectedFont, setSelectedFont] = useState('Impact, sans-serif');
  const [textColor, setTextColor] = useState('#ffffff');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const strokeWidth = 4;

  // Upload genérico de Logo com remoção de fundo por IA e Auto-Trim rente ao elemento
  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    customSlot?: {
      x: number;
      y: number;
      scale?: number;
      normWidth?: number;
      normHeight?: number;
      view?: MockupView;
      locked?: boolean;
      slot?: string;
    }
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let finalUrl: string;
      let finalWidth = 300;
      let finalHeight = 300;

      if (autoRemoveBg) {
        setIsRemovingBg(true);
        const res = await removeImageBackground(file, { mode: 'auto', autoTrim: true });
        finalUrl = res.url;
        finalWidth = res.width;
        finalHeight = res.height;
        setIsRemovingBg(false);
      } else {
        finalUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });
      }

      const img = new Image();
      img.onload = () => {
        const natW = finalWidth || img.naturalWidth || img.width || 300;
        const natH = finalHeight || img.naturalHeight || img.height || 300;
        const newLogo: LogoElement = {
          id: `logo_${Date.now()}`,
          type: 'logo',
          x: customSlot ? customSlot.x : 0.33,
          y: customSlot ? customSlot.y : 0.45,
          scaleX: customSlot?.scale || 0.22,
          scaleY: customSlot?.scale || 0.22,
          rotation: 0,
          opacity: 1,
          visible: true,
          view: customSlot?.view || 'both',
          zIndex: elements.length + 1,
          url: finalUrl,
          naturalWidth: natW,
          naturalHeight: natH,
          aspectRatio: natW / natH,
          locked: customSlot?.locked,
          slot: customSlot?.slot,
          normWidth: customSlot?.normWidth,
          normHeight: customSlot?.normHeight,
        };
        onAddElement(newLogo);
        onSelectElement(newLogo.id);
      };
      img.src = finalUrl;
    } catch (err) {
      console.error('Erro ao processar imagem de logo:', err);
      setIsRemovingBg(false);
    }
  };

  // Remoção de fundo manual sob demanda para um logo já adicionado
  const handleRemoveBackgroundManual = async (elementId: string) => {
    const el = elements.find((item) => item.id === elementId);
    if (!el || el.type !== 'logo') return;

    try {
      setIsRemovingBg(true);
      const res = await removeImageBackground((el as LogoElement).url, { mode: 'auto', autoTrim: true });
      setIsRemovingBg(false);

      if (onUpdateElement) {
        onUpdateElement({
          ...el,
          url: res.url,
          naturalWidth: res.width,
          naturalHeight: res.height,
          aspectRatio: res.width / res.height,
        } as LogoElement);
      }
    } catch (err) {
      console.error('Erro ao remover fundo:', err);
      setIsRemovingBg(false);
    }
  };

  // Adicionar Texto (Nome de Jogador)
  const handleAddText = (customSlot?: {
    x: number;
    y: number;
    view?: MockupView;
    normWidth?: number;
    normHeight?: number;
    locked?: boolean;
    slot?: string;
  }) => {
    if (!inputText.trim()) return;

    const newText: TextElement = {
      id: `text_${Date.now()}`,
      type: 'text',
      x: customSlot ? customSlot.x : 0.6826,
      y: customSlot ? customSlot.y : 0.3641,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      view: customSlot?.view || 'both',
      zIndex: elements.length + 1,
      text: inputText.trim().toUpperCase(),
      fontFamily: selectedFont,
      fontSize: 32,
      fontWeight: 'bold',
      letterSpacing: 2,
      color: textColor,
      strokeColor: strokeColor !== textColor ? strokeColor : undefined,
      strokeWidth: strokeColor !== textColor ? strokeWidth : 0,
      align: 'center',
      locked: customSlot?.locked,
      slot: customSlot?.slot,
      normWidth: customSlot?.normWidth,
      normHeight: customSlot?.normHeight,
    };

    onAddElement(newText);
    onSelectElement(newText.id);
  };

  // Adicionar Número
  const handleAddNumber = (customSlot?: {
    x: number;
    y: number;
    fontSize?: number;
    normWidth?: number;
    normHeight?: number;
    view?: MockupView;
    locked?: boolean;
    slot?: string;
  }) => {
    if (!inputNumber.trim()) return;

    const newNumber: NumberElement = {
      id: `number_${Date.now()}`,
      type: 'number',
      x: customSlot ? customSlot.x : 0.6922,
      y: customSlot ? customSlot.y : 0.5676,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      view: customSlot?.view || 'both',
      zIndex: elements.length + 1,
      text: inputNumber.trim(),
      fontFamily: selectedFont,
      fontSize: customSlot?.fontSize || 110,
      fontWeight: '900',
      letterSpacing: 0,
      color: textColor,
      strokeColor: strokeColor !== textColor ? strokeColor : undefined,
      strokeWidth: strokeColor !== textColor ? strokeWidth : 0,
      locked: customSlot?.locked,
      slot: customSlot?.slot,
      normWidth: customSlot?.normWidth,
      normHeight: customSlot?.normHeight,
    };

    onAddElement(newNumber);
    onSelectElement(newNumber.id);
  };

  return (
    <div className="bg-wise-canvas border border-wise-border rounded-2xl p-3.5 space-y-3 select-none shadow-wise flex-1 flex flex-col">
      <div className="flex items-center justify-between border-b border-wise-border pb-2">
        <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider">
          Aplicações & Decals
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-wise-primary-pale text-wise-ink-deep font-bold">
          Posicionamento Oficial
        </span>
      </div>

      {/* Tabs */}
      <div className="flex bg-wise-canvas-soft p-1 rounded-full border border-wise-border-subtle gap-1">
        <button
          onClick={() => setActiveTab('quick')}
          className={`flex-1 py-1.5 text-[11px] font-black rounded-full flex items-center justify-center gap-1 transition-all ${
            activeTab === 'quick' ? 'bg-wise-canvas text-wise-ink shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <span>⚡ Posições</span>
        </button>
        <button
          onClick={() => setActiveTab('logo')}
          className={`flex-1 py-1.5 text-[11px] font-black rounded-full flex items-center justify-center gap-1 transition-all ${
            activeTab === 'logo' ? 'bg-wise-canvas text-wise-ink shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <Upload className="w-3 h-3" />
          <span>Logo</span>
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 py-1.5 text-[11px] font-black rounded-full flex items-center justify-center gap-1 transition-all ${
            activeTab === 'text' ? 'bg-wise-canvas text-wise-ink shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <Type className="w-3 h-3" />
          <span>Nome</span>
        </button>
        <button
          onClick={() => setActiveTab('number')}
          className={`flex-1 py-1.5 text-[11px] font-black rounded-full flex items-center justify-center gap-1 transition-all ${
            activeTab === 'number' ? 'bg-wise-canvas text-wise-ink shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <Hash className="w-3 h-3" />
          <span>Número</span>
        </button>
      </div>

      {/* AI Background Removal Toggle Indicator (@imgly/background-removal) */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-wise-canvas-soft border border-wise-border text-[11px]">
        <div className="flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5 text-wise-primary" />
          <span className="font-bold text-wise-ink">Remover Fundo (IA)</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-wise-primary-pale text-wise-ink-deep font-black">
            IMG.LY AI
          </span>
        </div>
        <button
          onClick={() => setAutoRemoveBg(!autoRemoveBg)}
          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
            autoRemoveBg ? 'bg-wise-primary' : 'bg-gray-300'
          }`}
          title={autoRemoveBg ? 'Remoção de fundo com IA ativada' : 'Remoção desativada'}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
              autoRemoveBg ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {isRemovingBg && (
        <div className="flex items-center justify-center gap-2 p-2 rounded-xl bg-wise-primary-pale text-wise-ink border border-wise-primary/30 text-xs font-bold animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-wise-primary" />
          <span>Removendo fundo da imagem com IA...</span>
        </div>
      )}

      {/* QUICK POSITIONS (MÁSCARAS OFICIAIS DE POSICIONAMENTO) */}
      {activeTab === 'quick' && (
        <div className="space-y-2">
          <span className="text-[10px] font-black text-wise-mute uppercase tracking-wider block">
            Posições Guiadas pelas Máscaras
          </span>

          <div className="grid grid-cols-2 gap-2">
            {/* 1. Escudo Peito Frente (escudo_mask.png -> 2037.5, 1460.5 -> 0.4075, 0.2921) */}
            <label className="p-2.5 rounded-xl border border-wise-border hover:border-wise-ink bg-wise-canvas-soft flex items-center gap-2 cursor-pointer transition-all">
              <div className="w-7 h-7 rounded-lg bg-wise-primary flex items-center justify-center text-wise-on-primary shrink-0 shadow-xs">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <span className="text-[11px] font-black text-wise-ink block leading-none">Escudo / Brasão</span>
                <span className="text-[9px] text-wise-mute">Peito Esquerdo (Frente)</span>
              </div>
              <input
                type="file"
                accept="image/png,image/svg+xml,image/webp"
                onChange={(e) =>
                  handleLogoUpload(e, {
                    x: 0.4075,
                    y: 0.2921,
                    normWidth: 0.0702,
                    normHeight: 0.0702,
                    scale: 0.0702,
                    view: 'both',
                    locked: true,
                    slot: 'escudo',
                  })
                }
                className="hidden"
              />
            </label>

            {/* 2. Patrocínio Master Frente (logomarca_frente_mask.png -> 1101.5, 1460.5 -> 0.2203, 0.2921) */}
            <label className="p-2.5 rounded-xl border border-wise-border hover:border-wise-ink bg-wise-canvas-soft flex items-center gap-2 cursor-pointer transition-all">
              <div className="w-7 h-7 rounded-lg bg-wise-primary flex items-center justify-center text-wise-on-primary shrink-0 shadow-xs">
                <Briefcase className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <span className="text-[11px] font-black text-wise-ink block leading-none">Patrocínio Frente</span>
                <span className="text-[9px] text-wise-mute">Centro Peito (Frente)</span>
              </div>
              <input
                type="file"
                accept="image/png,image/svg+xml,image/webp"
                onChange={(e) =>
                  handleLogoUpload(e, {
                    x: 0.2203,
                    y: 0.2921,
                    normWidth: 0.0406,
                    normHeight: 0.0406,
                    scale: 0.0406,
                    view: 'both',
                    locked: true,
                    slot: 'logomarca_frente',
                  })
                }
                className="hidden"
              />
            </label>

            {/* 3. Número Peito Frente (numero_frente_mask.png -> 1585, 1681.5 -> 0.3170, 0.3363) */}
            <button
              onClick={() =>
                handleAddNumber({
                  x: 0.317,
                  y: 0.3363,
                  normWidth: 0.0848,
                  normHeight: 0.0846,
                  fontSize: 45,
                  view: 'both',
                  locked: true,
                  slot: 'numero_frente',
                })
              }
              className="p-2.5 rounded-xl border border-wise-border hover:border-wise-ink bg-wise-canvas-soft flex items-center gap-2 text-left transition-all"
            >
              <div className="w-7 h-7 rounded-lg bg-wise-primary flex items-center justify-center text-wise-on-primary shrink-0 shadow-xs">
                <Hash className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[11px] font-black text-wise-ink block leading-none">Número Frente</span>
                <span className="text-[9px] text-wise-mute">Peito Direito (Frente)</span>
              </div>
            </button>

            {/* 4. Patrocínio Costas (logomarca_costas_mask.png -> 3469.5, 1562.5 -> 0.6939, 0.3125) */}
            <label className="p-2.5 rounded-xl border border-wise-border hover:border-wise-ink bg-wise-canvas-soft flex items-center gap-2 cursor-pointer transition-all">
              <div className="w-7 h-7 rounded-lg bg-wise-primary flex items-center justify-center text-wise-on-primary shrink-0 shadow-xs">
                <Briefcase className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <span className="text-[11px] font-black text-wise-ink block leading-none">Patrocínio Costas</span>
                <span className="text-[9px] text-wise-mute">Centro (Costas)</span>
              </div>
              <input
                type="file"
                accept="image/png,image/svg+xml,image/webp"
                onChange={(e) =>
                  handleLogoUpload(e, {
                    x: 0.6939,
                    y: 0.3125,
                    normWidth: 0.0406,
                    normHeight: 0.0406,
                    scale: 0.0406,
                    view: 'both',
                    locked: true,
                    slot: 'logomarca_costas',
                  })
                }
                className="hidden"
              />
            </label>

            {/* 5. Número Dorsal Costas (numero_costas_mask.png -> 3461, 2838 -> 0.6922, 0.5676) */}
            <button
              onClick={() =>
                handleAddNumber({
                  x: 0.6922,
                  y: 0.5676,
                  normWidth: 0.2236,
                  normHeight: 0.2944,
                  fontSize: 130,
                  view: 'both',
                  locked: true,
                  slot: 'numero_costas',
                })
              }
              className="p-2.5 rounded-xl border border-wise-border hover:border-wise-ink bg-wise-canvas-soft flex items-center gap-2 text-left transition-all"
            >
              <div className="w-7 h-7 rounded-lg bg-wise-primary flex items-center justify-center text-wise-on-primary shrink-0 shadow-xs">
                <Hash className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[11px] font-black text-wise-ink block leading-none">Número Dorsal</span>
                <span className="text-[9px] text-wise-mute">Grande (Costas)</span>
              </div>
            </button>

            {/* 6. Nome Acima Costas (nome_costas_acima_mask.png -> 3413, 1820.5 -> 0.6826, 0.3641) */}
            <button
              onClick={() =>
                handleAddText({
                  x: 0.6826,
                  y: 0.3641,
                  normWidth: 0.274,
                  normHeight: 0.0542,
                  view: 'both',
                  locked: true,
                  slot: 'nome_costas_acima',
                })
              }
              className="p-2.5 rounded-xl border border-wise-border hover:border-wise-ink bg-wise-canvas-soft flex items-center gap-2 text-left transition-all"
            >
              <div className="w-7 h-7 rounded-lg bg-wise-primary flex items-center justify-center text-wise-on-primary shrink-0 shadow-xs">
                <Type className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[11px] font-black text-wise-ink block leading-none">Nome do Atleta</span>
                <span className="text-[9px] text-wise-mute">Acima do Número</span>
              </div>
            </button>

            {/* 7. Texto Barra Inferior Costas (nome_costas_barra_mask.png -> 3413, 3807.5 -> 0.6826, 0.7615) */}
            <button
              onClick={() =>
                handleAddText({
                  x: 0.6826,
                  y: 0.7615,
                  normWidth: 0.2856,
                  normHeight: 0.0542,
                  view: 'both',
                  locked: true,
                  slot: 'nome_costas_barra',
                })
              }
              className="p-2.5 rounded-xl border border-wise-border hover:border-wise-ink bg-wise-canvas-soft flex items-center gap-2 text-left transition-all col-span-2"
            >
              <div className="w-7 h-7 rounded-lg bg-wise-primary flex items-center justify-center text-wise-on-primary shrink-0 shadow-xs">
                <Type className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[11px] font-black text-wise-ink block leading-none">Texto na Barra</span>
                <span className="text-[9px] text-wise-mute">Inferior (Costas)</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Tab Contents: Custom Logo */}
      {activeTab === 'logo' && (
        <div className="space-y-2">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-wise-border hover:border-wise-ink bg-wise-canvas-soft rounded-2xl p-4 cursor-pointer transition-all">
            <div className="w-8 h-8 rounded-full bg-wise-primary flex items-center justify-center text-wise-on-primary mb-1.5 shadow-xs">
              <Upload className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span className="text-xs font-black text-wise-ink">Enviar Logo / Imagem</span>
            <span className="text-[10px] text-wise-mute mt-0.5">PNG transparente, WebP ou SVG</span>
            <input
              type="file"
              accept="image/png,image/svg+xml,image/webp"
              onChange={(e) => handleLogoUpload(e)}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Tab Contents: Custom Text */}
      {activeTab === 'text' && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[10px] font-black text-wise-ink mb-0.5">
              Texto / Nome
            </label>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value.toUpperCase())}
              placeholder="Ex: SILVA"
              className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-xl px-3 py-1.5 text-xs font-black text-wise-ink outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="block text-[9px] font-black text-wise-mute mb-0.5">Fonte</label>
              <select
                value={selectedFont}
                onChange={(e) => setSelectedFont(e.target.value)}
                className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-lg px-1.5 py-1 text-[10px] text-wise-ink font-bold outline-none"
              >
                {SPORTS_FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-black text-wise-mute mb-0.5">Cor</label>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-full h-7 bg-wise-canvas-soft border border-wise-border rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[9px] font-black text-wise-mute mb-0.5">Contorno</label>
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                className="w-full h-7 bg-wise-canvas-soft border border-wise-border rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={() => handleAddText()}
            className="w-full bg-wise-primary hover:bg-wise-primary-active text-wise-on-primary font-black py-2 rounded-full text-xs transition-all shadow-sm flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Adicionar Texto</span>
          </button>
        </div>
      )}

      {/* Tab Contents: Custom Number */}
      {activeTab === 'number' && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-black text-wise-ink mb-0.5">
                Número
              </label>
              <input
                type="text"
                maxLength={3}
                value={inputNumber}
                onChange={(e) => setInputNumber(e.target.value)}
                placeholder="10"
                className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-xl px-2 py-1 text-xl font-black text-center text-wise-ink outline-none"
              />
            </div>
            <div className="w-14">
              <label className="block text-[9px] font-black text-wise-mute mb-0.5">Cor</label>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-full h-8 bg-wise-canvas-soft border border-wise-border rounded-lg cursor-pointer"
              />
            </div>
            <div className="w-14">
              <label className="block text-[9px] font-black text-wise-mute mb-0.5">Borda</label>
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                className="w-full h-8 bg-wise-canvas-soft border border-wise-border rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={() => handleAddNumber()}
            className="w-full bg-wise-primary hover:bg-wise-primary-active text-wise-on-primary font-black py-2 rounded-full text-xs transition-all shadow-sm flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Adicionar Número</span>
          </button>
        </div>
      )}

      {/* Layer Elements List */}
      <div className="pt-2 border-t border-wise-border flex-1 flex flex-col justify-end">
        <span className="text-[10px] font-black text-wise-mute uppercase tracking-wider block mb-1">
          Elementos Ativos ({elements.length})
        </span>

        {elements.length === 0 ? (
          <div className="text-center py-2 bg-wise-canvas-soft rounded-xl border border-wise-border-subtle text-[10px] text-wise-mute">
            Nenhum elemento adicionado
          </div>
        ) : (
          <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
            {elements.map((el) => {
              const isSelected = el.id === selectedElementId;
              return (
                <div
                  key={el.id}
                  onClick={() => onSelectElement(el.id)}
                  className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-wise-primary-pale border-wise-primary text-wise-ink'
                      : 'bg-wise-canvas-soft border-wise-border hover:border-wise-body text-wise-body'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {el.type === 'logo' && <Upload className="w-3 h-3 text-wise-ink" />}
                    {el.type === 'text' && <Type className="w-3 h-3 text-wise-ink" />}
                    {el.type === 'number' && <Hash className="w-3 h-3 text-wise-ink" />}
                    <span className="text-[11px] font-bold truncate max-w-[120px]">
                      {el.slot === 'escudo'
                        ? 'Escudo / Brasão'
                        : el.slot === 'logomarca_frente'
                        ? 'Patrocínio Frente'
                        : el.slot === 'logomarca_costas'
                        ? 'Patrocínio Costas'
                        : el.slot === 'numero_frente'
                        ? `Nº Frente (${(el as NumberElement).text})`
                        : el.slot === 'numero_costas'
                        ? `Nº Dorsal (${(el as NumberElement).text})`
                        : el.slot === 'nome_costas_acima'
                        ? `Nome (${(el as TextElement).text})`
                        : el.slot === 'nome_costas_barra'
                        ? `Barra (${(el as TextElement).text})`
                        : el.type === 'text'
                        ? (el as TextElement).text
                        : el.type === 'number'
                        ? (el as NumberElement).text
                        : 'Logotipo'}
                    </span>
                    {el.locked && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 bg-wise-success-pale text-wise-success rounded-full">
                        🔒 Padrão
                      </span>
                    )}
                    <span className="text-[9px] font-mono px-1 py-0.2 bg-black/5 rounded text-wise-mute uppercase">
                      {el.view}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {el.type === 'logo' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveBackgroundManual(el.id);
                        }}
                        disabled={isRemovingBg}
                        className="p-1 hover:text-wise-primary hover:bg-white rounded-full transition-colors text-wise-mute"
                        title="Remover Fundo com IA (@imgly)"
                      >
                        <Wand2 className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveElement(el.id);
                      }}
                      className="p-1 hover:text-wise-negative rounded-full transition-colors"
                      title="Excluir Elemento"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
