'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Settings,
  ArrowLeft,
  Laptop,
  ShieldCheck,
  Trash2,
  LogOut,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { LicenseStatusResponse, Device } from '@mockup/types';
import { apiClient } from '@/lib/api-client';

export default function SettingsPage() {
  const router = useRouter();
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusResponse | null>(null);
  const [devices, setDevices] = useState<(Device & { isCurrent?: boolean })[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const status = await apiClient.getLicenseStatus();
        setLicenseStatus(status);

        // Fetch devices (via fetch autenticado)
        const token = apiClient.getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setDevices(d.devices || []);
        }
      } catch {
        // Mock fallback
        setLicenseStatus({
          valid: true,
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000 * 300).toISOString(),
          tenantId: 'tenant_01',
          tenantName: 'Fábrica Imperial Uniformes Esportivos',
          maxDevices: 3,
          activeDevicesCount: 2,
          currentDeviceId: 'dev_01',
        });
        setDevices([
          {
            id: 'dev_01',
            license_id: 'lic_01',
            tenant_id: 'tenant_01',
            fingerprint_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            device_name: 'Terminal Loja Centro (Este Computador)',
            user_agent: 'Chrome 128 / Windows',
            last_login: new Date().toISOString(),
            created_at: new Date().toISOString(),
            is_active: true,
            isCurrent: true,
          },
          {
            id: 'dev_02',
            license_id: 'lic_01',
            tenant_id: 'tenant_01',
            fingerprint_hash: 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce',
            device_name: 'Notebook Vendedor Externo',
            user_agent: 'Edge / MacOS',
            last_login: new Date(Date.now() - 3600000 * 12).toISOString(),
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
            is_active: true,
            isCurrent: false,
          },
        ]);
      }
    }
    loadData();
  }, []);

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Deseja realmente revogar o acesso deste terminal?')) return;

    try {
      await apiClient.revokeDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch {
      setErrorMsg('Erro ao revogar dispositivo');
    }
  };

  const handleLogout = () => {
    apiClient.setToken(null);
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/studio"
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-750 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Studio</span>
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-400" />
            <h1 className="text-sm font-bold text-white">Configurações & Dispositivos da Licença</h1>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors border border-red-500/30"
        >
          <LogOut className="w-4 h-4" />
          <span>Encerrar Sessão</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* License Overview Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">
                  {licenseStatus?.tenantName || 'Carregando...'}
                </h2>
                <p className="text-xs text-slate-400">Plano Comercial B2B</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase">
              {licenseStatus?.status || 'Ativa'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-500 block uppercase font-semibold">
                Limite de Terminais
              </span>
              <span className="text-xl font-bold text-white mt-1 block">
                {licenseStatus?.activeDevicesCount} / {licenseStatus?.maxDevices}
              </span>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-500 block uppercase font-semibold">
                Validade da Licença
              </span>
              <span className="text-sm font-bold text-slate-200 mt-1.5 block">
                {licenseStatus?.expiresAt
                  ? new Date(licenseStatus.expiresAt).toLocaleDateString('pt-BR')
                  : '—'}
              </span>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-500 block uppercase font-semibold">
                Status do Terminal
              </span>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold mt-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Autorizado</span>
              </div>
            </div>
          </div>
        </div>

        {/* Devices List Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Dispositivos Conectados
              </h3>
              <p className="text-[11px] text-slate-400">
                Terminais autorizados a utilizar a engine de criação de uniformes
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {devices.map((dev) => (
              <div
                key={dev.id}
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  dev.isCurrent
                    ? 'bg-sky-950/20 border-sky-500/50'
                    : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{dev.device_name}</span>
                      {dev.isCurrent && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold">
                          Este Dispositivo
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Último acesso: {new Date(dev.last_login).toLocaleString('pt-BR')} • {dev.user_agent}
                    </span>
                  </div>
                </div>

                {!dev.isCurrent && (
                  <button
                    onClick={() => handleRevokeDevice(dev.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Revogar Acesso"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
