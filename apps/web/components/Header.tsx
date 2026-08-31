'use client';

import React from 'react';
import Link from 'next/link';
import { Shirt, RotateCcw, Share2, History, Settings, Shield } from 'lucide-react';

interface HeaderProps {
  onOpenExportModal: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  modelTitle?: string;
  tenantName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenExportModal,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  modelTitle = 'Camisa Gola Careca (Frente & Costas)',
  tenantName = 'TexCraft Uniformes',
}) => {
  return (
    <header className="h-14 bg-wise-canvas border-b border-wise-border px-5 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Model Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-wise-primary flex items-center justify-center text-wise-on-primary shadow-sm font-black">
            <Shirt className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-wise-ink tracking-tight text-sm">TexCraft</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-wise-primary-pale text-wise-ink-deep font-black uppercase tracking-wider">
                Studio B2B
              </span>
            </div>
            <p className="text-xs text-wise-body truncate max-w-[200px]">{tenantName}</p>
          </div>
        </div>

        <div className="h-6 w-px bg-wise-border hidden md:block" />

        <div className="hidden md:block">
          <span className="text-[11px] text-wise-mute block font-medium">Visualização Única</span>
          <span className="text-xs font-black text-wise-ink">{modelTitle}</span>
        </div>
      </div>

      {/* Center: Undo/Redo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-wise-canvas-soft p-1 rounded-full border border-wise-border">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 text-wise-body hover:text-wise-ink disabled:opacity-30 disabled:pointer-events-none rounded-full transition-colors"
            title="Desfazer (Ctrl+Z)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 text-wise-body hover:text-wise-ink disabled:opacity-30 disabled:pointer-events-none rounded-full transition-colors"
            title="Refazer (Ctrl+Y)"
          >
            <RotateCcw className="w-4 h-4 scale-x-[-1]" />
          </button>
        </div>
      </div>

      {/* Right: Actions & Links */}
      <div className="flex items-center gap-2">
        <Link
          href="/history"
          className="p-2 text-wise-body hover:text-wise-ink hover:bg-wise-canvas-soft rounded-full transition-colors hidden sm:flex"
          title="Histórico de Propostas"
        >
          <History className="w-4 h-4" />
        </Link>
        <Link
          href="/settings"
          className="p-2 text-wise-body hover:text-wise-ink hover:bg-wise-canvas-soft rounded-full transition-colors hidden sm:flex"
          title="Configurações & Dispositivos"
        >
          <Settings className="w-4 h-4" />
        </Link>
        <Link
          href="/admin"
          className="p-2 text-wise-body hover:text-wise-ink hover:bg-wise-canvas-soft rounded-full transition-colors hidden sm:flex"
          title="Painel da Confecção"
        >
          <Shield className="w-4 h-4" />
        </Link>

        {/* Primary Export Button */}
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-2 bg-wise-primary hover:bg-wise-primary-active text-wise-on-primary px-5 py-2.5 rounded-full text-xs font-black transition-all shadow-sm active:scale-95 ml-2"
        >
          <Share2 className="w-4 h-4" />
          <span>EXPORTAR PROPOSTA</span>
        </button>
      </div>
    </header>
  );
};
