'use client';

import React from 'react';
import { Palette, Info } from 'lucide-react';
import { findClosestPantone, PANTONE_LEGAL_DISCLAIMER, GarmentPart } from '@mockup/canvas-engine';

interface ColorPickerProps {
  colorA: string;
  colorB: string;
  frontColor?: string;
  backColor?: string;
  sleeveLeftColor?: string;
  sleeveRightColor?: string;
  collarColor?: string;
  selectedPart?: GarmentPart;
  onSelectPart?: (part: GarmentPart) => void;
  onChangeColorA: (color: string) => void;
  onChangeColorB: (color: string) => void;
  onChangeFrontColor?: (color: string) => void;
  onChangeBackColor?: (color: string) => void;
  onChangeSleeveLeftColor?: (color: string) => void;
  onChangeSleeveRightColor?: (color: string) => void;
  onChangeCollarColor?: (color: string) => void;
}

const PRESET_COLORS = [
  { name: 'Preto Profundo', hex: '#0f172a' },
  { name: 'Branco Neve', hex: '#ffffff' },
  { name: 'Azul Bebê', hex: '#7dd3fc' },
  { name: 'Azul Celeste', hex: '#38bdf8' },
  { name: 'Azul Real', hex: '#1d4ed8' },
  { name: 'Vermelho Rubro', hex: '#dc2626' },
  { name: 'Amarelo Canário', hex: '#facc15' },
  { name: 'Verde Esmeralda', hex: '#059669' },
  { name: 'Verde Neon', hex: '#22c55e' },
  { name: 'Laranja Fogo', hex: '#ea580c' },
  { name: 'Roxo Imperial', hex: '#7c3aed' },
  { name: 'Dourado Campeão', hex: '#d97706' },
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  colorA,
  colorB,
  frontColor,
  backColor,
  sleeveLeftColor,
  sleeveRightColor,
  collarColor,
  selectedPart = 'front',
  onSelectPart,
  onChangeColorA,
  onChangeColorB,
  onChangeFrontColor,
  onChangeBackColor,
  onChangeSleeveLeftColor,
  onChangeSleeveRightColor,
  onChangeCollarColor,
}) => {
  const activeCollarColor = collarColor || colorB;
  const activeFrontColor = frontColor || colorA;
  const activeBackColor = backColor || colorA;
  const activeSleeveLeftColor = sleeveLeftColor || colorA;
  const activeSleeveRightColor = sleeveRightColor || colorA;

  const getCurrentColor = (): string => {
    switch (selectedPart) {
      case 'collar':
        return activeCollarColor;
      case 'front':
        return activeFrontColor;
      case 'back':
        return activeBackColor;
      case 'sleeve_left':
        return activeSleeveLeftColor;
      case 'sleeve_right':
        return activeSleeveRightColor;
      default:
        return activeFrontColor;
    }
  };

  const currentColor = getCurrentColor();
  const pantoneMatch = findClosestPantone(currentColor);

  // Aplica cor na parte atualmente selecionada
  const applyColor = (hex: string) => {
    switch (selectedPart) {
      case 'collar':
        onChangeCollarColor?.(hex);
        onChangeColorB(hex);
        break;
      case 'front':
        onChangeFrontColor?.(hex);
        onChangeColorA(hex);
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
      default:
        onChangeFrontColor?.(hex);
        onChangeColorA(hex);
        break;
    }
  };

  const getPartLabel = (): string => {
    switch (selectedPart) {
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
      default:
        return 'Frente da Camisa';
    }
  };

  return (
    <div className="bg-wise-canvas border border-wise-border rounded-3xl p-5 space-y-4 select-none shadow-wise">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-wise-border pb-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-wise-ink" />
          <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider">
            Coloração por Partes
          </h3>
        </div>
        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-wise-primary-pale text-wise-ink-deep font-bold">
          Clique no Mockup ou Abaixo
        </span>
      </div>

      {/* Part Selection Pills (5 Partes Modulares) */}
      <div className="grid grid-cols-5 bg-wise-canvas-soft p-1 rounded-full border border-wise-border-subtle gap-1">
        <button
          onClick={() => onSelectPart?.('collar')}
          className={`py-1.5 px-2 text-[11px] font-black rounded-full transition-all flex items-center justify-center gap-1 ${
            selectedPart === 'collar'
              ? 'bg-wise-primary text-wise-on-primary shadow-xs'
              : 'text-wise-body hover:text-wise-ink'
          }`}
          title="Gola Careca"
        >
          <span>Gola</span>
          <span
            className="w-2.5 h-2.5 rounded-full border border-wise-border inline-block shrink-0"
            style={{ backgroundColor: activeCollarColor }}
          />
        </button>

        <button
          onClick={() => onSelectPart?.('front')}
          className={`py-1.5 px-2 text-[11px] font-black rounded-full transition-all flex items-center justify-center gap-1 ${
            selectedPart === 'front' || selectedPart === null
              ? 'bg-wise-primary text-wise-on-primary shadow-xs'
              : 'text-wise-body hover:text-wise-ink'
          }`}
          title="Frente da Camisa"
        >
          <span>Frente</span>
          <span
            className="w-2.5 h-2.5 rounded-full border border-wise-border inline-block shrink-0"
            style={{ backgroundColor: activeFrontColor }}
          />
        </button>

        <button
          onClick={() => onSelectPart?.('back')}
          className={`py-1.5 px-2 text-[11px] font-black rounded-full transition-all flex items-center justify-center gap-1 ${
            selectedPart === 'back'
              ? 'bg-wise-primary text-wise-on-primary shadow-xs'
              : 'text-wise-body hover:text-wise-ink'
          }`}
          title="Costas da Camisa"
        >
          <span>Costas</span>
          <span
            className="w-2.5 h-2.5 rounded-full border border-wise-border inline-block shrink-0"
            style={{ backgroundColor: activeBackColor }}
          />
        </button>

        <button
          onClick={() => onSelectPart?.('sleeve_left')}
          className={`py-1.5 px-2 text-[11px] font-black rounded-full transition-all flex items-center justify-center gap-1 ${
            selectedPart === 'sleeve_left'
              ? 'bg-wise-primary text-wise-on-primary shadow-xs'
              : 'text-wise-body hover:text-wise-ink'
          }`}
          title="Manga Esquerda"
        >
          <span>Manga E.</span>
          <span
            className="w-2.5 h-2.5 rounded-full border border-wise-border inline-block shrink-0"
            style={{ backgroundColor: activeSleeveLeftColor }}
          />
        </button>

        <button
          onClick={() => onSelectPart?.('sleeve_right')}
          className={`py-1.5 px-2 text-[11px] font-black rounded-full transition-all flex items-center justify-center gap-1 ${
            selectedPart === 'sleeve_right'
              ? 'bg-wise-primary text-wise-on-primary shadow-xs'
              : 'text-wise-body hover:text-wise-ink'
          }`}
          title="Manga Direita"
        >
          <span>Manga D.</span>
          <span
            className="w-2.5 h-2.5 rounded-full border border-wise-border inline-block shrink-0"
            style={{ backgroundColor: activeSleeveRightColor }}
          />
        </button>
      </div>

      {/* DETALHE DA PARTE SELECIONADA */}
      <div className="p-4 rounded-2xl bg-wise-primary-pale/40 border border-wise-primary space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-black text-wise-ink block">
              Cor: {getPartLabel()}
            </span>
            <span className="text-[11px] text-wise-body">
              Selecione uma cor rápida ou código hex
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-wise-ink-deep bg-wise-canvas px-2.5 py-1 rounded-xl border border-wise-border">
            {currentColor.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-wise-ink shrink-0 cursor-pointer shadow-xs">
            <input
              type="color"
              value={currentColor}
              onChange={(e) => applyColor(e.target.value)}
              className="absolute -top-2 -left-2 w-14 h-14 cursor-pointer opacity-0"
            />
            <div className="w-full h-full" style={{ backgroundColor: currentColor }} />
          </div>

          <div className="flex-1 text-[11px] text-wise-ink-deep bg-wise-canvas border border-wise-border rounded-xl px-3 py-1.5 font-mono font-bold flex items-center justify-between">
            <span>Pantone: <strong className="text-wise-ink font-black">{pantoneMatch.pantone.code}</strong></span>
            <span className="text-wise-body text-[10px] truncate max-w-[120px]">{pantoneMatch.pantone.name}</span>
          </div>
        </div>
      </div>

      {/* Preset Swatches (1-Click Color Application) */}
      <div>
        <span className="text-[10px] font-black text-wise-mute uppercase tracking-wider block mb-2">
          Paleta Rápida em 1 Clique para {getPartLabel()}
        </span>
        <div className="grid grid-cols-6 gap-2">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset.hex}
              onClick={() => applyColor(preset.hex)}
              title={`${preset.name} (${preset.hex})`}
              className={`h-8 rounded-full border border-wise-border hover:scale-110 active:scale-95 transition-all shadow-xs flex items-center justify-center ${
                currentColor.toLowerCase() === preset.hex.toLowerCase() ? 'ring-2 ring-wise-ink' : ''
              }`}
              style={{ backgroundColor: preset.hex }}
            />
          ))}
        </div>
      </div>

      {/* Legal Disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-2xl bg-wise-canvas-soft border border-wise-border-subtle text-[11px] text-wise-body leading-tight">
        <Info className="w-3.5 h-3.5 text-wise-body shrink-0 mt-0.5" />
        <span>{PANTONE_LEGAL_DISCLAIMER}</span>
      </div>
    </div>
  );
};
