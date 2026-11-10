'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Video,
} from 'lucide-react';
import { fileToDataUrl, formatDateBr, portalFetch, PortalApiError } from '@/lib/api-client';
import type { PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface LessonItem {
  id: string;
  course_id: string;
  lesson_order: number;
  title: string;
  summary: string | null;
  video_url: string;
  duration_seconds: number;
  checklist_items: string[];
  quiz_questions: Array<{ question: string; options: string[]; correctIndex: number }>;
  progress: {
    status: string;
    resume_position_seconds: number;
    quiz_score_pct: number | null;
    completed_at: string | null;
  };
}

interface CourseItem {
  id: string;
  sector_order: number;
  slug: string;
  title: string;
  description: string | null;
  is_mandatory: boolean;
  completedLessonsCount: number;
  totalLessonsCount: number;
  lessons: LessonItem[];
}

interface TrainingResponse {
  courses: CourseItem[];
  governanceSeparation: {
    userTrainingCompleted: boolean;
    unitBancaApproved: boolean;
    unitOperationalStatus: string;
    note: string;
  };
}

export function TrainingTab({ me }: { me: PortalMeResponse }) {
  const [data, setData] = useState<TrainingResponse | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);
  const [activeLesson, setActiveLesson] = useState<LessonItem | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selectedCourseIdRef = useRef<string | null>(null);
  const activeLessonIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedCourseIdRef.current = selectedCourse?.id ?? null;
  }, [selectedCourse]);

  useEffect(() => {
    activeLessonIdRef.current = activeLesson?.id ?? null;
  }, [activeLesson]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch<TrainingResponse>('/training/courses');
      setData(res);
      const currentCourseId = selectedCourseIdRef.current;
      const currentLessonId = activeLessonIdRef.current;
      if (currentCourseId) {
        const updatedCourse = res.courses.find((c) => c.id === currentCourseId) || null;
        setSelectedCourse(updatedCourse);
        if (currentLessonId && updatedCourse) {
          setActiveLesson(updatedCourse.lessons.find((l) => l.id === currentLessonId) || null);
        } else if (!updatedCourse) {
          setActiveLesson(null);
        }
      }
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar treinamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses, me.activeUnit.id]);

  const handleSaveProgress = async (lesson: LessonItem, markCompleted: boolean) => {
    setError(null);
    const qCount = lesson.quiz_questions?.length || 0;
    if (markCompleted && qCount > 0) {
      const unanswered = Array.from({ length: qCount }, (_, i) => i).some(
        (i) => typeof quizAnswers[i] !== 'number'
      );
      if (unanswered) {
        setError('Responda todas as perguntas da verificação de aprendizagem antes de concluir a aula.');
        return;
      }
    }
    setSaving(true);
    try {
      const currentSec = Math.floor(videoRef.current?.currentTime || lesson.progress.resume_position_seconds || 0);
      const answersArray =
        qCount > 0 ? Array.from({ length: qCount }, (_, i) => quizAnswers[i] as number) : undefined;

      const res = await portalFetch<{
        courseCompleted: boolean;
        allMandatoryDone: boolean;
        lessonProgress: { quiz_score_pct: number | null };
      }>(`/training/lessons/${lesson.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          resumePositionSeconds: currentSec,
          status: markCompleted ? 'completed' : 'in_progress',
          quizAnswers: markCompleted ? answersArray : undefined,
        }),
      });
      setFeedback(
        markCompleted
          ? `Aula concluída${res.lessonProgress.quiz_score_pct !== null ? ` · Quiz: ${res.lessonProgress.quiz_score_pct}%` : ''}.`
          : `Progresso salvo em ${currentSec}s.`
      );
      await loadCourses();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao registrar progresso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="apple-glass rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-wise-mute font-semibold">
            Formação Operacional · 7 Setores
          </p>
          <h2 className="text-xl font-bold text-wise-ink mt-1 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            Universidade King Sports · {me.user.fullName}
          </h2>
          <p className="text-xs text-wise-body mt-1">
            Aulas com retomada exata por usuário/unidade, checklist operacional e avaliação de conhecimento.
          </p>
        </div>

        <Link
          href="/universidade"
          className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Tela imersiva Universidade
        </Link>
      </div>

      {data?.governanceSeparation && (
        <div className="apple-glass-subtle rounded-2xl p-4 border border-blue-400/30 bg-blue-500/8 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-bold text-wise-ink">
              Separação de Marcos: Capacitação do Usuário vs. Habilitação da Unidade
            </p>
            <p className="text-[11px] text-wise-body">{data.governanceSeparation.note}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusPill
              value={data.governanceSeparation.userTrainingCompleted ? 'approved' : 'in_review'}
              customLabel={
                data.governanceSeparation.userTrainingCompleted
                  ? 'Formação obrigatória concluída'
                  : 'Formação em andamento'
              }
            />
            <StatusPill
              value={data.governanceSeparation.unitBancaApproved ? 'approved' : 'pending'}
              customLabel={
                data.governanceSeparation.unitBancaApproved ? 'Banca aprovada' : 'Banca pendente'
              }
            />
            <StatusPill value={data.governanceSeparation.unitOperationalStatus} />
          </div>
        </div>
      )}

      {feedback && (
        <div className="apple-glass-subtle rounded-2xl p-3.5 border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fechar
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={loadCourses} />}

      {loading ? (
        <LoadingCard message="Carregando trilha dos 7 setores..." />
      ) : !data || data.courses.length === 0 ? (
        <EmptyStateCard
          title="Nenhum curso publicado"
          description="Os módulos da Universidade aparecerão aqui assim que publicados pela franqueadora."
        />
      ) : selectedCourse ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedCourse(null);
                setActiveLesson(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink"
            >
              ← Voltar aos 7 setores
            </button>
            <span className="text-xs text-wise-mute">
              {selectedCourse.completedLessonsCount}/{selectedCourse.totalLessonsCount} aula(s) concluída(s)
            </span>
          </div>

          <div className="apple-glass rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-wise-ink">
                Setor {selectedCourse.sector_order} · {selectedCourse.title}
              </h3>
              {selectedCourse.description && (
                <p className="text-xs text-wise-body mt-1">{selectedCourse.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                {selectedCourse.lessons.map((lesson) => {
                  const active = activeLesson?.id === lesson.id;
                  const done = lesson.progress.status === 'completed';
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => {
                        setActiveLesson(lesson);
                        setQuizAnswers({});
                      }}
                      className={`w-full text-left rounded-2xl p-3 border transition-all ${
                        active
                          ? 'apple-glass-cta text-white'
                          : 'apple-glass-well border-white/12 text-wise-body hover:text-wise-ink'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">
                          Aula {lesson.lesson_order}: {lesson.title}
                        </span>
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                        ) : (
                          <PlayCircle className="w-4 h-4 shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] opacity-80 block mt-1">
                        {Math.round((lesson.duration_seconds || 0) / 60)} min
                        {lesson.progress.quiz_score_pct !== null
                          ? ` · Nota ${lesson.progress.quiz_score_pct}%`
                          : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-2 apple-glass-well rounded-2xl p-4 space-y-4">
                {activeLesson ? (
                  <>
                    <div>
                      <h4 className="text-sm font-bold text-wise-ink">{activeLesson.title}</h4>
                      {activeLesson.summary && (
                        <p className="text-xs text-wise-body mt-1">{activeLesson.summary}</p>
                      )}
                    </div>

                    <video
                      ref={videoRef}
                      key={activeLesson.id}
                      src={activeLesson.video_url}
                      controls
                      onLoadedMetadata={() => {
                        if (
                          videoRef.current &&
                          activeLesson.progress.resume_position_seconds > 0
                        ) {
                          videoRef.current.currentTime = activeLesson.progress.resume_position_seconds;
                        }
                      }}
                      className="w-full rounded-2xl bg-black border border-white/15 max-h-[340px]"
                    />

                    {Array.isArray(activeLesson.checklist_items) &&
                      activeLesson.checklist_items.length > 0 && (
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1">
                          <p className="text-[11px] font-bold uppercase text-wise-mute">
                            Checklist do setor
                          </p>
                          <ul className="list-disc list-inside text-xs text-wise-body space-y-0.5">
                            {activeLesson.checklist_items.map((chk, idx) => (
                              <li key={idx}>{chk}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {Array.isArray(activeLesson.quiz_questions) &&
                      activeLesson.quiz_questions.length > 0 && (
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-3">
                          <p className="text-[11px] font-bold uppercase text-wise-mute">
                            Verificação rápida de aprendizagem
                          </p>
                          {activeLesson.quiz_questions.map((q, qIdx) => (
                            <div key={qIdx} className="space-y-1.5">
                              <p className="text-xs font-semibold text-wise-ink">
                                {qIdx + 1}. {q.question}
                              </p>
                              <div className="space-y-1">
                                {q.options.map((opt, oIdx) => (
                                  <label
                                    key={oIdx}
                                    className="flex items-center gap-2 text-xs text-wise-body cursor-pointer"
                                  >
                                    <input
                                      type="radio"
                                      name={`quiz_${activeLesson.id}_${qIdx}`}
                                      checked={quizAnswers[qIdx] === oIdx}
                                      onChange={() =>
                                        setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                                      }
                                      className="accent-blue-500"
                                    />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSaveProgress(activeLesson, false)}
                        className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink"
                      >
                        Salvar ponto de retomada
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSaveProgress(activeLesson, true)}
                        className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
                      >
                        {saving ? 'Salvando...' : 'Concluir aula e registrar nota'}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-wise-body">Selecione uma aula à esquerda para reproduzir o treinamento.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.courses.map((course) => {
            const pct =
              course.totalLessonsCount > 0
                ? Math.round((course.completedLessonsCount / course.totalLessonsCount) * 100)
                : 0;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => {
                  setSelectedCourse(course);
                  setActiveLesson(course.lessons[0] || null);
                }}
                className="apple-glass-subtle rounded-3xl p-5 border border-white/14 text-left flex flex-col justify-between gap-4 hover:border-blue-400/50 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
                      Setor {course.sector_order}
                    </span>
                    <StatusPill
                      value={pct === 100 ? 'approved' : course.is_mandatory ? 'pending' : 'draft'}
                      customLabel={pct === 100 ? 'Concluído' : course.is_mandatory ? 'Obrigatório' : 'Complementar'}
                    />
                  </div>
                  <h3 className="text-base font-bold text-wise-ink">{course.title}</h3>
                  {course.description && (
                    <p className="text-xs text-wise-body line-clamp-3">{course.description}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-wise-mute">
                    <span>
                      {course.completedLessonsCount}/{course.totalLessonsCount} aulas
                    </span>
                    <span className="font-bold text-wise-ink">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface BancaEvaluation {
  id: string;
  unit_code: string;
  unit_name: string;
  student_name: string;
  evaluator_name: string | null;
  case_title: string;
  exercise_checks: Record<string, boolean>;
  submission_notes: string | null;
  video_file_name: string | null;
  video_storage_path: string | null;
  sales_score: number | null;
  art_score: number | null;
  final_score: number | null;
  compliance_ok: boolean | null;
  status: string;
  evaluator_notes: string | null;
  evaluated_at: string | null;
  created_at: string;
}

interface SandboxOverview {
  isolationNotice: string;
  counts: {
    customers: number;
    opportunities: number;
    quotes: number;
    artProjects: number;
    orders: number;
  };
  bancaEvaluations: BancaEvaluation[];
}

const BANCA_EXERCISES = [
  { key: 'setor1_crm', label: '1. Cadastrar cliente fictício e avançar oportunidade no CRM (Sandbox)' },
  { key: 'setor2_orcamento', label: '2. Gerar orçamento com prazo indicativo e condição financeira' },
  { key: 'setor3_arte', label: '3. Criar mockup / versão de arte com vínculo ao projeto' },
  { key: 'setor4_grade', label: '4. Conferir grade de tamanhos, numeração e travas do Gatekeeper' },
  { key: 'setor5_financeiro', label: '5. Registrar recebimento manual sem alterar operação real' },
  { key: 'setor6_sac', label: '6. Abrir ocorrência simulada de pós-venda e acompanhar SLA' },
  { key: 'setor7_compliance', label: '7. Validar checklist jurídico de autorização de escudos e marca P03' },
];

export function SandboxTab({ me }: { me: PortalMeResponse }) {
  const [data, setData] = useState<SandboxOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Submission state
  const [caseTitle, setCaseTitle] = useState(`Banca Prática · ${me.activeUnit.name}`);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);

  // Evaluation modal (suporte / admin)
  const [evalTarget, setEvalTarget] = useState<BancaEvaluation | null>(null);
  const [salesScore, setSalesScore] = useState('8.5');
  const [artScore, setArtScore] = useState('9.0');
  const [complianceOk, setComplianceOk] = useState(true);
  const [decision, setDecision] = useState<'approved' | 'retry_required'>('approved');
  const [evaluatorNotes, setEvaluatorNotes] = useState('');
  const [evalError, setEvalError] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const canReviewBanca = me.activeRole.permissions.includes('sandbox:review');

  const loadSandbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch<SandboxOverview>('/sandbox/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar Sandbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSandbox();
  }, [loadSandbox, me.activeUnit.id]);

  useEffect(() => {
    setCaseTitle(`Banca Prática · ${me.activeUnit.name}`);
  }, [me.activeUnit.id, me.activeUnit.name]);

  const handleSeedCase = async () => {
    setBusy(true);
    setError(null);
    try {
      await portalFetch('/sandbox/seed-case', { method: 'POST', body: JSON.stringify({}) });
      setFeedback('Caso prático isolado (is_sandbox = TRUE) criado sem impactar o Meu Dia real.');
      await loadSandbox();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao criar caso sandbox.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSandbox = async () => {
    setBusy(true);
    setError(null);
    try {
      await portalFetch('/sandbox/reset', { method: 'POST', body: JSON.stringify({}) });
      setResetConfirmOpen(false);
      setFeedback('Registros isolados do Sandbox removidos com segurança (operação real preservada).');
      await loadSandbox();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao limpar sandbox.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitBanca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (caseTitle.trim().length < 3) {
      setError('Informe um título para o caso apresentado (mínimo 3 caracteres).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const encodedVideo = videoFile
        ? { fileName: videoFile.name, dataUrl: await fileToDataUrl(videoFile) }
        : null;
      await portalFetch('/sandbox/banca/submit', {
        method: 'POST',
        body: JSON.stringify({
          caseTitle: caseTitle.trim(),
          exerciseChecks: checks,
          submissionNotes: submissionNotes.trim() || null,
          videoFile: encodedVideo,
        }),
      });
      setSubmissionNotes('');
      setVideoFile(null);
      setFeedback('Apresentação e checklist enviados para avaliação da Banca!');
      await loadSandbox();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao enviar submissão.');
    } finally {
      setBusy(false);
    }
  };

  const handleWatchVideo = async (evalId: string) => {
    try {
      const res = await portalFetch<{ signedUrl: string }>(`/sandbox/banca/${evalId}/video-url`);
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao abrir vídeo da banca.');
    }
  };

  const handleEvaluateBanca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evalTarget) return;
    setEvalError(null);
    const parsedSales = Number(salesScore);
    const parsedArt = Number(artScore);
    if (!Number.isFinite(parsedSales) || parsedSales < 0 || parsedSales > 10) {
      setEvalError('Informe uma Nota Comercial válida entre 0 e 10.');
      return;
    }
    if (!Number.isFinite(parsedArt) || parsedArt < 0 || parsedArt > 10) {
      setEvalError('Informe uma Nota de Arte / Studio válida entre 0 e 10.');
      return;
    }
    if (evaluatorNotes.trim().length < 3) {
      setEvalError('Informe o parecer formal do avaliador (mínimo 3 caracteres).');
      return;
    }
    setBusy(true);
    try {
      await portalFetch(`/sandbox/banca/${evalTarget.id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          salesScore: parsedSales,
          artScore: parsedArt,
          complianceOk,
          decision,
          evaluatorNotes: evaluatorNotes.trim(),
        }),
      });
      setEvalTarget(null);
      setEvalError(null);
      setEvaluatorNotes('');
      setFeedback('Parecer da Banca registrado!');
      await loadSandbox();
    } catch (err) {
      setEvalError(err instanceof PortalApiError ? err.message : 'Erro ao avaliar submissão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl p-5 border-2 border-amber-400/50 bg-amber-500/12 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-[11px] font-extrabold uppercase tracking-wider text-amber-100">
            <FlaskConical className="w-3.5 h-3.5" />
            MODO SANDBOX ISOLADO (is_sandbox = TRUE)
          </div>
          <h2 className="text-xl font-bold text-white">Sandbox Prático &amp; Banca de Liberação</h2>
          <p className="text-xs text-amber-100/90 max-w-3xl">
            {data?.isolationNotice ||
              'Registros criados aqui são estritamente isolados e nunca entram em faturamento comercial, recebíveis reais ou fila PCP da fábrica.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleSeedCase}
            className="apple-glass-cta text-white text-xs font-semibold px-4 py-2 rounded-full inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Criar Caso Prático Fictício
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setResetConfirmOpen(true)}
            className="px-4 py-2 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-xs font-semibold text-rose-200 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar Somente Sandbox
          </button>
        </div>
      </div>

      {feedback && (
        <div className="apple-glass-subtle rounded-2xl p-3.5 border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fechar
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={loadSandbox} />}

      {loading ? (
        <LoadingCard message="Carregando ambiente Sandbox..." />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ['Clientes Sandbox', data.counts.customers],
              ['Oportunidades Sandbox', data.counts.opportunities],
              ['Orçamentos Sandbox', data.counts.quotes],
              ['Artes Sandbox', data.counts.artProjects],
              ['Pedidos Sandbox', data.counts.orders],
            ].map(([label, val]) => (
              <div key={String(label)} className="apple-glass-subtle rounded-2xl p-4 border border-white/12">
                <p className="text-[11px] uppercase font-bold text-wise-mute">{label}</p>
                <p className="text-2xl font-bold text-wise-ink mt-1">{val}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Formulário Submissão da Banca */}
            <form onSubmit={handleSubmitBanca} className="apple-glass rounded-3xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-wise-ink flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-400" />
                Checklist dos 7 Setores &amp; Envio para Banca
              </h3>

              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">Título do caso apresentado</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                />
              </div>

              <div className="space-y-2">
                {BANCA_EXERCISES.map((ex) => (
                  <label
                    key={ex.key}
                    className="flex items-start gap-2.5 rounded-xl bg-white/5 border border-white/10 p-2.5 text-xs text-wise-ink cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checks[ex.key])}
                      onChange={(e) =>
                        setChecks((prev) => ({ ...prev, [ex.key]: e.target.checked }))
                      }
                      className="mt-0.5 accent-blue-500"
                    />
                    <span>{ex.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  Observações / Pitch comercial
                </label>
                <textarea
                  rows={3}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  placeholder="Resuma como conduziu o atendimento, proposta e conferência de grade..."
                  className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  Vídeo da apresentação prática (MP4/WebM opcional)
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-wise-body"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full apple-glass-cta text-white text-xs font-semibold py-2.5 rounded-full"
              >
                {busy ? 'Enviando...' : 'Submeter Avaliação para Banca'}
              </button>
            </form>

            {/* Lista de Submissões / Avaliações */}
            <div className="apple-glass rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-wise-ink">
                  Submissões &amp; Pareceres da Banca ({data.bancaEvaluations.length})
                </h3>
                <button
                  type="button"
                  onClick={loadSandbox}
                  className="p-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/12 text-wise-body"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {data.bancaEvaluations.length === 0 ? (
                <p className="text-xs text-wise-body">Nenhuma apresentação enviada nesta unidade ainda.</p>
              ) : (
                <div className="space-y-3">
                  {data.bancaEvaluations.map((ev) => (
                    <div
                      key={ev.id}
                      className="apple-glass-well rounded-2xl p-4 space-y-2 border border-white/12"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-wise-ink">{ev.case_title}</span>
                        <StatusPill value={ev.status} />
                      </div>
                      <p className="text-[11px] text-wise-mute">
                        Candidato: {ev.student_name} · Enviado em {formatDateBr(ev.created_at, { withTime: true })}
                      </p>
                      {ev.submission_notes && (
                        <p className="text-xs text-wise-body">{ev.submission_notes}</p>
                      )}
                      {ev.final_score !== null && (
                        <p className="text-xs font-semibold text-emerald-200">
                          Nota Comercial: {ev.sales_score} · Nota Arte: {ev.art_score} · Média: {ev.final_score}
                        </p>
                      )}
                      {ev.evaluator_notes && (
                        <p className="text-[11px] text-wise-body bg-white/5 rounded-xl p-2">
                          Parecer ({ev.evaluator_name || 'Banca'}): {ev.evaluator_notes}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {ev.video_storage_path && (
                          <button
                            type="button"
                            onClick={() => handleWatchVideo(ev.id)}
                            className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
                          >
                            <Video className="w-3.5 h-3.5" />
                            Assistir vídeo gravado
                          </button>
                        )}
                        {canReviewBanca && (
                          <button
                            type="button"
                            onClick={() => {
                              setEvalTarget(ev);
                              setEvalError(null);
                              setEvaluatorNotes(ev.evaluator_notes || '');
                            }}
                            className="px-3 py-1.5 rounded-full apple-glass-cta text-xs font-semibold text-white"
                          >
                            Avaliar Banca
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      <GlassModal
        open={Boolean(evalTarget)}
        title={evalTarget ? `Avaliar Banca · ${evalTarget.case_title}` : ''}
        subtitle={evalTarget ? `${evalTarget.unit_name} · ${evalTarget.student_name}` : undefined}
        onClose={() => {
          setEvalTarget(null);
          setEvalError(null);
        }}
      >
        <form onSubmit={handleEvaluateBanca} className="space-y-4">
          {evalError ? <ErrorBanner message={evalError} /> : null}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Nota Comercial (0–10)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                required
                value={salesScore}
                onChange={(e) => setSalesScore(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Nota Arte / Studio (0–10)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                required
                value={artScore}
                onChange={(e) => setArtScore(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Decisão</label>
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value as 'approved' | 'retry_required')}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="approved" className="bg-[#181818]">Aprovar Banca</option>
                <option value="retry_required" className="bg-[#181818]">Solicitar Nova Apresentação</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-wise-ink cursor-pointer">
            <input
              type="checkbox"
              checked={complianceOk}
              onChange={(e) => setComplianceOk(e.target.checked)}
              className="accent-blue-500"
            />
            Conformidade documental e regras de marca P03 atendidas
          </label>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Parecer formal do avaliador</label>
            <textarea
              required
              minLength={3}
              rows={3}
              value={evaluatorNotes}
              onChange={(e) => setEvaluatorNotes(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEvalTarget(null);
                setEvalError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Salvando...' : 'Registrar Parecer'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Confirmação Limpeza Sandbox */}
      <GlassModal
        open={resetConfirmOpen}
        title="Limpar registros do modo Sandbox"
        subtitle="Apenas clientes, oportunidades, orçamentos, artes e pedidos marcados com is_sandbox = TRUE serão removidos."
        onClose={() => setResetConfirmOpen(false)}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-wise-body">
            Confirma a limpeza dos dados simulados desta unidade? Os registros reais da operação não serão alterados.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetConfirmOpen(false)}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleResetSandbox}
              className="px-5 py-2 rounded-full bg-rose-500/80 hover:bg-rose-500 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Limpando...' : 'Confirmar limpeza'}
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
