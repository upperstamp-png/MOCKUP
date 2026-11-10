'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck,
  MessageSquare,
  Palette,
  Plus,
  Search,
  Send,
  Upload,
} from 'lucide-react';
import { fileToDataUrl, formatDateBr, portalFetch, PortalApiError } from '@/lib/api-client';
import type { PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface ArtProjectSummary {
  id: string;
  customer_id: string;
  customer_name: string;
  title: string;
  briefing: string;
  status: string;
  assignee_name: string | null;
  current_version_id: string | null;
  current_version_number: number | null;
  current_artifact_kind: string | null;
  approved_version_id: string | null;
  approved_version_number: number | null;
  versions_count: number;
  comments_count: number;
  updated_at: string;
}

interface ArtVersionItem {
  id: string;
  version_number: number;
  artifact_kind: 'mockup_ilustrativo' | 'arte_revisao' | 'arquivo_producao_rip';
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  preview_summary: string | null;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface ArtCommentItem {
  id: string;
  art_version_id: string | null;
  author_name: string;
  comment_type: 'comment' | 'revision_request' | 'internal_review';
  body: string;
  created_at: string;
}

interface ArtApprovalItem {
  id: string;
  art_version_id: string;
  version_number: number | null;
  approved_by_name: string;
  approved_by_contact: string | null;
  identification_method: string;
  acceptance_evidence: string;
  status: 'active' | 'superseded' | 'revoked';
  approved_at: string;
  superseded_at: string | null;
}

export function StudioArtsTab({
  me,
  initialEntityId,
}: {
  me: PortalMeResponse;
  initialEntityId?: string | null;
}) {
  const [projects, setProjects] = useState<ArtProjectSummary[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // New project modal
  const [newOpen, setNewOpen] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBriefing, setNewBriefing] = useState('');

  // Project Detail
  const [detail, setDetail] = useState<{
    project: ArtProjectSummary;
    versions: ArtVersionItem[];
    comments: ArtCommentItem[];
    approvals: ArtApprovalItem[];
  } | null>(null);

  // Upload Version Form
  const [artifactKind, setArtifactKind] = useState<'mockup_ilustrativo' | 'arte_revisao' | 'arquivo_producao_rip'>('arte_revisao');
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNotes, setVersionNotes] = useState('');
  const [uploadingVer, setUploadingVer] = useState(false);

  // Comment / Revision Request Form
  const [commentType, setCommentType] = useState<'comment' | 'revision_request'>('comment');
  const [commentBody, setCommentBody] = useState('');

  // Approval Form
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveVersionId, setApproveVersionId] = useState('');
  const [approvedByName, setApprovedByName] = useState('');
  const [approvedByContact, setApprovedByContact] = useState('');
  const [identificationMethod, setIdentificationMethod] = useState('Aprovação formal no Portal + WhatsApp do cliente');
  const [acceptanceEvidence, setAcceptanceEvidence] = useState('');

  const canWrite = me.activeRole.permissions.includes('arts:write');
  const canApprove = me.activeRole.permissions.includes('arts:approve');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [artRes, custRes] = await Promise.all([
        portalFetch<{ items: ArtProjectSummary[] }>(
          `/arts?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`
        ),
        portalFetch<{ items: Array<{ id: string; name: string }> }>('/crm/customers?limit=100').catch(() => ({ items: [] })),
      ]);
      setProjects(artRes.items || []);
      setCustomers(custRes.items || []);
      if (!newCustomerId && custRes.items?.[0]) setNewCustomerId(custRes.items[0].id);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar projetos de arte.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, newCustomerId]);

  const openDetail = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await portalFetch<{
        project: ArtProjectSummary;
        versions: ArtVersionItem[];
        comments: ArtCommentItem[];
        approvals: ArtApprovalItem[];
      }>(`/arts/${id}`);
      setDetail(res);
      if (res.versions?.[0]) setApproveVersionId(res.versions[0].id);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar detalhes da arte.');
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList, me.activeUnit.id]);

  useEffect(() => {
    if (initialEntityId) openDetail(initialEntityId);
  }, [initialEntityId, openDetail]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await portalFetch<{ project: { id: string } }>('/arts', {
        method: 'POST',
        body: JSON.stringify({
          customerId: newCustomerId,
          title: newTitle.trim(),
          briefing: newBriefing.trim(),
        }),
      });
      setNewOpen(false);
      setNewTitle('');
      setNewBriefing('');
      setFeedback('Projeto de arte criado. Envie uma versão no Portal ou gere mockup no Studio 3D.');
      await loadList();
      await openDetail(res.project.id);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao criar projeto de arte.');
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setUploadingVer(true);
    setError(null);
    try {
      let dataUrl: string | undefined;
      let fileName = `arte_${Date.now()}.txt`;
      let mimeType: string | undefined;
      if (versionFile) {
        const encoded = await fileToDataUrl(versionFile);
        dataUrl = encoded.dataUrl;
        fileName = encoded.fileName;
        mimeType = versionFile.type;
      }

      const res = await portalFetch<{ version: { version_number: number }; invalidatedApprovals: number }>(
        `/arts/${detail.project.id}/versions`,
        {
          method: 'POST',
          body: JSON.stringify({
            artifactKind,
            fileName,
            mimeType,
            dataUrl,
            notes: versionNotes.trim() || null,
          }),
        }
      );
      setVersionFile(null);
      setVersionNotes('');
      setFeedback(
        `Versão v${res.version.version_number} publicada.${res.invalidatedApprovals > 0 ? ' Aprovação anterior foi invalidada por substituição e exige novo aceite.' : ''}`
      );
      await openDetail(detail.project.id);
      await loadList();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao publicar versão de arte.');
    } finally {
      setUploadingVer(false);
    }
  };

  const handleDownloadVersion = async (versionId: string) => {
    if (!detail) return;
    try {
      const res = await portalFetch<{ signedUrl: string; fileName: string }>(
        `/arts/${detail.project.id}/versions/${versionId}/download`
      );
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Não foi possível gerar download autorizado.');
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    try {
      const res = await portalFetch<{ invalidatedApprovals: number }>(
        `/arts/${detail.project.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            artVersionId: detail.versions[0]?.id || null,
            commentType,
            body: commentBody.trim(),
          }),
        }
      );
      setCommentBody('');
      setFeedback(
        commentType === 'revision_request'
          ? `Revisão solicitada (${res.invalidatedApprovals} aprovação(ões) revogada(s)). Arte retornou para Ajustes.`
          : 'Comentário registrado.'
      );
      await openDetail(detail.project.id);
      await loadList();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao registrar comentário.');
    }
  };

  const handleApproveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !approveVersionId) return;
    try {
      const res = await portalFetch<{ versionNumber: number }>(`/arts/${detail.project.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          artVersionId: approveVersionId,
          approvedByName: approvedByName.trim(),
          approvedByContact: approvedByContact.trim() || null,
          identificationMethod: identificationMethod.trim(),
          acceptanceEvidence: acceptanceEvidence.trim(),
        }),
      });
      setApproveOpen(false);
      setApprovedByName('');
      setAcceptanceEvidence('');
      setFeedback(`Aprovação formal vinculada exatamente à versão v${res.versionNumber}.`);
      await openDetail(detail.project.id);
      await loadList();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao aprovar versão.');
    }
  };

  const handleStatusStep = async (nextStatus: 'revisao_interna' | 'enviado_ao_cliente') => {
    if (!detail) return;
    try {
      await portalFetch(`/arts/${detail.project.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      await openDetail(detail.project.id);
      await loadList();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar status.');
    }
  };

  if (loading && projects.length === 0) return <LoadingCard message="Carregando central de artes e aprovações..." />;

  const kindLabel = (k: string | null) => {
    if (k === 'mockup_ilustrativo') return 'Mockup ilustrativo (Studio 3D)';
    if (k === 'arquivo_producao_rip') return 'Arquivo final de produção (SP)';
    return 'Arte para revisão e aprovação';
  };

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} onRetry={loadList} /> : null}
      {feedback ? (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-3 text-xs font-semibold text-emerald-100 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">Fechar</button>
        </div>
      ) : null}

      <div className="apple-glass rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-wise-ink flex items-center gap-2">
            <Palette className="w-5 h-5 text-blue-400" />
            Arte &amp; Versionamento Controlado
          </h2>
          <p className="text-xs text-wise-mute">
            Separa mockup ilustrativo de arte para revisão e arquivo final fabril. Novas versões ou revisões revogam aceites antigos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/studio"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/16 border border-white/15 text-xs font-semibold text-white"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir Mockup Studio 3D
          </Link>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
            >
              <Plus className="w-4 h-4" /> Novo projeto de arte
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-wise-mute absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto ou cliente..."
            className="apple-glass-well rounded-full pl-9 pr-4 py-2 text-xs text-wise-ink outline-none w-60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
        >
          <option value="todos" className="bg-[#181818]">Todos os status</option>
          <option value="briefing_pendente" className="bg-[#181818]">Briefing pendente</option>
          <option value="em_criacao" className="bg-[#181818]">Em criação</option>
          <option value="revisao_interna" className="bg-[#181818]">Revisão interna</option>
          <option value="enviado_ao_cliente" className="bg-[#181818]">Enviado ao cliente</option>
          <option value="ajustes" className="bg-[#181818]">Ajustes solicitados</option>
          <option value="aprovado" className="bg-[#181818]">Aprovado</option>
        </select>
      </div>

      {projects.length === 0 ? (
        <EmptyStateCard
          title="Nenhum projeto de arte registrado"
          description="Crie um briefing ou gere uma prancha no Studio 3D para controlar versões e aprovações."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="apple-glass-subtle rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <StatusPill value={p.status} />
                  <span className="text-[11px] text-wise-mute">
                    {p.current_version_number ? `Atual: v${p.current_version_number}` : 'Sem versões'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-wise-ink">{p.title}</h3>
                <p className="text-xs text-blue-300 font-semibold">{p.customer_name}</p>
                <p className="text-xs text-wise-body line-clamp-2">{p.briefing || 'Sem briefing detalhado.'}</p>
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-wise-mute">
                <span>
                  {p.approved_version_number ? `Aprovada: v${p.approved_version_number}` : 'Sem versão aprovada'}
                </span>
                <button
                  type="button"
                  onClick={() => openDetail(p.id)}
                  className="px-3 py-1.5 rounded-full apple-glass-cta text-white text-xs font-semibold"
                >
                  Gerenciar versões ({p.versions_count})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Novo Projeto Modal */}
      <GlassModal
        open={newOpen}
        title="Novo projeto de arte & briefing"
        onClose={() => setNewOpen(false)}
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Cliente *</label>
            <select
              required
              value={newCustomerId}
              onChange={(e) => setNewCustomerId(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#181818]">{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Título do projeto *</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex: Uniforme Titular + Goleiro Copa 2026"
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Briefing (cores, escudo, patrocinadores, gola)</label>
            <textarea
              rows={3}
              value={newBriefing}
              onChange={(e) => setNewBriefing(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNewOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              Criar projeto
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Detalhe do Projeto de Arte */}
      <GlassModal
        open={Boolean(detail)}
        title={detail?.project.title || 'Projeto de Arte'}
        subtitle={detail ? `Cliente: ${detail.project.customer_name} · Status: ${detail.project.status}` : ''}
        onClose={() => setDetail(null)}
        maxWidthClass="max-w-4xl"
      >
        {detail ? (
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl apple-glass-well p-3.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusPill value={detail.project.status} />
                {detail.project.approved_version_number ? (
                  <span className="text-emerald-300 font-bold">
                    Versão aprovada vigente: v{detail.project.approved_version_number}
                  </span>
                ) : (
                  <span className="text-amber-200 font-semibold">Aguardando aprovação formal vinculada</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/studio?artProjectId=${encodeURIComponent(detail.project.id)}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-xs font-semibold text-white"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir no Studio 3D
                </Link>
                {canWrite && detail.versions.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleStatusStep('enviado_ao_cliente')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-xs font-semibold text-blue-100"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar ao cliente
                  </button>
                ) : null}
                {canApprove && detail.versions.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setApproveOpen(true)}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full apple-glass-cta text-xs font-semibold text-white"
                  >
                    <FileCheck className="w-3.5 h-3.5" /> Registrar Aprovação
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-xs text-wise-body">
              <strong className="text-wise-ink block mb-1">Briefing:</strong>
              {detail.project.briefing || 'Nenhum briefing preenchido.'}
            </div>

            {/* Publicar nova versão */}
            {canWrite ? (
              <form onSubmit={handleUploadVersion} className="rounded-2xl apple-glass-well p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-wise-ink flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-blue-400" />
                    Publicar nova versão imutável (v{detail.versions.length + 1})
                  </span>
                  {detail.project.approved_version_id ? (
                    <span className="text-[11px] text-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Nova versão invalidará a aprovação anterior!
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={artifactKind}
                    onChange={(e) => setArtifactKind(e.target.value as typeof artifactKind)}
                    className="bg-black/40 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  >
                    <option value="arte_revisao" className="bg-[#181818]">Arte para revisão e aprovação</option>
                    <option value="mockup_ilustrativo" className="bg-[#181818]">Mockup ilustrativo</option>
                    <option value="arquivo_producao_rip" className="bg-[#181818]">Arquivo final de produção (SP)</option>
                  </select>
                  <input
                    type="file"
                    accept="image/*,application/pdf,.svg"
                    onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                    className="text-xs text-wise-body file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-blue-500/25 file:text-blue-100 file:text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    placeholder="Alterações desta versão..."
                    className="flex-1 bg-black/40 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                  <button
                    type="submit"
                    disabled={uploadingVer}
                    className="px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {uploadingVer ? 'Enviando...' : 'Publicar versão'}
                  </button>
                </div>
              </form>
            ) : null}

            {/* Lista de versões */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-wise-mute">Histórico de Versões ({detail.versions.length})</h3>
              {detail.versions.length === 0 ? (
                <p className="text-xs text-wise-mute">Nenhuma versão enviada até o momento.</p>
              ) : (
                detail.versions.map((v) => {
                  const isApprovedVer = detail.project.approved_version_id === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`rounded-2xl p-3.5 border flex flex-wrap items-center justify-between gap-3 ${
                        isApprovedVer ? 'bg-emerald-500/10 border-emerald-400/40' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-wise-ink">v{v.version_number}</span>
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-wise-body">
                            {kindLabel(v.artifact_kind)}
                          </span>
                          {isApprovedVer ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 text-[10px] font-bold">
                              APROVADA VIGENTE
                            </span>
                          ) : null}
                        </div>
                        <p className="text-wise-body">{v.file_name || v.preview_summary || 'Versão registrada'}</p>
                        <p className="text-[11px] text-wise-mute">
                          Por {v.created_by_name || 'Unidade'} em {formatDateBr(v.created_at, { withTime: true })}
                          {v.notes ? ` · ${v.notes}` : ''}
                        </p>
                      </div>
                      {v.storage_path ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadVersion(v.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-xs font-semibold text-white"
                        >
                          <Download className="w-3.5 h-3.5" /> Baixar (privado)
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {/* Aprovações registradas */}
            {detail.approvals.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase text-wise-mute">Trilha de Aceites &amp; Revogações</h3>
                {detail.approvals.map((apv) => (
                  <div key={apv.id} className="rounded-xl apple-glass-well p-3 text-xs flex flex-wrap justify-between gap-2">
                    <div>
                      <span className="font-bold text-wise-ink">
                        Versão v{apv.version_number ?? '?'} · {apv.approved_by_name}
                      </span>
                      <p className="text-wise-body text-[11px]">
                        Método: {apv.identification_method} · Evidência: {apv.acceptance_evidence}
                      </p>
                      <p className="text-wise-mute text-[10px]">Carimbo: {formatDateBr(apv.approved_at, { withTime: true })}</p>
                    </div>
                    <StatusPill value={apv.status} />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Comentários e Revisões */}
            <div className="space-y-2.5 border-t border-white/12 pt-3">
              <h3 className="text-xs font-bold uppercase text-wise-mute flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Comentários e Solicitações de Ajuste ({detail.comments.length})
              </h3>
              <form onSubmit={handleComment} className="flex flex-col sm:flex-row gap-2">
                <select
                  value={commentType}
                  onChange={(e) => setCommentType(e.target.value as typeof commentType)}
                  className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                >
                  <option value="comment" className="bg-[#181818]">Comentário</option>
                  <option value="revision_request" className="bg-[#181818]">Solicitar ajuste (revoga aceite)</option>
                </select>
                <input
                  type="text"
                  required
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Descreva o comentário ou ajuste na arte..."
                  className="flex-1 apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                />
                <button type="submit" className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-xs font-semibold text-white">
                  Enviar
                </button>
              </form>
              <div className="space-y-2">
                {detail.comments.map((cm) => (
                  <div
                    key={cm.id}
                    className={`rounded-xl p-3 text-xs border ${
                      cm.comment_type === 'revision_request'
                        ? 'bg-rose-500/10 border-rose-400/35'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex justify-between text-[11px] text-wise-mute">
                      <strong className="text-wise-ink">{cm.author_name}</strong>
                      <span>{formatDateBr(cm.created_at, { withTime: true })}</span>
                    </div>
                    <p className="text-wise-body mt-1">{cm.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </GlassModal>

      {/* Modal Aprovação Formal Vinculada à Versão */}
      <GlassModal
        open={approveOpen}
        title="Registrar aprovação formal da arte"
        subtitle="Vinculada especificamente à versão escolhida, com identificação do aprovador e evidência."
        onClose={() => setApproveOpen(false)}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleApproveVersion} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Versão aprovada *</label>
            <select
              required
              value={approveVersionId}
              onChange={(e) => setApproveVersionId(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
            >
              {(detail?.versions || []).map((v) => (
                <option key={v.id} value={v.id} className="bg-[#181818]">
                  v{v.version_number} · {kindLabel(v.artifact_kind)} ({v.file_name || 'Sem anexo'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Nome completo do aprovador (cliente/responsável) *</label>
            <input
              type="text"
              required
              value={approvedByName}
              onChange={(e) => setApprovedByName(e.target.value)}
              placeholder="Ex: Marcos Oliveira (Presidente)"
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Contato / Documento do aprovador</label>
            <input
              type="text"
              value={approvedByContact}
              onChange={(e) => setApprovedByContact(e.target.value)}
              placeholder="(11) 99999-0000"
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Método de identificação *</label>
            <input
              type="text"
              required
              value={identificationMethod}
              onChange={(e) => setIdentificationMethod(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Evidência do aceite *</label>
            <textarea
              rows={2}
              required
              value={acceptanceEvidence}
              onChange={(e) => setAcceptanceEvidence(e.target.value)}
              placeholder="Ex: Cliente confirmou versão v2 via WhatsApp às 14:22 conferindo escudo e patrocínio"
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setApproveOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Confirmar aprovação
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
