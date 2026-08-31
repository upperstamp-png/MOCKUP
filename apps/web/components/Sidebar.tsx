'use client';

import React, { useState } from 'react';
import { ApparelModel, Pattern } from '@mockup/types';
import { Shirt, Sparkles, Layers, Check } from 'lucide-react';

interface SidebarProps {
  models: ApparelModel[];
  patterns: Pattern[];
  selectedModel: ApparelModel;
  selectedPattern: Pattern | null;
  onSelectModel: (model: ApparelModel) => void;
  onSelectPattern: (pattern: Pattern | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  models,
  patterns,
  selectedModel,
  selectedPattern,
  onSelectModel,
  onSelectPattern,
}) => {
  const [activeTab, setActiveTab] = useState<'models' | 'patterns'>('models');

  return (
    <aside className="w-80 bg-wise-canvas border-r border-wise-border flex flex-col shrink-0 select-none overflow-hidden">
      {/* Segmented Pill Tabs */}
      <div className="p-3 border-b border-wise-border bg-wise-canvas">
        <div className="flex bg-wise-canvas-soft p-1 rounded-full border border-wise-border-subtle">
          <button
            onClick={() => setActiveTab('models')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-full transition-all ${
              activeTab === 'models'
                ? 'bg-wise-canvas text-wise-ink shadow-sm'
                : 'text-wise-body hover:text-wise-ink'
            }`}
          >
            <Shirt className="w-3.5 h-3.5" />
            <span>Peça</span>
          </button>
          <button
            onClick={() => setActiveTab('patterns')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-full transition-all ${
              activeTab === 'patterns'
                ? 'bg-wise-canvas text-wise-ink shadow-sm'
                : 'text-wise-body hover:text-wise-ink'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Estampas</span>
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'models' ? (
          <div className="space-y-3">
            <span className="text-[11px] font-black text-wise-mute uppercase tracking-wider block">
              Modelo Selecionado
            </span>

            {models.map((model) => {
              const isSelected = selectedModel.id === model.id;
              return (
                <div
                  key={model.id}
                  onClick={() => onSelectModel(model)}
                  className={`p-4 rounded-3xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-wise-primary-pale/60 border-wise-primary shadow-sm'
                      : 'bg-wise-canvas-soft border-wise-border hover:border-wise-body'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-wise-ink uppercase tracking-tight">
                      {model.title}
                    </span>
                    <span className="w-6 h-6 rounded-full bg-wise-primary text-wise-on-primary flex items-center justify-center shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  </div>

                  <div className="w-full aspect-square rounded-2xl bg-white border border-wise-border flex items-center justify-center overflow-hidden p-3 shadow-inner">
                    <img
                      src={model.thumbnail_url || '/assets/MOCKUP_MULTIPLAY.png'}
                      alt={model.title}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="text-wise-body font-medium">Textura Industrial</span>
                    <span className="px-2 py-0.5 rounded-full bg-wise-canvas text-wise-ink font-bold border border-wise-border-subtle">
                      Blend Multiply
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <span className="text-[11px] font-black text-wise-mute uppercase tracking-wider block">
              Biblioteca de Estampas Vetoriais
            </span>

            {/* Botão Sem Estampa (Liso) */}
            <button
              onClick={() => onSelectPattern(null)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                selectedPattern === null
                  ? 'bg-wise-primary-pale/60 border-wise-primary shadow-sm text-wise-ink'
                  : 'bg-wise-canvas-soft border-wise-border text-wise-body hover:text-wise-ink'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-wise-canvas border border-wise-border flex items-center justify-center text-wise-ink">
                <Layers className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-xs font-black block text-wise-ink">Sem Estampa (Liso)</span>
                <span className="text-[11px] text-wise-mute">Apenas as cores A e B</span>
              </div>
            </button>

            {/* Lista de Estampas */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {patterns.map((pattern) => {
                const isSelected = selectedPattern?.id === pattern.id;
                return (
                  <button
                    key={pattern.id}
                    onClick={() => onSelectPattern(pattern)}
                    className={`flex flex-col items-center p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'bg-wise-primary-pale/60 border-wise-primary shadow-sm'
                        : 'bg-wise-canvas-soft border-wise-border hover:border-wise-body'
                    }`}
                  >
                    <div className="w-full aspect-square rounded-xl bg-wise-canvas border border-wise-border flex items-center justify-center overflow-hidden mb-2 p-2">
                      <Sparkles className={`w-6 h-6 ${isSelected ? 'text-wise-ink-deep' : 'text-wise-mute'}`} />
                    </div>
                    <span className="text-xs font-bold text-wise-ink line-clamp-1 w-full text-center">
                      {pattern.title}
                    </span>
                    <span className="text-[10px] text-wise-mute capitalize mt-0.5">
                      {pattern.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
