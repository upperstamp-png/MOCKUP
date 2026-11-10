'use client';

import React, { useEffect } from 'react';
import { AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  // Comercial / Oportunidade
  draft: { label: 'Rascunho', cls: 'bg-slate-500/20 text-slate-200 border-slate-400/30' },
  scheduled: { label: 'Agendado', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  confirmed: { label: 'Confirmado', cls: 'bg-blue-500/20 text-blue-200 border-blue-400/35' },
  completed: { label: 'Concluído', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  canceled: { label: 'Cancelado', cls: 'bg-rose-500/20 text-rose-200 border-rose-400/35' },
  submitted: { label: 'Enviado para avaliação', cls: 'bg-blue-500/20 text-blue-200 border-blue-400/35' },
  retry_required: { label: 'Nova tentativa necessária', cls: 'bg-amber-500/25 text-amber-100 border-amber-400/45' },
  novo: { label: 'Novo', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  contato_iniciado: { label: 'Contato iniciado', cls: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/35' },
  qualificacao: { label: 'Qualificação', cls: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35' },
  orcamento: { label: 'Orçamento', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/35' },
  negociacao: { label: 'Negociação', cls: 'bg-violet-500/20 text-violet-200 border-violet-400/35' },
  ganho: { label: 'Ganho', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  perdido: { label: 'Perdido', cls: 'bg-slate-500/20 text-slate-300 border-slate-400/30' },
  sent: { label: 'Enviado', cls: 'bg-blue-500/20 text-blue-200 border-blue-400/35' },
  approved: { label: 'Aprovado', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  converted: { label: 'Convertido em Pedido', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  rejected: { label: 'Rejeitado', cls: 'bg-rose-500/20 text-rose-200 border-rose-400/35' },

  // Financeiro
  pending: { label: 'Pendente', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/35' },
  partial: { label: 'Parcial', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  paid: { label: 'Pago', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  settled: { label: 'Quitado', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  overdue: { label: 'Vencido', cls: 'bg-rose-500/25 text-rose-200 border-rose-400/45' },
  refunded: { label: 'Estornado', cls: 'bg-slate-500/25 text-slate-200 border-slate-400/35' },
  pending_validation: { label: 'Aguardando validação', cls: 'bg-amber-500/25 text-amber-100 border-amber-400/45' },
  reversed: { label: 'Estornado', cls: 'bg-rose-500/20 text-rose-200 border-rose-400/35' },

  // Aprovação & Arte
  art_approved: { label: 'Arte aprovada', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  grade_approved: { label: 'Grade aprovada', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  all_approved: { label: 'Arte + Grade OK', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  revision_required: { label: 'Revisão solicitada', cls: 'bg-rose-500/25 text-rose-100 border-rose-400/45' },
  briefing_pendente: { label: 'Briefing pendente', cls: 'bg-slate-500/20 text-slate-200 border-slate-400/30' },
  em_criacao: { label: 'Em criação', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  revisao_interna: { label: 'Revisão interna', cls: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/35' },
  enviado_ao_cliente: { label: 'Enviado ao cliente', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/35' },
  ajustes: { label: 'Ajustes solicitados', cls: 'bg-rose-500/25 text-rose-100 border-rose-400/45' },
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  active: { label: 'Ativo / Válido', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  superseded: { label: 'Substituído', cls: 'bg-slate-500/25 text-slate-300 border-slate-400/35' },
  revoked: { label: 'Revogado', cls: 'bg-rose-500/25 text-rose-200 border-rose-400/40' },

  // Produção (PCP SP)
  not_released: { label: 'Não liberado', cls: 'bg-slate-500/20 text-slate-200 border-slate-400/35' },
  blocked: { label: 'Bloqueado (Gatekeeper)', cls: 'bg-rose-500/25 text-rose-100 border-rose-400/45' },
  queued_pcp: { label: 'Fila PCP SP', cls: 'bg-blue-500/20 text-blue-200 border-blue-400/35' },
  sublimation: { label: 'Sublimação', cls: 'bg-blue-500/25 text-blue-100 border-blue-400/40' },
  cutting: { label: 'Corte', cls: 'bg-cyan-500/20 text-cyan-100 border-cyan-400/35' },
  embroidery_tpu: { label: 'Bordado / TPU / DTF', cls: 'bg-indigo-500/20 text-indigo-100 border-indigo-400/35' },
  sewing: { label: 'Costura', cls: 'bg-violet-500/20 text-violet-100 border-violet-400/35' },
  quality_check: { label: 'Qualidade', cls: 'bg-teal-500/20 text-teal-100 border-teal-400/35' },
  finished: { label: 'Produção concluída', cls: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/35' },

  // Logística
  preparing: { label: 'Em preparação', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  ready_to_dispatch: { label: 'Pronto p/ expedição', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  dispatched: { label: 'Despachado', cls: 'bg-blue-500/25 text-blue-100 border-blue-400/40' },
  in_transit: { label: 'Em trânsito', cls: 'bg-indigo-500/20 text-indigo-100 border-indigo-400/35' },
  delivered: { label: 'Entregue', cls: 'bg-emerald-500/25 text-emerald-100 border-emerald-400/40' },
  delayed: { label: 'Atrasado', cls: 'bg-rose-500/25 text-rose-100 border-rose-400/45' },
  issue_reported: { label: 'Ocorrência entrega', cls: 'bg-rose-500/25 text-rose-100 border-rose-400/40' },

  // SAC / Documentos / Unidade / Configuração
  open: { label: 'Aberto', cls: 'bg-blue-500/20 text-blue-200 border-blue-400/35' },
  in_progress: { label: 'Em tratativa', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/35' },
  waiting_unit: { label: 'Aguarda Unidade', cls: 'bg-amber-500/25 text-amber-100 border-amber-400/45' },
  resolved: { label: 'Resolvido', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
  closed: { label: 'Encerrado', cls: 'bg-slate-500/20 text-slate-300 border-slate-400/30' },
  signed: { label: 'Assinado', cls: 'bg-emerald-500/25 text-emerald-100 border-emerald-400/40' },
  modelo: { label: 'Modelo de referência', cls: 'bg-slate-500/20 text-slate-200 border-slate-400/35' },
  minuta: { label: 'Minuta', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/35' },
  assinado: { label: 'Assinado', cls: 'bg-emerald-500/25 text-emerald-100 border-emerald-400/40' },
  in_review: { label: 'Em análise', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/35' },
  onboarding: { label: 'Em implantação', cls: 'bg-amber-500/25 text-amber-100 border-amber-400/45' },
  pending_approval: { label: 'Aguardando liberação', cls: 'bg-amber-500/20 text-amber-100 border-amber-400/40' },
  restricted: { label: 'Restrita', cls: 'bg-amber-500/25 text-amber-100 border-amber-400/45' },
  suspended: { label: 'Suspensa', cls: 'bg-rose-500/25 text-rose-200 border-rose-400/45' },
  not_configured: { label: 'Não configurada', cls: 'bg-slate-500/20 text-slate-300 border-slate-400/30' },
  pending_definition: { label: 'Pendente de definição', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/35' },
  revenda: { label: 'Revenda', cls: 'bg-blue-500/20 text-blue-200 border-blue-400/35' },
  intermediacao: { label: 'Intermediação', cls: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/35' },
  legal_review: { label: 'Revisão Jurídica (P03)', cls: 'bg-rose-500/25 text-rose-100 border-rose-400/45' },
  available: { label: 'Disponível', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' },
};

export function StatusPill({ value, customLabel }: { value: string; customLabel?: string }) {
  const cfg = STATUS_MAP[value] || {
    label: customLabel || value.replace(/_/g, ' '),
    cls: 'bg-white/10 text-wise-ink border-white/20',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cfg.cls}`}
    >
      {customLabel || cfg.label}
    </span>
  );
}

export function LoadingCard({ message = 'Carregando dados da unidade...' }: { message?: string }) {
  return (
    <div className="apple-glass rounded-3xl p-8 flex items-center justify-center gap-3 text-sm text-wise-body">
      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyStateCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="apple-glass-subtle rounded-3xl p-8 text-center space-y-2.5 border border-white/12">
      <h3 className="text-base font-bold text-wise-ink">{title}</h3>
      <p className="text-xs text-wise-body max-w-md mx-auto leading-relaxed">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="apple-glass rounded-2xl p-4 border border-rose-400/40 bg-rose-500/10 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex items-start gap-2.5 text-xs text-rose-100">
        <AlertCircle className="w-4 h-4 shrink-0 text-rose-300 mt-0.5" />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}

export function GlassModal({
  open,
  title,
  subtitle,
  onClose,
  maxWidthClass = 'max-w-2xl',
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className={`w-full ${maxWidthClass} apple-glass rounded-3xl p-6 space-y-5 my-8`}>
        <div className="flex items-start justify-between gap-3 border-b border-white/12 pb-3">
          <div>
            <h2 className="text-lg font-bold text-wise-ink">{title}</h2>
            {subtitle ? <p className="text-xs text-wise-body mt-0.5">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="p-1.5 rounded-full bg-white/8 hover:bg-white/16 border border-white/12 text-wise-body hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
