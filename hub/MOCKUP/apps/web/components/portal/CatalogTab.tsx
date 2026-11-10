'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Boxes, FileText, Info, Ruler, Search, ShieldAlert, Sparkles } from 'lucide-react';
import { formatBrl, hubAsset, portalFetch, PortalApiError } from '@/lib/api-client';
import type { ModuleTabId, PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface ProductItem {
  id: string;
  sku: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  modeling: string | null;
  fabric: string;
  composition: string | null;
  size_chart: Record<string, string>;
  personalizations_supported: string[];
  min_quantity: number;
  lead_time_min_days: number;
  lead_time_max_days: number;
  availability_status: string;
  availability_note: string | null;
  image_url: string | null;
  studio_model_id: string | null;
  supply_price_cents: number | null;
  suggested_sale_price_cents: number | null;
  unit_cost_cents: number | null;
  additional_costs: Record<string, string | number>;
}

interface PriceListSummary {
  id: string;
  code: string;
  name: string;
  version_code: string;
  profile_scope: string;
  valid_from: string;
  valid_until: string | null;
}

export function CatalogTab({
  me,
  onNavigate,
}: {
  me: PortalMeResponse;
  onNavigate: (tab: ModuleTabId, opts?: { action?: string }) => void;
}) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [activeList, setActiveList] = useState<PriceListSummary | null>(null);
  const [lists, setLists] = useState<PriceListSummary[]>([]);
  const [selectedListCode, setSelectedListCode] = useState<string>('');
  const [category, setCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [governanceNote, setGovernanceNote] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (category !== 'Todos') qs.set('category', category);
      if (search.trim()) qs.set('search', search.trim());
      if (selectedListCode) qs.set('priceListCode', selectedListCode);

      const res = await portalFetch<{
        activePriceList: PriceListSummary | null;
        availablePriceLists: PriceListSummary[];
        items: ProductItem[];
        priceGovernanceNote: string;
      }>(`/catalog/products?${qs.toString()}`);

      setProducts(res.items || []);
      setActiveList(res.activePriceList);
      setLists(res.availablePriceLists || []);
      setGovernanceNote(res.priceGovernanceNote || '');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao consultar catálogo de produtos.');
    } finally {
      setLoading(false);
    }
  }, [category, search, selectedListCode]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog, me.activeUnit.id]);

  const categories = ['Todos', ...Array.from(new Set(products.map((p) => p.category)))];

  if (loading && products.length === 0) return <LoadingCard message="Carregando catálogo oficial King Sports..." />;

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} onRetry={loadCatalog} /> : null}

      <div className="apple-glass rounded-3xl p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-wise-ink flex items-center gap-2">
              <Boxes className="w-5 h-5 text-blue-400" />
              Produtos, Fichas Técnicas &amp; Tabelas Vigentes
            </h2>
            <p className="text-xs text-wise-mute mt-0.5">
              {activeList
                ? `Tabela ativa: ${activeList.name} · Versão ${activeList.version_code} (vigente desde ${activeList.valid_from.slice(0, 10).split('-').reverse().join('/')})`
                : 'Nenhuma tabela de preço ativa vinculada.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lists.length > 0 ? (
              <select
                value={selectedListCode || activeList?.code || ''}
                onChange={(e) => setSelectedListCode(e.target.value)}
                className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.code} className="bg-[#181818]">
                    {l.name} ({l.version_code})
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
        {governanceNote ? (
          <div className="rounded-2xl bg-blue-500/10 border border-blue-400/25 px-3.5 py-2.5 text-[11px] text-blue-100 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-300" />
            <span>{governanceNote}</span>
          </div>
        ) : null}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
                category === cat
                  ? 'apple-glass-cta text-white'
                  : 'bg-white/6 border-white/12 text-wise-body hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-wise-mute absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar SKU, modelo ou tecido..."
            className="apple-glass-well rounded-full pl-9 pr-4 py-2 text-xs text-wise-ink outline-none w-60"
          />
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyStateCard
          title="Nenhum produto encontrado"
          description="Ajuste a busca ou categoria selecionada."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map((p) => {
            const isBlockedLegal = p.availability_status === 'legal_review';
            return (
              <div
                key={p.id}
                className={`apple-glass-subtle rounded-3xl p-4 flex flex-col justify-between gap-3 border ${
                  isBlockedLegal ? 'border-rose-400/40' : 'border-white/12'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-20 h-20 rounded-2xl bg-black/40 border border-white/15 overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={hubAsset(p.image_url || `/king-sports/${p.slug}.webp`)}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase text-blue-300">{p.sku}</span>
                      <StatusPill value={p.availability_status} />
                    </div>
                    <h3 className="text-sm font-bold text-wise-ink truncate">{p.name}</h3>
                    <p className="text-[11px] text-wise-body line-clamp-2">{p.fabric}</p>
                    <p className="text-[11px] text-wise-mute">
                      MOQ: {p.min_quantity} un · Prazo ind.: {p.lead_time_min_days}–{p.lead_time_max_days} dias
                    </p>
                  </div>
                </div>

                {isBlockedLegal ? (
                  <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-3 py-2 text-[11px] text-rose-100 flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{p.availability_note || 'Uso comercial suspenso até parecer de marca (P03).'}</span>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl apple-glass-well p-2.5">
                    <span className="text-[10px] text-wise-mute block">Fornecimento tabela</span>
                    <span className="font-bold text-wise-ink">
                      {p.supply_price_cents !== null ? formatBrl(p.supply_price_cents) : 'Não configurado'}
                    </span>
                  </div>
                  <div className="rounded-xl apple-glass-well p-2.5">
                    <span className="text-[10px] text-wise-mute block">Sugestão venda</span>
                    <span className="font-bold text-blue-300">
                      {p.suggested_sale_price_cents !== null ? formatBrl(p.suggested_sale_price_cents) : 'Não configurado'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(p)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white"
                  >
                    <Ruler className="w-3.5 h-3.5" /> Medidas &amp; Ficha
                  </button>
                  <div className="flex items-center gap-2">
                    {p.studio_model_id && !isBlockedLegal ? (
                      <Link
                        href={`/studio?model=${encodeURIComponent(p.slug)}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-blue-200"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Studio
                      </Link>
                    ) : null}
                    {!isBlockedLegal && me.activeRole.permissions.includes('quotes:write') ? (
                      <button
                        type="button"
                        onClick={() => onNavigate('quotes', { action: 'new-quote' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full apple-glass-cta text-xs font-semibold text-white"
                      >
                        <FileText className="w-3.5 h-3.5" /> Orçar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Ficha Técnica & Tabela de Medidas */}
      <GlassModal
        open={Boolean(selectedProduct)}
        title={selectedProduct?.name || ''}
        subtitle={selectedProduct ? `SKU ${selectedProduct.sku} · ${selectedProduct.category}` : ''}
        onClose={() => setSelectedProduct(null)}
      >
        {selectedProduct ? (
          <div className="space-y-4 text-xs">
            <p className="text-wise-body">{selectedProduct.description}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl apple-glass-well p-3 space-y-1">
                <span className="text-[10px] uppercase font-bold text-wise-mute">Tecido &amp; Composição</span>
                <p className="font-semibold text-wise-ink">{selectedProduct.fabric}</p>
                <p className="text-wise-mute">{selectedProduct.composition || 'Conforme ficha técnica oficial SP'}</p>
              </div>
              <div className="rounded-xl apple-glass-well p-3 space-y-1">
                <span className="text-[10px] uppercase font-bold text-wise-mute">Personalizações Suportadas</span>
                <p className="font-semibold text-wise-ink">
                  {(selectedProduct.personalizations_supported || []).join(', ') || 'Sublimação total'}
                </p>
                {selectedProduct.additional_costs && Object.keys(selectedProduct.additional_costs).length > 0 ? (
                  <p className="text-amber-200">
                    Adicionais configurados: {JSON.stringify(selectedProduct.additional_costs)}
                  </p>
                ) : null}
              </div>
            </div>

            {selectedProduct.size_chart && Object.keys(selectedProduct.size_chart).length > 0 ? (
              <div className="space-y-2">
                <span className="text-[11px] uppercase font-bold text-wise-mute">Tabela de Medidas Referência (cm)</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(selectedProduct.size_chart).map(([sz, dims]) => (
                    <div key={sz} className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                      <span className="font-bold text-wise-ink block">{sz}</span>
                      <span className="text-[11px] text-wise-body">{dims}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassModal>
    </div>
  );
}
