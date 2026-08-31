'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  ArrowLeft,
  Users,
  Shirt,
  Sparkles,
  CreditCard,
  Laptop,
  BarChart3,
  Plus,
  Lock,
  Unlock,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { SellerProfile, ActiveSession } from '@mockup/types';
import {
  UniformTexture,
  getCustomUniformTextures,
  saveCustomUniformTexture,
  deleteCustomUniformTexture,
} from '@/lib/texture-manager';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sellers' | 'models' | 'patterns' | 'sessions' | 'billing'>('dashboard');

  // Textures State
  const [textures, setTextures] = useState<UniformTexture[]>([]);
  const [newTextureName, setNewTextureName] = useState('');
  const [newTextureCategory, setNewTextureCategory] = useState<'fabric_texture' | 'mask_part' | 'pattern'>('fabric_texture');
  const [newTextureTarget, setNewTextureTarget] = useState('all');
  const [uploadedTextureFile, setUploadedTextureFile] = useState<File | null>(null);
  const [uploadedTextureUrl, setUploadedTextureUrl] = useState<string>('');

  React.useEffect(() => {
    setTextures(getCustomUniformTextures());
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedTextureFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedTextureUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadTexture = () => {
    if (!newTextureName.trim() || !uploadedTextureUrl) return;

    const newTex: UniformTexture = {
      id: `tex_${Date.now()}`,
      name: newTextureName.trim(),
      category: newTextureCategory,
      targetPart: newTextureTarget,
      url: uploadedTextureUrl,
      blendMode: newTextureCategory === 'pattern' ? 'overlay' : 'multiply',
      opacity: 0.8,
      createdAt: new Date().toISOString(),
    };

    const updated = saveCustomUniformTexture(newTex);
    setTextures(updated);
    setNewTextureName('');
    setUploadedTextureFile(null);
    setUploadedTextureUrl('');
  };

  const handleDeleteTexture = (id: string) => {
    const updated = deleteCustomUniformTexture(id);
    setTextures(updated);
  };

  // Sellers State
  const [sellers, setSellers] = useState<SellerProfile[]>([
    {
      id: 'usr_01',
      tenant_id: 'tenant_01',
      full_name: 'Carlos Alberto Silva',
      email: 'carlos.vendas@imperialuniformes.com.br',
      role: 'seller',
      status: 'active',
      last_seen_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'usr_02',
      tenant_id: 'tenant_01',
      full_name: 'Mariana Souza Santos',
      email: 'mariana.souza@imperialuniformes.com.br',
      role: 'seller',
      status: 'active',
      last_seen_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  // Active Sessions State
  const [sessions, setSessions] = useState<ActiveSession[]>([
    {
      id: 'sess_01',
      tenant_id: 'tenant_01',
      license_id: 'lic_01',
      user_id: 'usr_01',
      device_label: 'Notebook Vendas Loja Centro (Chrome / Windows)',
      ip_address: '177.136.24.12',
      session_token_hash: 'hash_01',
      last_seen_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: 'sess_02',
      tenant_id: 'tenant_01',
      license_id: 'lic_01',
      user_id: 'usr_02',
      device_label: 'MacBook Air - Vendas Externas (Safari / macOS)',
      ip_address: '189.45.112.80',
      session_token_hash: 'hash_02',
      last_seen_at: new Date(Date.now() - 60000 * 3).toISOString(),
      created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    },
  ]);

  // New Seller Form
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerEmail, setNewSellerEmail] = useState('');

  const handleCreateSeller = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSellerName.trim() || !newSellerEmail.trim()) return;

    const newSeller: SellerProfile = {
      id: `usr_${Date.now()}`,
      tenant_id: 'tenant_01',
      full_name: newSellerName.trim(),
      email: newSellerEmail.trim(),
      role: 'seller',
      status: 'active',
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setSellers([newSeller, ...sellers]);
    setNewSellerName('');
    setNewSellerEmail('');
  };

  const handleToggleSellerStatus = (sellerId: string) => {
    setSellers(
      sellers.map((s) =>
        s.id === sellerId ? { ...s, status: s.status === 'active' ? 'blocked' : 'active' } : s
      )
    );
  };

  const handleTerminateSession = (sessionId: string) => {
    setSessions(sessions.filter((s) => s.id !== sessionId));
  };

  return (
    <div className="min-h-screen bg-wise-canvas-soft text-wise-ink flex flex-col selection:bg-wise-primary selection:text-wise-on-primary">
      {/* Header */}
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
            <Shield className="w-5 h-5 text-wise-ink" />
            <h1 className="text-sm font-black text-wise-ink">Painel da Confecção & Gestão B2B</h1>
          </div>
        </div>
      </header>

      {/* Admin Tabs */}
      <div className="bg-wise-canvas border-b border-wise-border px-6 flex items-center gap-2 overflow-x-auto py-2">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 py-2 px-4 text-xs font-black rounded-full transition-all ${
            activeTab === 'dashboard' ? 'bg-wise-ink text-wise-canvas shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('sellers')}
          className={`flex items-center gap-2 py-2 px-4 text-xs font-black rounded-full transition-all ${
            activeTab === 'sellers' ? 'bg-wise-ink text-wise-canvas shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Vendedores ({sellers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 py-2 px-4 text-xs font-black rounded-full transition-all ${
            activeTab === 'sessions' ? 'bg-wise-ink text-wise-canvas shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>Sessões Ativas ({sessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-2 py-2 px-4 text-xs font-black rounded-full transition-all ${
            activeTab === 'models' ? 'bg-wise-ink text-wise-canvas shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <Shirt className="w-4 h-4" />
          <span>Modelo Ativo</span>
        </button>

        <button
          onClick={() => setActiveTab('patterns')}
          className={`flex items-center gap-2 py-2 px-4 text-xs font-black rounded-full transition-all ${
            activeTab === 'patterns' ? 'bg-wise-ink text-wise-canvas shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Texturas & Máscaras ({textures.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('billing')}
          className={`flex items-center gap-2 py-2 px-4 text-xs font-black rounded-full transition-all ${
            activeTab === 'billing' ? 'bg-wise-ink text-wise-canvas shadow-sm' : 'text-wise-body hover:text-wise-ink'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Plano & Assinatura</span>
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* TAB DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-6 rounded-4xl bg-wise-canvas border border-wise-border space-y-1 shadow-wise">
                <span className="text-[11px] font-black text-wise-mute uppercase">Mockups no Mês</span>
                <p className="text-3xl font-black text-wise-ink">1.428</p>
                <span className="text-xs text-wise-positive flex items-center gap-1 font-bold">
                  <TrendingUp className="w-3.5 h-3.5" /> +18.4% vs anterior
                </span>
              </div>
              <div className="p-6 rounded-4xl bg-wise-canvas border border-wise-border space-y-1 shadow-wise">
                <span className="text-[11px] font-black text-wise-mute uppercase">Mockups Hoje</span>
                <p className="text-3xl font-black text-wise-ink">84</p>
                <span className="text-xs text-wise-body">Média de 1.8 min por proposta</span>
              </div>
              <div className="p-6 rounded-4xl bg-wise-canvas border border-wise-border space-y-1 shadow-wise">
                <span className="text-[11px] font-black text-wise-mute uppercase">Vendedores Ativos</span>
                <p className="text-3xl font-black text-wise-ink">{sellers.length}</p>
                <span className="text-xs text-wise-body">{sessions.length} terminais online</span>
              </div>
              <div className="p-6 rounded-4xl bg-wise-canvas border border-wise-border space-y-1 shadow-wise">
                <span className="text-[11px] font-black text-wise-mute uppercase">Plano B2B</span>
                <p className="text-3xl font-black text-wise-ink">Confecção Pro</p>
                <span className="text-xs text-wise-positive font-bold">Ativo • 285 dias</span>
              </div>
            </div>

            {/* Ranking */}
            <div className="bg-wise-canvas border border-wise-border rounded-4xl p-6 space-y-4 shadow-wise">
              <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider">
                Ranking de Vendedores por Propostas Enviadas
              </h3>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-wise-canvas-soft border border-wise-border-subtle">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-wise-primary text-wise-on-primary font-black text-xs flex items-center justify-center">1</span>
                    <div>
                      <p className="text-xs font-black text-wise-ink">Carlos Alberto Silva</p>
                      <p className="text-[11px] text-wise-body">carlos.vendas@imperialuniformes.com.br</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-wise-ink">842 propostas</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-wise-canvas-soft border border-wise-border-subtle">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-wise-canvas border border-wise-border text-wise-ink font-black text-xs flex items-center justify-center">2</span>
                    <div>
                      <p className="text-xs font-black text-wise-ink">Mariana Souza Santos</p>
                      <p className="text-[11px] text-wise-body">mariana.souza@imperialuniformes.com.br</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-wise-ink">586 propostas</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB VENDEDORES */}
        {activeTab === 'sellers' && (
          <div className="space-y-6">
            {/* Form */}
            <form onSubmit={handleCreateSeller} className="bg-wise-canvas border border-wise-border rounded-4xl p-6 space-y-4 shadow-wise">
              <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-wise-ink" />
                Cadastrar / Convidar Novo Vendedor
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Nome Completo do Vendedor"
                  value={newSellerName}
                  onChange={(e) => setNewSellerName(e.target.value)}
                  className="bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
                />
                <input
                  type="email"
                  placeholder="E-mail de Acesso"
                  value={newSellerEmail}
                  onChange={(e) => setNewSellerEmail(e.target.value)}
                  className="bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
                />
              </div>
              <button
                type="submit"
                className="bg-wise-primary hover:bg-wise-primary-active text-wise-on-primary font-black px-6 py-3 rounded-full text-xs transition-all shadow-sm"
              >
                Convidar Vendedor
              </button>
            </form>

            {/* List */}
            <div className="bg-wise-canvas border border-wise-border rounded-4xl overflow-hidden shadow-wise divide-y divide-wise-border">
              {sellers.map((seller) => (
                <div key={seller.id} className="p-5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-wise-ink">{seller.full_name}</span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                        seller.status === 'active' ? 'bg-wise-primary-pale text-wise-ink-deep' : 'bg-wise-negative/10 text-wise-negative'
                      }`}>
                        {seller.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-wise-body mt-0.5">{seller.email}</p>
                  </div>
                  <button
                    onClick={() => handleToggleSellerStatus(seller.id)}
                    className={`text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 transition-colors border ${
                      seller.status === 'active'
                        ? 'border-wise-negative/30 text-wise-negative hover:bg-wise-negative/10'
                        : 'border-wise-positive/30 text-wise-positive hover:bg-wise-positive/10'
                    }`}
                  >
                    {seller.status === 'active' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    <span>{seller.status === 'active' ? 'Bloquear Acesso' : 'Ativar Acesso'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB SESSÕES */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider">
                Terminais & Sessões Simultâneas Conectadas
              </h3>
              <span className="text-xs font-bold text-wise-body">Limite: 3 terminais</span>
            </div>

            <div className="bg-wise-canvas border border-wise-border rounded-4xl divide-y divide-wise-border shadow-wise">
              {sessions.map((sess) => (
                <div key={sess.id} className="p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-wise-ink" />
                      <span className="text-xs font-black text-wise-ink">{sess.device_label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-wise-mute">
                      <span>IP: {sess.ip_address}</span>
                      <span>Último pulso: {new Date(sess.last_seen_at).toLocaleTimeString('pt-BR')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTerminateSession(sess.id)}
                    className="text-xs text-wise-negative hover:bg-wise-negative/10 px-4 py-2 rounded-full border border-wise-negative/30 flex items-center gap-1.5 font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Derrubar Sessão</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB MODELO ATIVO */}
        {activeTab === 'models' && (
          <div className="space-y-6">
            <div className="bg-wise-canvas border border-wise-border rounded-4xl p-6 space-y-4 shadow-wise">
              <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider">
                Modelo Ativo da Confecção
              </h3>
              <div className="flex items-center gap-4 p-4 rounded-3xl bg-wise-canvas-soft border border-wise-border">
                <div className="w-20 h-20 rounded-2xl bg-white border border-wise-border flex items-center justify-center p-2">
                  <img src="/assets/MOCKUP_MULTIPLAY.png" alt="Camisa Gola Careca" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-wise-ink">Camisa Gola Careca</h4>
                  <p className="text-xs text-wise-body">Camada de textura industrial e sombras em modo de mesclagem Multiply.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB TEXTURAS & MÁSCARAS DO UNIFORME */}
        {activeTab === 'patterns' && (
          <div className="space-y-6">
            {/* Form de Upload de Nova Textura */}
            <div className="bg-wise-canvas border border-wise-border rounded-4xl p-6 space-y-4 shadow-wise">
              <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-wise-ink" />
                Cadastrar e Subir Nova Textura / Máscara do Uniforme
              </h3>
              <p className="text-xs text-wise-body">
                Envie arquivos PNG com fundo transparente, texturas de trama de tecido (Dry-Fit, Piquet) ou estampas sublimadas. As novas texturas ficam disponíveis imediatamente no Studio para todos os vendedores.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-wise-mute uppercase mb-1">Nome da Textura</label>
                  <input
                    type="text"
                    placeholder="Ex: Dry-Fit Furadinho 2026"
                    value={newTextureName}
                    onChange={(e) => setNewTextureName(e.target.value)}
                    className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-wise-mute uppercase mb-1">Categoria / Tipo</label>
                  <select
                    value={newTextureCategory}
                    onChange={(e) => setNewTextureCategory(e.target.value as any)}
                    className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
                  >
                    <option value="fabric_texture">🧵 Trama de Tecido (Dry-Fit / Piquet)</option>
                    <option value="mask_part">✂️ Nova Máscara / Recorte de Peça</option>
                    <option value="pattern">🎨 Estampa Sublimada (Pattern)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-wise-mute uppercase mb-1">Parte de Aplicação</label>
                  <select
                    value={newTextureTarget}
                    onChange={(e) => setNewTextureTarget(e.target.value)}
                    className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
                  >
                    <option value="all">Uniforme Completo (Todas as partes)</option>
                    <option value="front">Frente da Camisa</option>
                    <option value="back">Costas da Camisa</option>
                    <option value="sleeves">Mangas (Esquerda + Direita)</option>
                    <option value="collar">Gola</option>
                  </select>
                </div>
              </div>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-wise-border hover:border-wise-ink bg-wise-canvas-soft rounded-3xl p-6 cursor-pointer transition-all">
                <div className="w-10 h-10 rounded-full bg-wise-primary flex items-center justify-center text-wise-on-primary mb-2 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-xs font-black text-wise-ink">
                  {uploadedTextureFile ? `Arquivo selecionado: ${uploadedTextureFile.name}` : 'Clique para selecionar o arquivo da Textura / Máscara (PNG, SVG ou JPG)'}
                </span>
                <span className="text-[11px] text-wise-mute mt-0.5">Suporta PNG transparente com alta resolução</span>
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleUploadTexture}
                disabled={!uploadedTextureFile || !newTextureName.trim()}
                className="bg-wise-primary hover:bg-wise-primary-active disabled:opacity-50 text-wise-on-primary font-black px-6 py-3 rounded-full text-xs transition-all shadow-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Salvar e Publicar Textura no Studio</span>
              </button>
            </div>

            {/* Lista de Texturas Ativas */}
            <div className="bg-wise-canvas border border-wise-border rounded-4xl p-6 space-y-4 shadow-wise">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-wise-ink uppercase tracking-wider">
                  Texturas e Máscaras Disponíveis no Sistema ({textures.length})
                </h3>
                <span className="text-[11px] font-bold text-wise-mute">Sincronização em tempo real</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {textures.map((tex) => (
                  <div
                    key={tex.id}
                    className="p-4 rounded-3xl bg-wise-canvas-soft border border-wise-border flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span className="text-xs font-black text-wise-ink block leading-tight">{tex.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-wise-primary-pale text-wise-ink-deep inline-block">
                          {tex.category === 'fabric_texture'
                            ? 'Tecido / Relevo'
                            : tex.category === 'mask_part'
                            ? 'Máscara'
                            : 'Estampa'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteTexture(tex.id)}
                        className="text-wise-mute hover:text-wise-negative p-1.5 rounded-full hover:bg-white transition-colors"
                        title="Excluir textura"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="w-full h-24 rounded-2xl bg-white border border-wise-border flex items-center justify-center p-2 overflow-hidden">
                      <img
                        src={tex.url}
                        alt={tex.name}
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-bold text-wise-mute pt-2 border-t border-wise-border/50">
                      <span>Aplicação: {tex.targetPart === 'all' ? 'Uniforme Todo' : tex.targetPart}</span>
                      <span className="text-wise-success font-black">● Ativa</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB BILLING */}
        {activeTab === 'billing' && (
          <div className="bg-wise-canvas border border-wise-border rounded-4xl p-8 space-y-6 shadow-wise">
            <div className="flex items-center justify-between border-b border-wise-border pb-4">
              <div>
                <h3 className="text-base font-black text-wise-ink">Assinatura B2B TexCraft Studio</h3>
                <p className="text-xs text-wise-body">Gateway de Pagamento com Renovação Automática</p>
              </div>
              <span className="px-3.5 py-1 rounded-full bg-wise-primary-pale text-wise-ink-deep font-black text-xs">
                PLANO ATIVO
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-3xl bg-wise-canvas-soft border border-wise-border">
                <span className="text-[10px] uppercase font-black text-wise-mute">Plano Contratado</span>
                <p className="text-sm font-black text-wise-ink mt-1">SaaS Confecção Pro</p>
              </div>
              <div className="p-5 rounded-3xl bg-wise-canvas-soft border border-wise-border">
                <span className="text-[10px] uppercase font-black text-wise-mute">Terminais Permitidos</span>
                <p className="text-sm font-black text-wise-ink mt-1">Até 3 Vendedores Simultâneos</p>
              </div>
              <div className="p-5 rounded-3xl bg-wise-canvas-soft border border-wise-border">
                <span className="text-[10px] uppercase font-black text-wise-mute">Exportação</span>
                <p className="text-sm font-black text-wise-positive mt-1">2000x2000px Alta Resolução</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
