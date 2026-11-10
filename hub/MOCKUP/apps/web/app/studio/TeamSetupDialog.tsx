'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { LogoElement, NumberElement } from '@mockup/types';

export type TeamSetup = {
  name: string;
  primary: string;
  secondary: string;
  crest: LogoElement;
  number: NumberElement;
};

function generateDemoCrestDataUrl(primary: string, secondary: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Shield path
  ctx.beginPath();
  ctx.moveTo(48, 32);
  ctx.lineTo(208, 32);
  ctx.lineTo(208, 130);
  ctx.quadraticCurveTo(208, 200, 128, 232);
  ctx.quadraticCurveTo(48, 200, 48, 130);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = secondary;
  ctx.stroke();

  // Inner stripe
  ctx.save();
  ctx.clip();
  ctx.fillStyle = secondary;
  ctx.fillRect(108, 32, 40, 200);
  ctx.restore();

  // Outer shield border cleanup + star badge
  ctx.beginPath();
  ctx.arc(128, 118, 36, 0, Math.PI * 2);
  ctx.fillStyle = primary;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = secondary;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 30px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KS', 128, 120);

  return canvas.toDataURL('image/png');
}

export function TeamSetupDialog({
  clientName,
  onApply,
  onClose,
}: {
  clientName: string;
  onApply: (team: TeamSetup) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [useDemoCrest, setUseDemoCrest] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#2343a7');
  const [secondaryColor, setSecondaryColor] = useState('#facc15');
  const [teamInput, setTeamInput] = useState(clientName || 'Atlético Vila Nova FC');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const file = data.get('crest');
    const hasFile = file instanceof File && file.size > 0;

    if (!name) {
      setError('Informe o nome do time.');
      return;
    }
    if (!hasFile && !useDemoCrest) {
      setError('Selecione um arquivo de escudo ou clique em "Usar escudo padrão de demonstração".');
      return;
    }

    if (hasFile && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Escolha um escudo PNG, JPG ou WebP de até 5 MB.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const url = hasFile
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
        : generateDemoCrestDataUrl(primaryColor, secondaryColor);

      const image = new Image();
      image.src = url;
      await image.decode();
      const base = { scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, visible: true, locked: true };
      onApply({
        name,
        primary: primaryColor,
        secondary: secondaryColor,
        crest: {
          ...base,
          id: 'team-crest',
          type: 'logo',
          slot: 'escudo',
          view: 'front',
          zIndex: 1,
          x: 0.4075,
          y: 0.2921,
          scaleX: 0.0702,
          scaleY: 0.0702,
          normWidth: 0.0702,
          normHeight: 0.0702,
          url,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          aspectRatio: image.naturalWidth / image.naturalHeight,
        },
        number: {
          ...base,
          id: 'team-number',
          type: 'number',
          slot: 'numero_costas',
          view: 'back',
          zIndex: 2,
          x: 0.6922,
          y: 0.5676,
          normWidth: 0.2236,
          normHeight: 0.2944,
          text: '10',
          fontFamily: 'Arial',
          fontSize: 130,
          fontWeight: '900',
          color: '#ffffff',
          strokeColor: '#101522',
          strokeWidth: 2,
          letterSpacing: 0,
        },
      });
    } catch {
      setError('Não foi possível abrir a imagem. Escolha outro arquivo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="team-setup-title"
      className="m-auto w-[min(92vw,490px)] rounded-[28px] apple-glass p-6 text-wise-ink backdrop:bg-black/65 backdrop:backdrop-blur-md"
    >
      <form onSubmit={submit} className="grid gap-4">
        <div>
          <h2 id="team-setup-title" className="text-xl font-bold tracking-tight">
            Monte o uniforme do time
          </h2>
          <p className="mt-1 text-sm text-wise-body">
            Defina o escudo e as cores principais. O número 10 entra automaticamente nas costas.
          </p>
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          Nome do time
          <input
            name="name"
            value={teamInput}
            onChange={(e) => setTeamInput(e.target.value)}
            required
            maxLength={80}
            className="rounded-xl apple-glass-well p-2.5 text-wise-ink outline-none focus:border-blue-400/60"
          />
        </label>

        <div className="grid gap-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Escudo (PNG/JPG/WebP)
            <input
              name="crest"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={() => setUseDemoCrest(false)}
              className="rounded-xl apple-glass-well p-2 text-xs text-wise-body"
            />
          </label>
          <button
            type="button"
            onClick={() => setUseDemoCrest(true)}
            className={`rounded-xl border px-3 py-2.5 text-xs font-semibold text-left transition-all ${
              useDemoCrest
                ? 'apple-glass-cta text-white'
                : 'bg-white/5 border-white/15 text-wise-body hover:bg-white/10 hover:text-wise-ink'
            }`}
          >
            {useDemoCrest
              ? '✓ Escudo padrão King Sports selecionado (pronto para gerar)'
              : 'Usar escudo padrão de demonstração (1 clique)'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Cor principal
            <input
              name="primary"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-xl apple-glass-well p-1"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Cor secundária
            <input
              name="secondary"
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-xl apple-glass-well p-1"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full bg-white/8 hover:bg-white/14 border border-white/15 px-4 py-2 text-sm text-wise-body hover:text-wise-ink transition-colors"
          >
            Pular por agora
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full apple-glass-cta px-5 py-2 text-sm font-semibold text-white transition-all"
          >
            {busy ? 'Preparando…' : 'Gerar uniforme'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
