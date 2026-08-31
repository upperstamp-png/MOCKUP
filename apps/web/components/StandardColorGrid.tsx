'use client';

import React from 'react';
import { STANDARD_20_COLORS, StandardColor } from '@mockup/canvas-engine';
import { Check } from 'lucide-react';

interface StandardColorGridProps {
  label: string;
  sublabel?: string;
  selectedColor: string;
  onChange: (hex: string) => void;
}

export const StandardColorGrid: React.FC<StandardColorGridProps> = ({
  label,
  sublabel,
  selectedColor,
  onChange,
}) => {
  const activeColorObj =
    STANDARD_20_COLORS.find(
      (c) => c.hex.toLowerCase() === selectedColor.toLowerCase()
    ) || STANDARD_20_COLORS[0];

  return (
    <div className="p-2.5 rounded-2xl bg-wise-canvas-soft border border-wise-border space-y-1.5 select-none">
      {/* Header Compacto */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-wise-ink leading-none">{label}</span>
          {sublabel && <span className="text-[10px] text-wise-mute font-medium hidden sm:inline">({sublabel})</span>}
        </div>
        <div className="flex items-center gap-1 bg-wise-canvas border border-wise-border px-2 py-0.5 rounded-full shadow-xs">
          <span
            className="w-2.5 h-2.5 rounded-full border border-wise-border inline-block shadow-xs shrink-0"
            style={{ backgroundColor: activeColorObj.hex }}
          />
          <span className="text-[10px] font-black text-wise-ink truncate max-w-[90px]">
            {activeColorObj.name}
          </span>
          <span className="text-[9px] font-mono text-wise-mute font-bold">
            {activeColorObj.pantone}
          </span>
        </div>
      </div>

      {/* Grid com 20 Swatches Compactos (10 colunas x 2 linhas) */}
      <div className="grid grid-cols-10 gap-1 pt-0.5">
        {STANDARD_20_COLORS.map((color: StandardColor) => {
          const isSelected = color.hex.toLowerCase() === selectedColor.toLowerCase();
          return (
            <button
              key={color.id}
              onClick={() => onChange(color.hex)}
              className={`group relative h-5 w-full rounded-md border transition-all flex items-center justify-center shadow-xs hover:scale-125 active:scale-95 ${
                isSelected
                  ? 'ring-1.5 ring-wise-ink ring-offset-1 border-transparent scale-110 z-10'
                  : 'border-wise-border/70 hover:border-wise-ink'
              }`}
              style={{ backgroundColor: color.hex }}
              title={`${color.name} (Pantone ${color.pantone})`}
            >
              {isSelected && (
                <Check
                  className={`w-2.5 h-2.5 stroke-[3] rounded-full ${
                    ['#ffffff', '#7dd3fc', '#38bdf8', '#facc15', '#eab308', '#22c55e', '#94a3b8'].includes(
                      color.hex.toLowerCase()
                    )
                      ? 'text-wise-ink bg-black/15'
                      : 'text-white bg-black/30'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
