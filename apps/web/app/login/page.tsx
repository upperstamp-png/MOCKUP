'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Mail, Lock, AlertCircle, Loader2, Shirt } from 'lucide-react';
import { useSessionStore } from '@/features/studio/store/sessionStore';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('vendas@imperialuniformes.com.br');
  const [password, setPassword] = useState('123456');
  const [deviceLabel, setDeviceLabel] = useState('Notebook Vendas');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Informe o e-mail e a senha de acesso');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Simulação / Chamada à API de autenticação
      const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const authToken = `mock_jwt_token_${Date.now()}`;

      useSessionStore.getState().setSession({
        token: authToken,
        sessionToken,
        profile: {
          id: 'usr_01',
          tenant_id: 'tenant_01',
          full_name: 'Vendedor Imperial',
          email: email.trim(),
          role: 'seller',
          status: 'active',
          last_seen_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        licenseStatus: 'active',
      });

      router.push('/studio');
    } catch {
      setErrorMessage('Erro ao autenticar. Verifique seus dados.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-wise-canvas-soft flex flex-col items-center justify-center p-6 selection:bg-wise-primary selection:text-wise-on-primary">
      <div className="w-full max-w-md bg-wise-canvas border border-wise-border rounded-4xl p-8 shadow-wise-lg relative z-10 space-y-6">
        {/* Logo & Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-3xl bg-wise-primary text-wise-on-primary mb-2 shadow-sm font-black">
            <Shirt className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-wise-ink tracking-tight">TexCraft Studio</h1>
          <p className="text-xs text-wise-body font-medium">
            Acesso do Vendedor & Gestão da Confecção
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-wise-negative/10 border border-wise-negative/30 flex items-start gap-2.5 text-xs text-wise-negative font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-wise-ink mb-1.5">
              E-mail do Vendedor
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-wise-body absolute left-3.5 top-3.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vendas@empresa.com.br"
                className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 pl-10 text-xs text-wise-ink font-bold outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-wise-ink mb-1.5">
              Senha de Acesso
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-wise-body absolute left-3.5 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 pl-10 text-xs text-wise-ink font-bold outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-wise-ink mb-1.5">
              Identificação do Terminal
            </label>
            <input
              type="text"
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="Ex: Terminal Loja Centro"
              className="w-full bg-wise-canvas-soft border border-wise-border focus:border-wise-ink rounded-2xl px-4 py-3 text-xs text-wise-ink font-bold outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-wise-primary hover:bg-wise-primary-active disabled:opacity-50 text-wise-on-primary font-black py-4 rounded-full text-xs transition-all shadow-sm flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Entrar no Studio de Criação</span>
            )}
          </button>
        </form>

        {/* Security Footer */}
        <div className="pt-2 border-t border-wise-border flex items-center justify-center gap-1.5 text-[11px] text-wise-body font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-wise-positive" />
          <span>Sessão B2B Segura com Multi-tenancy RLS</span>
        </div>
      </div>
    </div>
  );
}
