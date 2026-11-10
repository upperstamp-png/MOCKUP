'use client';

import React from 'react';
import Link from 'next/link';
import { RotateCcw, Share2, History, Settings, Shield } from 'lucide-react';
import { hubAsset } from '@/lib/api-client';

interface HeaderProps {
  onOpenExportModal: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  modelTitle?: string;
  tenantName?: string;
  canAccessAdmin?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenExportModal,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  modelTitle = 'Camisa Gola Careca (Frente & Costas)',
  tenantName = 'Portal do Franqueado',
  canAccessAdmin = false,
}) => {
  return (
    <header className="h-14 apple-glass border-x-0 border-t-0 border-b border-white/15 px-5 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Model Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Voltar ao Portal King Sports" className="shrink-0">
            <img src={hubAsset('/king-sports/logo.png')} alt="King Sports" width={116} height={29} />
          </Link>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-wise-ink-deep font-semibold uppercase tracking-wider">
                Mockup Studio
              </span>
            </div>
            <p className="text-xs text-wise-body truncate max-w-[220px]">{tenantName}</p>
          </div>
        </div>

        <div className="h-6 w-px bg-white/15 hidden md:block" />

        <div className="hidden md:block">
          <span className="text-[11px] text-wise-mute block font-medium">Modelo Base 3D</span>
          <span className="text-xs font-bold text-wise-ink">{modelTitle}</span>
        </div>
      </div>

      {/* Center: Undo/Redo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center apple-glass-well p-1 rounded-full">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 text-wise-body hover:text-wise-ink hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none rounded-full transition-colors"
            title="Desfazer (Ctrl+Z)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 text-wise-body hover:text-wise-ink hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none rounded-full transition-colors"
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
          className="p-2 text-wise-body hover:text-wise-ink bg-white/5 hover:bg-white/12 border border-white/10 rounded-full transition-colors hidden sm:flex"
          title="Histórico de Artes e Versões"
        >
          <History className="w-4 h-4" />
        </Link>
        <Link
          href="/settings"
          className="p-2 text-wise-body hover:text-wise-ink bg-white/5 hover:bg-white/12 border border-white/10 rounded-full transition-colors hidden sm:flex"
          title="Configurações & Terminais"
        >
          <Settings className="w-4 h-4" />
        </Link>
        {canAccessAdmin && (
          <Link
            href="/admin"
            className="p-2 text-wise-body hover:text-wise-ink bg-white/5 hover:bg-white/12 border border-white/10 rounded-full transition-colors hidden sm:flex"
            title="Administração da Rede"
          >
            <Shield className="w-4 h-4" />
          </Link>
        )}

        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-2 apple-glass-cta text-white px-5 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 ml-2"
        >
          <Share2 className="w-4 h-4" />
          <span>SALVAR PRANCHA / ARTE</span>
        </button>
      </div>
    </header>
  );
};
