'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { hubAsset, hubHomePath, portalFetch, PortalApiError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Informe o e-mail e a senha de acesso.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await portalFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      router.replace(hubHomePath());
    } catch (err) {
      setErrorMessage(
        err instanceof PortalApiError
          ? err.message
          : 'Não foi possível autenticar no portal. Verifique suas credenciais.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="king-studio apple-backdrop min-h-screen text-wise-ink flex flex-col items-center justify-center p-6 selection:bg-wise-primary selection:text-wise-on-primary">
      <div className="w-full max-w-md apple-glass rounded-[32px] p-8 relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <img
            src={hubAsset('/king-sports/logo.png')}
            alt="King Sports"
            width={168}
            height={42}
            className="mx-auto mb-2"
          />
          <h1 className="text-xl font-bold text-wise-ink tracking-tight">Portal do Franqueado King Sports</h1>
          <p className="text-xs text-wise-body font-medium">
            Acesso autenticado por unidade, perfil operacional &amp; Studio 3D
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/35 flex items-start gap-2.5 text-xs text-rose-200 font-semibold"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-wise-ink mb-1.5">
              E-mail corporativo
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-wise-body absolute left-3.5 top-3.5" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@unidade.kingsports"
                className="w-full apple-glass-well focus:border-blue-400/70 rounded-2xl px-4 py-3 pl-10 text-xs text-wise-ink font-semibold outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-wise-ink mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-wise-body absolute left-3.5 top-3.5" />
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full apple-glass-well focus:border-blue-400/70 rounded-2xl px-4 py-3 pl-10 text-xs text-wise-ink font-semibold outline-none"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full apple-glass-cta disabled:opacity-50 text-white font-semibold py-4 rounded-full text-xs transition-all flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando sessão segura...</span>
              </>
            ) : (
              <span>Entrar no Portal</span>
            )}
          </button>
        </form>

        <div className="pt-3 border-t border-white/12 flex items-center justify-between text-[11px] text-wise-body font-medium">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Sessão HttpOnly + Isolamento por Unidade
          </span>
        </div>
      </div>
    </div>
  );
}
