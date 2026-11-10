'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Info,
  Plus,
  RotateCcw,
  ShieldAlert,
  Wallet,
  XCircle,
} from 'lucide-react';
import { fileToDataUrl, formatBrl, formatDateBr, portalFetch, PortalApiError } from '@/lib/api-client';
import type { PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface FinanceSummaryResponse {
  contractualGovernance: {
    initialFranchiseFeeCents: number;
    initialFeeStatus: string;
    includedInCommercialRevenue: boolean;
    note: string;
  };
  commercialRules: {
    config_status: string;
    commercial_modality: string;
    royalty_bps: number | null;
    marketing_fund_bps: number | null;
    factory_transfer_bps: number | null;
    notes: string | null;
  } | null;
  apportionmentBreakdown: {
    available: boolean;
    reason?: string;
    modality?: string;
    estimatedRoyaltiesCents?: number;
    estimatedMarketingFundCents?: number;
    estimatedFactoryTransferCents?: number | null;
  };
  kpis: {
    confirmedOrdersValueCents: number;
    canceledOrdersValueCents: number;
    netReceivedCents: number;
    pendingValidationCents: number;
    reversedCents: number;
    openReceivablesCents: number;
    overdueReceivablesCents: number;
    totalExpensesCents: number;
    paidExpensesCents: number;
    pendingFactoryPayableCents: number;
  };
}

interface ReceivableRow {
  id: string;
  order_id: string | null;
  order_number: string | null;
  customer_name: string | null;
  installment_number: number;
  total_installments: number;
  description: string;
  due_date: string;
  amount_cents: string;
  paid_cents: string;
  status: string;
}

interface PaymentTxRow {
  id: string;
  receivable_id: string;
  order_number: string | null;
  receivable_description: string;
  transaction_type: 'payment' | 'reversal';
  amount_cents: string;
  payment_method: string;
  confirmation_status: 'pending_validation' | 'confirmed' | 'rejected' | 'reversed';
  proof_storage_path: string | null;
  notes: string | null;
  occurred_at: string;
}

interface ExpenseRow {
  id: string;
  order_number: string | null;
  expense_category: string;
  description: string;
  vendor_name: string | null;
  due_date: string;
  amount_cents: string;
  paid_cents: string;
  status: string;
}

const MODALITY_LABELS: Record<string, string> = {
  revenda: 'Revenda',
  intermediacao: 'Intermediação',
  pending_definition: 'Pendente de definição',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  transferencia: 'Transferência Bancária',
  boleto: 'Boleto',
  cartao_link_externo: 'Cartão (Link externo)',
  dinheiro: 'Dinheiro / Recibo',
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  pagamento_fabrica: 'Pagamento à Fábrica SP',
  frete: 'Frete / Logística',
  servico_adicional: 'Serviço adicional',
  despesa_operacional: 'Despesa operacional',
};

function todayLocalIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function FinanceTab({ me }: { me: PortalMeResponse }) {
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [transactions, setTransactions] = useState<PaymentTxRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Payment Modal
  const [payRec, setPayRec] = useState<ReceivableRow | null>(null);
  const [payAmountReais, setPayAmountReais] = useState('');
  const [payMethod, setPayMethod] = useState<'pix' | 'boleto' | 'cartao_link_externo' | 'transferencia' | 'dinheiro'>('pix');
  const [payNotes, setPayNotes] = useState('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Reverse Modal (replaces window.prompt)
  const [reverseTxTargetId, setReverseTxTargetId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reversingTx, setReversingTx] = useState(false);

  // New Expense Modal
  const [expOpen, setExpOpen] = useState(false);
  const [expCat, setExpCat] = useState<'pagamento_fabrica' | 'frete' | 'servico_adicional' | 'despesa_operacional'>('pagamento_fabrica');
  const [expDesc, setExpDesc] = useState('');
  const [expVendor] = useState('Matriz King Sports SP');
  const [expDue, setExpDue] = useState(() => todayLocalIso());
  const [expAmountReais, setExpAmountReais] = useState('');
  const [expError, setExpError] = useState<string | null>(null);
  const [savingExp, setSavingExp] = useState(false);

  // Action busy flags
  const [busyTxId, setBusyTxId] = useState<string | null>(null);
  const [busyExpId, setBusyExpId] = useState<string | null>(null);
  const [testingIntegration, setTestingIntegration] = useState<'asaas_payments' | 'nfe_emitter' | null>(null);

  const canWrite = me.activeRole.permissions.includes('finance:write');
  const canReconcile = me.activeRole.permissions.includes('finance:reconcile');
  const canReverse = me.activeRole.permissions.includes('finance:reverse');

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, recRes, expRes] = await Promise.all([
        portalFetch<FinanceSummaryResponse>(`/finance/summary?period=${encodeURIComponent(period)}`),
        portalFetch<{ receivables: ReceivableRow[]; transactions: PaymentTxRow[] }>('/finance/receivables'),
        portalFetch<{ items: ExpenseRow[] }>('/finance/expenses'),
      ]);
      setSummary(sumRes);
      setReceivables(recRes.receivables || []);
      setTransactions(recRes.transactions || []);
      setExpenses(expRes.items || []);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance, me.activeUnit.id]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payRec) return;
    setPayError(null);
    const amountCents = Math.round((Number(payAmountReais.replace(',', '.')) || 0) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setPayError('Informe um valor pago maior que R$ 0,00.');
      return;
    }
    setSubmittingPay(true);
    setError(null);
    try {
      const proofFile = payFile ? await fileToDataUrl(payFile) : null;
      const res = await portalFetch<{ transaction: { confirmation_status: string } }>('/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          receivableId: payRec.id,
          idempotencyKey: `ui_pay_${payRec.id}_${amountCents}_${Date.now()}`,
          amountCents,
          paymentMethod: payMethod,
          notes: payNotes.trim() || null,
          confirmImmediately: false,
          proofFile,
        }),
      });
      setPayRec(null);
      setPayFile(null);
      setPayNotes('');
      setPayError(null);
      setFeedback(
        res.transaction.confirmation_status === 'confirmed'
          ? 'Pagamento registrado e confirmado.'
          : 'Comprovante enviado com status Aguardando Validação Financeira.'
      );
      await loadFinance();
    } catch (err) {
      setPayError(err instanceof PortalApiError ? err.message : 'Erro ao registrar recebimento.');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleValidateTx = async (txId: string, decision: 'confirmed' | 'rejected') => {
    setBusyTxId(txId);
    setError(null);
    try {
      await portalFetch(`/finance/payments/${txId}/validate`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setFeedback(decision === 'confirmed' ? 'Baixa validada e saldo atualizado.' : 'Lançamento rejeitado.');
      await loadFinance();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao validar pagamento.');
    } finally {
      setBusyTxId(null);
    }
  };

  const handleConfirmReverseTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTxTargetId) return;
    if (reverseReason.trim().length < 4) {
      setReverseError('Informe o motivo obrigatório do estorno (mínimo 4 caracteres).');
      return;
    }
    setReversingTx(true);
    setReverseError(null);
    try {
      await portalFetch(`/finance/payments/${reverseTxTargetId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reverseReason.trim() }),
      });
      setReverseTxTargetId(null);
      setReverseReason('');
      setFeedback('Estorno contabilizado e saldo da parcela restaurado.');
      await loadFinance();
    } catch (err) {
      setReverseError(err instanceof PortalApiError ? err.message : 'Erro ao estornar lançamento.');
    } finally {
      setReversingTx(false);
    }
  };

  const handleDownloadReceipt = async (txId: string) => {
    try {
      const res = await portalFetch<{ signedUrl: string }>(`/finance/receipts/${txId}/download`);
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao baixar comprovante.');
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpError(null);
    if (expDesc.trim().length < 3) {
      setExpError('Informe uma descrição clara da despesa (mínimo 3 caracteres).');
      return;
    }
    const amountCents = Math.round((Number(expAmountReais.replace(',', '.')) || 0) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setExpError('Informe um valor válido maior que R$ 0,00.');
      return;
    }
    if (!expDue) {
      setExpError('Informe a data de vencimento.');
      return;
    }
    setSavingExp(true);
    try {
      await portalFetch('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          expenseCategory: expCat,
          description: expDesc.trim(),
          vendorName: expVendor.trim() || null,
          dueDate: expDue,
          amountCents,
        }),
      });
      setExpOpen(false);
      setExpDesc('');
      setExpAmountReais('');
      setExpError(null);
      setFeedback('Custo lançado no financeiro da unidade.');
      await loadFinance();
    } catch (err) {
      setExpError(err instanceof PortalApiError ? err.message : 'Erro ao lançar despesa.');
    } finally {
      setSavingExp(false);
    }
  };

  const handlePayExpense = async (id: string) => {
    setBusyExpId(id);
    setError(null);
    try {
      await portalFetch(`/finance/expenses/${id}/pay`, { method: 'POST', body: '{}' });
      setFeedback('Pagamento de despesa registrado.');
      await loadFinance();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao baixar despesa.');
    } finally {
      setBusyExpId(null);
    }
  };

  const handleTestIntegration = async (integrationName: 'asaas_payments' | 'nfe_emitter') => {
    setTestingIntegration(integrationName);
    try {
      const res = await portalFetch<{ configured: boolean; message: string }>('/finance/integrations/attempt', {
        method: 'POST',
        body: JSON.stringify({
          integrationName,
          operation: integrationName === 'asaas_payments' ? 'gerar_cobranca_manual_teste' : 'emitir_nfe_teste',
        }),
      });
      setFeedback(res.message);
    } catch (err) {
      setFeedback(
        err instanceof PortalApiError
          ? `Integração pendente (honestidade operacional): ${err.message}`
          : 'Integração externa ainda não configurada.'
      );
    } finally {
      setTestingIntegration(null);
    }
  };

  if (loading && !summary) return <LoadingCard message="Carregando módulo financeiro da unidade..." />;
  if (!summary) return null;

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} onRetry={loadFinance} /> : null}
      {feedback ? (
        <div className="rounded-2xl bg-blue-500/15 border border-blue-400/35 px-4 py-3 text-xs font-semibold text-blue-100 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">Fechar</button>
        </div>
      ) : null}

      {/* Cabeçalho Financeiro & Governança */}
      <section className="apple-glass rounded-3xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-wise-ink flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-400" />
              Financeiro da Unidade &amp; Conciliação
            </h2>
            <p className="text-xs text-wise-mute">
              Pedidos confirmados não representam lucro nem dinheiro em caixa. Pagamentos manuais passam por validação antes de quitar parcelas.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { k: '7d', l: '7 dias' },
              { k: 'month', l: 'Mês atual' },
              { k: '90d', l: '90 dias' },
              { k: 'all', l: 'Tudo' },
            ].map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => setPeriod(p.k)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  period === p.k ? 'apple-glass-cta text-white' : 'bg-white/6 border-white/12 text-wise-body'
                }`}
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {/* Taxa de Franquia vs Faturamento + Regras Configuráveis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/12 p-3.5 text-xs space-y-1">
            <span className="text-[11px] font-bold uppercase text-blue-300 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Taxa Inicial de Franquia (Item Contratual Separado)
            </span>
            <p className="font-bold text-wise-ink">
              Valor definido contratualmente: {formatBrl(summary.contractualGovernance.initialFranchiseFeeCents)}
            </p>
            <p className="text-wise-body">{summary.contractualGovernance.note}</p>
          </div>

          <div
            className={`rounded-2xl p-3.5 text-xs border space-y-1 ${
              summary.apportionmentBreakdown.available
                ? 'bg-emerald-500/10 border-emerald-400/35'
                : 'bg-amber-500/10 border-amber-400/35'
            }`}
          >
            <span className="text-[11px] font-bold uppercase text-wise-ink block">
              Repasses, Royalties, Fundo de Marketing &amp; Modalidade Fiscal
            </span>
            {!summary.apportionmentBreakdown.available ? (
              <p className="text-amber-100 leading-relaxed">{summary.apportionmentBreakdown.reason}</p>
            ) : (
              <div className="space-y-1 text-emerald-100">
                <p>
                  Modalidade configurada e aprovada:{' '}
                  <strong>
                    {(summary.apportionmentBreakdown.modality &&
                      MODALITY_LABELS[summary.apportionmentBreakdown.modality]) ||
                      summary.apportionmentBreakdown.modality}
                  </strong>
                </p>
                <p>
                  Estimativa sobre recebimentos líquidos confirmados: Royalties{' '}
                  <strong>{formatBrl(summary.apportionmentBreakdown.estimatedRoyaltiesCents)}</strong> · Fundo Marketing{' '}
                  <strong>{formatBrl(summary.apportionmentBreakdown.estimatedMarketingFundCents)}</strong>
                  {summary.apportionmentBreakdown.estimatedFactoryTransferCents !== null
                    ? ` · Repasse Fábrica SP ${formatBrl(summary.apportionmentBreakdown.estimatedFactoryTransferCents)}`
                    : ''}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Pedidos Confirmados', val: formatBrl(summary.kpis.confirmedOrdersValueCents), tone: 'text-wise-ink' },
          { label: 'Recebido Líquido', val: formatBrl(summary.kpis.netReceivedCents), tone: 'text-emerald-300' },
          { label: 'Aguardando Validação', val: formatBrl(summary.kpis.pendingValidationCents), tone: 'text-amber-200' },
          { label: 'Saldo a Receber (Aberto)', val: formatBrl(summary.kpis.openReceivablesCents), tone: 'text-blue-300' },
          { label: 'Em Atraso (Vencido)', val: formatBrl(summary.kpis.overdueReceivablesCents), tone: summary.kpis.overdueReceivablesCents > 0 ? 'text-rose-300' : 'text-wise-ink' },
        ].map((k) => (
          <div key={k.label} className="apple-glass-subtle rounded-2xl p-4 space-y-1">
            <span className="text-[11px] text-wise-mute font-bold block">{k.label}</span>
            <p className={`text-lg font-bold ${k.tone}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Parcelas a Receber + Extrato */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="apple-glass rounded-3xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-wise-ink">Contas a Receber ({receivables.length})</h3>
          {receivables.length === 0 ? (
            <EmptyStateCard title="Sem parcelas cadastradas" description="Parcelas são geradas automaticamente ao confirmar pedidos." />
          ) : (
            <div className="space-y-2.5">
              {receivables.map((rec) => {
                const remaining = Number(rec.amount_cents) - Number(rec.paid_cents);
                return (
                  <div key={rec.id} className="rounded-2xl apple-glass-well p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-wise-ink">{rec.description}</p>
                        <p className="text-[11px] text-wise-mute">
                          {rec.customer_name || 'Cliente'} {rec.order_number ? `· ${rec.order_number}` : ''} · Venc.:{' '}
                          {formatDateBr(rec.due_date)}
                        </p>
                      </div>
                      <StatusPill value={rec.status} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-white/10">
                      <span>
                        Total: <strong>{formatBrl(rec.amount_cents)}</strong> · Pago: <strong>{formatBrl(rec.paid_cents)}</strong> ·
                        Saldo: <strong className="text-blue-300">{formatBrl(remaining)}</strong>
                      </span>
                      {canWrite && remaining > 0 && rec.status !== 'canceled' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPayRec(rec);
                            setPayError(null);
                            setPayAmountReais((remaining / 100).toFixed(2));
                          }}
                          className="px-3 py-1 rounded-full apple-glass-cta text-white text-[11px] font-semibold"
                        >
                          Registrar pagamento
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="apple-glass rounded-3xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-wise-ink">Lançamentos &amp; Conciliação ({transactions.length})</h3>
          {transactions.length === 0 ? (
            <EmptyStateCard title="Sem lançamentos financeiros" description="Os pagamentos e estornos aparecerão aqui com trilha completa." />
          ) : (
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {transactions.map((tx) => (
                <div key={tx.id} className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-wise-ink">
                        {tx.transaction_type === 'reversal' ? 'ESTORNO ' : ''}
                        {formatBrl(tx.amount_cents)} ({PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method})
                      </span>
                      <p className="text-[11px] text-wise-mute">
                        {tx.receivable_description} · {formatDateBr(tx.occurred_at, { withTime: true })}
                      </p>
                    </div>
                    <StatusPill value={tx.confirmation_status} />
                  </div>
                  {tx.notes ? <p className="text-[11px] text-wise-body">{tx.notes}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {tx.proof_storage_path ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadReceipt(tx.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-semibold text-white"
                      >
                        <Download className="w-3 h-3" /> Comprovante
                      </button>
                    ) : null}
                    {canReconcile && tx.confirmation_status === 'pending_validation' ? (
                      <>
                        <button
                          type="button"
                          disabled={busyTxId === tx.id}
                          onClick={() => handleValidateTx(tx.id, 'confirmed')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 text-[11px] font-semibold disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Confirmar entrada
                        </button>
                        <button
                          type="button"
                          disabled={busyTxId === tx.id}
                          onClick={() => handleValidateTx(tx.id, 'rejected')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-100 text-[11px] font-semibold disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3" /> Rejeitar
                        </button>
                      </>
                    ) : null}
                    {canReverse && tx.transaction_type === 'payment' && tx.confirmation_status === 'confirmed' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReverseTxTargetId(tx.id);
                          setReverseReason('');
                          setReverseError(null);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 hover:bg-rose-500/20 border border-white/15 text-rose-200 text-[11px] font-semibold"
                      >
                        <RotateCcw className="w-3 h-3" /> Estornar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Despesas / Pagamentos Fábrica + Integrações Pendentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="apple-glass rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-wise-ink">Custos, Fretes &amp; Repasses à Fábrica</h3>
            {canWrite ? (
              <button
                type="button"
                onClick={() => {
                  setExpError(null);
                  setExpOpen(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full apple-glass-cta text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Lançar custo
              </button>
            ) : null}
          </div>
          {expenses.length === 0 ? (
            <EmptyStateCard title="Nenhum custo ou despesa lançada" description="Registre pagamentos de produção à fábrica, fretes e serviços adicionais." />
          ) : (
            <div className="space-y-2">
              {expenses.map((ex) => (
                <div key={ex.id} className="rounded-xl apple-glass-well p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-wise-ink">{ex.description}</p>
                    <p className="text-[11px] text-wise-mute">
                      {ex.vendor_name || EXPENSE_CATEGORY_LABELS[ex.expense_category] || ex.expense_category} · Venc.: {formatDateBr(ex.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-wise-ink">{formatBrl(ex.amount_cents)}</span>
                    <StatusPill value={ex.status} />
                    {canWrite && ex.status === 'pending' ? (
                      <button
                        type="button"
                        disabled={busyExpId === ex.id}
                        onClick={() => handlePayExpense(ex.id)}
                        className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-emerald-100 text-[11px] font-semibold disabled:opacity-50"
                      >
                        {busyExpId === ex.id ? 'Baixando...' : 'Pagar'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="apple-glass-subtle rounded-3xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-wise-ink flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-300" />
            Integrações Financeiras e Fiscais Externas
          </h3>
          <div className="space-y-2 text-xs">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-wise-ink">Gateway Asaas (Cobrança &amp; Split)</p>
                <p className="text-[11px] text-wise-body">
                  Status: {me.integrationsStatus.asaas_payments ? 'Configurado' : 'Integração pendente (sem credenciais em ambiente)'}
                </p>
              </div>
              <button
                type="button"
                disabled={testingIntegration !== null}
                onClick={() => handleTestIntegration('asaas_payments')}
                className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white shrink-0 disabled:opacity-50"
              >
                {testingIntegration === 'asaas_payments' ? 'Verificando...' : 'Verificar integração'}
              </button>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-wise-ink">Emissor Fiscal NF-e</p>
                <p className="text-[11px] text-wise-body">
                  Status: {me.integrationsStatus.nfe_emitter ? 'Configurado' : 'Integração pendente (emissão externa não configurada)'}
                </p>
              </div>
              <button
                type="button"
                disabled={testingIntegration !== null}
                onClick={() => handleTestIntegration('nfe_emitter')}
                className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white shrink-0 disabled:opacity-50"
              >
                {testingIntegration === 'nfe_emitter' ? 'Verificando...' : 'Verificar integração'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Modal Registrar Pagamento */}
      <GlassModal
        open={Boolean(payRec)}
        title="Registrar pagamento / comprovante"
        subtitle={payRec?.description}
        onClose={() => {
          setPayRec(null);
          setPayError(null);
        }}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {payError ? <ErrorBanner message={payError} /> : null}
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Valor pago (R$) *</label>
            <input
              type="text"
              required
              value={payAmountReais}
              onChange={(e) => setPayAmountReais(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Forma de pagamento</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
              className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
            >
              <option value="pix" className="bg-[#181818]">PIX</option>
              <option value="transferencia" className="bg-[#181818]">Transferência Bancária</option>
              <option value="boleto" className="bg-[#181818]">Boleto</option>
              <option value="cartao_link_externo" className="bg-[#181818]">Cartão (Link externo)</option>
              <option value="dinheiro" className="bg-[#181818]">Dinheiro / Recibo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Anexar comprovante (armazenado em bucket privado)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setPayFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-wise-body file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-blue-500/25 file:text-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Observações</label>
            <input
              type="text"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPayRec(null);
                setPayError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingPay}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {submittingPay ? 'Registrando...' : 'Enviar para validação'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Estorno de Lançamento */}
      <GlassModal
        open={Boolean(reverseTxTargetId)}
        title="Confirmar estorno financeiro"
        subtitle="O lançamento original será preservado para auditoria e o saldo da parcela será restaurado."
        onClose={() => {
          setReverseTxTargetId(null);
          setReverseError(null);
        }}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleConfirmReverseTx} className="space-y-4">
          {reverseError ? <ErrorBanner message={reverseError} /> : null}
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Motivo obrigatório do estorno *</label>
            <textarea
              required
              minLength={4}
              rows={3}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Ex: Comprovante enviado em duplicidade ou devolução acordada..."
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReverseTxTargetId(null);
                setReverseError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reversingTx}
              className="px-5 py-2 rounded-full bg-rose-500/80 hover:bg-rose-500 text-xs font-semibold text-white disabled:opacity-50"
            >
              {reversingTx ? 'Estornando...' : 'Confirmar estorno'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Nova Despesa */}
      <GlassModal
        open={expOpen}
        title="Lançar custo ou despesa"
        onClose={() => {
          setExpOpen(false);
          setExpError(null);
        }}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          {expError ? <ErrorBanner message={expError} /> : null}
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Categoria</label>
            <select
              value={expCat}
              onChange={(e) => setExpCat(e.target.value as typeof expCat)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            >
              <option value="pagamento_fabrica" className="bg-[#181818]">Pagamento à Fábrica SP</option>
              <option value="frete" className="bg-[#181818]">Frete / Logística</option>
              <option value="servico_adicional" className="bg-[#181818]">Serviço adicional</option>
              <option value="despesa_operacional" className="bg-[#181818]">Despesa operacional da unidade</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Descrição *</label>
            <input
              type="text"
              required
              minLength={3}
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Valor (R$) *</label>
              <input
                type="text"
                required
                value={expAmountReais}
                onChange={(e) => setExpAmountReais(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Vencimento *</label>
              <input
                type="date"
                required
                value={expDue}
                onChange={(e) => setExpDue(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setExpOpen(false);
                setExpError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingExp}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {savingExp ? 'Salvando...' : 'Salvar custo'}
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
