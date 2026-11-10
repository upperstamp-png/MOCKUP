'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Printer } from 'lucide-react';
import { formatBrl, formatDateBr, hubAsset, portalFetch, PortalApiError } from '@/lib/api-client';

interface SharedQuoteResponse {
  quote: {
    id: string;
    quote_number: string;
    status: string;
    subtotal_cents: string;
    personalization_total_cents: string;
    additional_services_cents: string;
    shipping_cents: string;
    discount_cents: string;
    total_cents: string;
    payment_terms: string | null;
    valid_until: string | null;
    estimated_delivery_days: number | null;
    terms_text: string | null;
    approved_at: string | null;
    approved_by_name: string | null;
    customer_name: string;
    unit_name: string;
    unit_city: string;
    unit_state: string;
  };
  items: Array<{
    product_sku: string;
    product_name: string;
    quantity: number;
    unit_sale_price_cents: string;
    personalization_summary: string | null;
    personalization_cents: string;
    line_total_cents: string;
  }>;
}

export default function SharedQuotePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<SharedQuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    portalFetch<SharedQuoteResponse>(`/quotes/shared/${encodeURIComponent(token)}`)
      .then((res) => setData(res))
      .catch((err) => {
        setError(err instanceof PortalApiError ? err.message : 'Proposta indisponível ou link expirado.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="king-studio apple-backdrop min-h-screen text-wise-ink p-4 sm:p-8 flex justify-center">
      <div className="w-full max-w-4xl space-y-5">
        {loading ? (
          <div className="apple-glass rounded-3xl p-10 flex items-center justify-center gap-3 text-sm text-wise-body">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span>Carregando proposta comercial King Sports...</span>
          </div>
        ) : error || !data ? (
          <div className="apple-glass rounded-3xl p-8 border border-rose-400/35 bg-rose-500/10 flex items-start gap-3 text-sm text-rose-100">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-300" />
            <div>
              <h1 className="font-bold">Link de proposta inválido ou desativado</h1>
              <p className="text-xs text-rose-200 mt-1">{error}</p>
            </div>
          </div>
        ) : (
          <div className="apple-glass rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/12 pb-5">
              <div className="space-y-2">
                <img src={hubAsset('/king-sports/logo.png')} alt="King Sports" width={144} height={36} />
                <h1 className="text-2xl font-bold text-wise-ink">
                  Proposta Comercial {data.quote.quote_number}
                </h1>
                <p className="text-xs text-wise-body">
                  Unidade Emissora: {data.quote.unit_name} · {data.quote.unit_city}/{data.quote.unit_state}
                </p>
              </div>
              <div className="text-right space-y-1 text-xs">
                <p className="font-bold text-wise-ink">Cliente: {data.quote.customer_name}</p>
                <p className="text-wise-body">
                  Validade: {data.quote.valid_until ? formatDateBr(data.quote.valid_until) : 'A confirmar'}
                </p>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="no-print mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full apple-glass-cta text-white font-semibold text-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir / Salvar PDF
                </button>
              </div>
            </div>

            {data.quote.approved_at && (
              <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/35 p-3.5 flex items-center gap-2 text-xs text-emerald-100 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>
                  Proposta aprovada em {formatDateBr(data.quote.approved_at, { withTime: true })}
                  {data.quote.approved_by_name ? ` por ${data.quote.approved_by_name}` : ''}.
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-wise-mute uppercase border-b border-white/12">
                  <tr>
                    <th className="py-2.5 pr-3">Produto</th>
                    <th className="py-2.5 pr-3">Qtd</th>
                    <th className="py-2.5 pr-3">Valor Unit.</th>
                    <th className="py-2.5 pr-3">Personalização</th>
                    <th className="py-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-3 pr-3">
                        <span className="font-bold text-wise-ink block">{item.product_name}</span>
                        <span className="text-[11px] text-wise-mute">{item.product_sku}</span>
                      </td>
                      <td className="py-3 pr-3">{item.quantity} un</td>
                      <td className="py-3 pr-3">{formatBrl(Number(item.unit_sale_price_cents))}</td>
                      <td className="py-3 pr-3 text-wise-body">
                        {item.personalization_summary || 'Padrão'}
                        {Number(item.personalization_cents) > 0
                          ? ` (+${formatBrl(Number(item.personalization_cents))}/un)`
                          : ''}
                      </td>
                      <td className="py-3 text-right font-bold text-wise-ink">
                        {formatBrl(Number(item.line_total_cents))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="apple-glass-well rounded-2xl p-4 space-y-2 text-xs text-wise-body">
                <p>
                  <strong className="text-wise-ink">Condições de pagamento:</strong>{' '}
                  {data.quote.payment_terms || 'A combinar com a unidade.'}
                </p>
                <p>
                  <strong className="text-wise-ink">Prazo indicativo após aprovações:</strong>{' '}
                  {data.quote.estimated_delivery_days
                    ? `${data.quote.estimated_delivery_days} dias corridos após aprovação da arte final, grade de tamanhos e entrada financeira`
                    : 'A confirmar conforme programação da fábrica.'}
                </p>
                {data.quote.terms_text && <p>{data.quote.terms_text}</p>}
              </div>

              <div className="apple-glass-well rounded-2xl p-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-wise-body">
                  <span>Subtotal peças</span>
                  <span>{formatBrl(Number(data.quote.subtotal_cents))}</span>
                </div>
                <div className="flex justify-between text-wise-body">
                  <span>Personalização</span>
                  <span>{formatBrl(Number(data.quote.personalization_total_cents))}</span>
                </div>
                <div className="flex justify-between text-wise-body">
                  <span>Serviços adicionais</span>
                  <span>{formatBrl(Number(data.quote.additional_services_cents))}</span>
                </div>
                <div className="flex justify-between text-wise-body">
                  <span>Frete estimado</span>
                  <span>{formatBrl(Number(data.quote.shipping_cents))}</span>
                </div>
                <div className="flex justify-between text-wise-body">
                  <span>Desconto</span>
                  <span>-{formatBrl(Number(data.quote.discount_cents))}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-wise-ink border-t border-white/15 pt-2 mt-2">
                  <span>Total da Proposta</span>
                  <span>{formatBrl(Number(data.quote.total_cents))}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
