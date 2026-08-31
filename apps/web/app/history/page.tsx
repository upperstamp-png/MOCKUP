'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  History,
  ArrowLeft,
  Download,
  Share2,
  Calendar,
  User,
  Search,
  ExternalLink,
  Shirt,
} from 'lucide-react';
import { MockupExport } from '@mockup/types';

export default function HistoryPage() {
  const router = useRouter();
  const [exportsList, setExportsList] = useState<MockupExport[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      try {
        const token = localStorage.getItem('mockup_auth_token');
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4444/api/v1';
        const res = await fetch(`${apiBase}/exports`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setExportsList(data.exports || []);
        } else {
          throw new Error('Fallback mock');
        }
      } catch {
        // Mock fallback para dev
        setExportsList([
          {
            id: 'exp_01',
            tenant_id: 'tenant_01',
            seller_id: 'usr_01',
            client_name: 'Atlético Clube Pinheiros',
            front_png_url: 'https://placehold.co/400x400/e8ebe6/0e0f0c?text=Frente',
            back_png_url: 'https://placehold.co/400x400/e8ebe6/0e0f0c?text=Costas',
            sales_board_url: 'https://placehold.co/800x800/ffffff/0e0f0c?text=Prancha+Comercial',
            status: 'completed',
            width: 2000,
            height: 2000,
            processing_time_ms: 120,
            watermark_applied: false,
            layer_state: {
              version: 1,
              modelId: 'model_camisa_gola_careca',
              colorA: '#0f172a',
              colorB: '#38bdf8',
              view: 'front',
              elements: [],
              updatedAt: new Date().toISOString(),
            },
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
          },
          {
            id: 'exp_02',
            tenant_id: 'tenant_01',
            seller_id: 'usr_02',
            client_name: 'Grêmio Esportivo Universitário',
            front_png_url: 'https://placehold.co/400x400/e8ebe6/0e0f0c?text=Frente',
            back_png_url: 'https://placehold.co/400x400/e8ebe6/0e0f0c?text=Costas',
            sales_board_url: 'https://placehold.co/800x800/ffffff/0e0f0c?text=Prancha+Comercial',
            status: 'completed',
            width: 2000,
            height: 2000,
            processing_time_ms: 180,
            watermark_applied: false,
            layer_state: {
              version: 1,
              modelId: 'model_camisa_gola_careca',
              colorA: '#dc2626',
              colorB: '#facc15',
              view: 'front',
              elements: [],
              updatedAt: new Date().toISOString(),
            },
            created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }
    loadHistory();
  }, []);

  const filtered = exportsList.filter((item) =>
    item.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleReopenMockup = (item: MockupExport) => {
    router.push(`/studio?reopen=${item.id}`);
  };

  return (
    <div className="min-h-screen bg-wise-canvas-soft text-wise-ink flex flex-col selection:bg-wise-primary selection:text-wise-on-primary">
      {/* Topbar */}
      <header className="h-16 bg-wise-canvas border-b border-wise-border px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/studio"
            className="flex items-center gap-2 text-xs font-bold text-wise-body hover:text-wise-ink bg-wise-canvas-soft hover:bg-wise-border px-4 py-2 rounded-full transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Studio</span>
          </Link>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-wise-ink" />
            <h1 className="text-sm font-black text-wise-ink">Histórico de Propostas & Reabertura</h1>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Search */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-wise-body absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente ou equipe..."
              className="w-full bg-wise-canvas border border-wise-border focus:border-wise-ink rounded-full px-5 py-3 pl-11 text-xs text-wise-ink font-bold outline-none shadow-xs"
            />
          </div>
          <span className="text-xs font-bold text-wise-mute">{filtered.length} propostas registradas</span>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="py-20 text-center text-xs font-bold text-wise-mute">Carregando histórico...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-wise-border rounded-4xl bg-wise-canvas p-8">
            <History className="w-8 h-8 text-wise-mute mx-auto mb-2" />
            <p className="text-sm font-black text-wise-ink">Nenhuma proposta encontrada</p>
            <p className="text-xs text-wise-mute mt-1">Gere mockups no studio para exibi-los aqui.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-wise-canvas border border-wise-border rounded-4xl overflow-hidden hover:border-wise-body transition-all flex flex-col group shadow-wise"
              >
                <div className="aspect-video bg-wise-canvas-soft flex items-center justify-center border-b border-wise-border relative overflow-hidden">
                  <img
                    src={item.sales_board_url}
                    alt={item.client_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {item.watermark_applied && (
                    <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-wise-warning text-wise-warning-content font-black text-[10px]">
                      Trial
                    </span>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 text-xs text-wise-body">
                        <User className="w-3.5 h-3.5 text-wise-ink" />
                        <span className="font-black text-wise-ink">{item.client_name}</span>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-wise-primary-pale text-wise-ink-deep font-bold uppercase">
                        {item.status || 'concluído'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-wise-mute mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Shirt className="w-3 h-3" />
                        Camisa Gola Careca
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-wise-border space-y-2">
                    {/* Botão ABRIR MOCKUP (Wise Lime Green) */}
                    <button
                      onClick={() => handleReopenMockup(item)}
                      className="w-full bg-wise-primary hover:bg-wise-primary-active text-wise-on-primary text-xs font-black py-3 rounded-full flex items-center justify-center gap-2 transition-all shadow-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>ABRIR NO STUDIO & CONTINUAR</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.open(item.sales_board_url, '_blank')}
                        className="flex-1 bg-wise-canvas-soft hover:bg-wise-border text-wise-ink text-xs font-bold py-2 rounded-full flex items-center justify-center gap-1.5 transition-colors border border-wise-border"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar</span>
                      </button>
                      <button
                        onClick={() => {
                          const text = encodeURIComponent(
                            `Olá! Segue a proposta comercial do uniforme da sua equipe: ${item.sales_board_url}`
                          );
                          window.open(`https://wa.me/?text=${text}`, '_blank');
                        }}
                        className="bg-wise-primary-pale hover:bg-wise-primary text-wise-ink-deep p-2.5 rounded-full transition-colors"
                        title="Enviar via WhatsApp"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
