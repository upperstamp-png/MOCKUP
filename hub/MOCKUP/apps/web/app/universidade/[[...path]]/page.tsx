'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { hubAsset, useUnifiedHubPrefix } from '@/lib/api-client';
import styles from '../university.module.css';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = url && key ? createClient(url, key) : null;
const states = [['draft', 'Rascunho'], ['review', 'Em revisão'], ['published', 'Publicado'], ['archived', 'Arquivado']];
const kinds = [['text', 'Texto'], ['video', 'Vídeo'], ['pdf', 'PDF'], ['link', 'Link'], ['live', 'Encontro ao vivo']];
type Lesson = { id: string; title: string; body: string; kind: string; state: string; position: number; asset_path: string | null; external_url: string | null };
type Module = { id: string; title: string; position: number; university_lessons: Lesson[] };
type Track = { id: string; slug: string; title: string; short_title: string; description: string; objectives: string; audience: string; cover_url: string | null; focal_x: number; focal_y: number; position: number; required: boolean; state: string; university_modules: Module[] };
type Activity = { id: string; lesson_id: string; instructions: string; criteria: string; due_at: string | null; required: boolean };
type Submission = { id: string; activity_id: string; user_id: string; response: string; state: string; feedback: string | null; created_at: string };
const reviewStates = [['submitted','Enviada'],['reviewing','Em análise'],['changes','Ajustes solicitados'],['approved','Aprovada'],['failed','Reprovada']];
type Progress = { lesson_id: string; last_access: string; completed_at: string | null; position_seconds: number; notes: string };
const trackUrl = (track: Track) => '/universidade/' + track.slug;
const lessonUrl = (track: Track, lesson: Lesson) => trackUrl(track) + '/' + lesson.id;
const modules = (track: Track) => [...track.university_modules].sort((a, b) => a.position - b.position);
const lessons = (track: Track) => modules(track).flatMap(module => [...module.university_lessons].sort((a, b) => a.position - b.position));

export default function University({ params }: { params: { path?: string[] } }) {
  const hubPrefix = useUnifiedHubPrefix();
  const homeHref = hubPrefix ? `${hubPrefix}` : '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<Session | null>();
  const [role, setRole] = useState('');
  const [banca, setBanca] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [revision, reload] = useState(0);
  const [slug, lessonId, extra] = params.path ?? [];
  const admin = role === 'admin';
  const management = slug === 'gestao';
  const track = tracks.find(item => item.slug === slug && item.state === 'published');
  const trackLessons = track ? lessons(track).filter(item => item.state === 'published') : [];
  const lesson = trackLessons.find(item => item.id === lessonId);
  const ownProgress = progress.find(item => item.lesson_id === lesson?.id);

  useEffect(() => {
    if (!db) return;
    const { data: { subscription } } = db.auth.onAuthStateChange((_, current) => setSession(current));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !session) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      db.rpc('university_role'),
      db.rpc('university_banca_status'),
      db.from('university_tracks').select('*, university_modules(*, university_lessons(*))').order('position'),
      db.from('university_progress').select('lesson_id,last_access,completed_at,position_seconds,notes').order('last_access', { ascending: false }),
    ]).then(([membership, evaluation, catalog, learning]) => {
      if (!active) return;
      const failure = membership.error ?? catalog.error ?? learning.error;
      if (failure) setError('Não foi possível carregar a Universidade. Confira a configuração e tente novamente.');
      else {
        setRole(membership.data ?? '');
        setBanca(evaluation.data?.[0]?.status ?? null);
        setTracks((catalog.data ?? []) as Track[]);
        setProgress((learning.data ?? []) as Progress[]);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [session, revision]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    setError('');
    const data = new FormData(event.currentTarget);
    const result = await db.auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) });
    if (result.error) setError('Não foi possível entrar. Verifique suas credenciais.');
  }

  const published = tracks.filter(item => item.state === 'published');
  const done = new Set(progress.filter(item => item.completed_at).map(item => item.lesson_id));
  const available = (item: Track) => lessons(item).filter(entry => entry.state === 'published');
  const completed = (item: Track) => available(item).filter(entry => done.has(entry.id)).length;
  const isDone = (item: Track) => available(item).length > 0 && completed(item) === available(item).length;
  const required = published.filter(item => item.required).flatMap(available);
  const lastTrack = published.find(item => available(item).some(entry => entry.id === progress[0]?.lesson_id));
  const lastLesson = lastTrack && available(lastTrack).find(item => item.id === progress[0]?.lesson_id);
  const visible = published.filter(item => {
    const text = [item.title, item.short_title, item.description, ...modules(item).map(m => m.title), ...available(item).map(l => l.title)].join(' ').toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (
      filter === 'all' || (filter === 'required' && item.required) || (filter === 'optional' && !item.required) ||
      (filter === 'done' && isDone(item)) || (filter === 'new' && !available(item).some(l => progress.some(p => p.lesson_id === l.id))) ||
      (filter === 'started' && !isDone(item) && available(item).some(l => progress.some(p => p.lesson_id === l.id)))
    );
  });
  const next = trackLessons.find(item => !done.has(item.id)) ?? trackLessons[0];

  return <div className={styles.shell}>
    <aside><Link href={homeHref}><img src={hubAsset('/king-sports/logo.png')} alt="King Sports" width={150} height={38} /></Link>
      <button type="button" className={styles.mobileMenu} aria-expanded={menuOpen} aria-controls="university-menu" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? 'Fechar menu' : 'Abrir menu'}</button>
      <div id="university-menu" className={styles.sidebarContent} data-open={menuOpen}>
      <nav onClick={event => { if ((event.target as HTMLElement).closest('a')) setMenuOpen(false); }}><Link href={homeHref}>Meu dia</Link><Link href="/universidade">Universidade</Link><Link href={`${homeHref}?area=sandbox`}>Sandbox e banca</Link>{admin && <Link href="/universidade/gestao">Gestão de conteúdo</Link>}</nav>
      {session && <button onClick={async () => { await db?.auth.signOut(); setRole(''); setTracks([]); setProgress([]); }}>Sair da Universidade</button>}
      </div>
    </aside>
    <main>
      <header><h1>Universidade King Sports</h1><p>Aprenda a vender, criar e operar sua franquia.</p></header>
      {!db ? <p role="status">Configuração pendente. Conecte o Supabase para acessar cursos e progresso.</p> : session === undefined ? <p role="status">Carregando sessão…</p> : !session ? <>
        <form className={styles.form} onSubmit={signIn}>
          <label>E-mail<input type="email" name="email" autoComplete="username" required /></label>
          <label>Senha<input type="password" name="password" autoComplete="current-password" required /></label>
          <button>Entrar</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </> : loading ? <div className={styles.grid} aria-label="Carregando trilhas">{[0, 1, 2, 3].map(i => <div className={styles.cover} key={i} />)}</div>
      : error ? <p role="alert">{error} <button onClick={() => reload(i => i + 1)}>Tentar novamente</button></p>
      : !role ? <p>Seu usuário ainda não tem matrícula na Universidade.</p>
      : management ? admin ? <Management tracks={tracks} user={session.user.id} onChange={() => reload(i => i + 1)} /> : <p>Área restrita à administração.</p>
      : slug ? !track || extra || (lessonId && !lesson) ? <p>Aula ou trilha indisponível. <Link href="/universidade">Voltar ao catálogo</Link></p>
      : lesson ? <LessonView key={lesson.id} track={track} lesson={lesson} progress={ownProgress} trackLessons={trackLessons} onSave={saved => setProgress(items => [saved, ...items.filter(item => item.lesson_id !== saved.lesson_id)])} />
      : <section>
        <Link href="/universidade">← Catálogo</Link>
        <h2>{track.title}</h2><p>{track.description}</p>
        {track.objectives && <p>Objetivos · {track.objectives}</p>}{track.audience && <p>Público · {track.audience}</p>}
        <p>{completed(track)} de {trackLessons.length} aulas concluídas. Conclua todas as aulas publicadas para finalizar esta trilha.</p>
        {next ? <Link className={styles.button} href={lessonUrl(track, next)}>{completed(track) ? 'Continuar' : 'Começar'}</Link> : <p>Em breve. Nenhuma aula publicada.</p>}
        <LessonList track={track} done={done} />
      </section>
      : <>
        <div className={styles.summary}>
          <p><strong>{published.flatMap(available).filter(item => done.has(item.id)).length}</strong>Aulas concluídas</p>
          <p><strong>{published.filter(isDone).length}</strong>Trilhas concluídas</p>
          <p><strong>{required.length ? Math.round(required.filter(item => done.has(item.id)).length / required.length * 100) + '%' : '—'}</strong>Formação obrigatória</p>
        </div>
        <section className={styles.continue}><h2>{lastLesson ? 'Continue de onde parou' : 'Comece sua formação'}</h2>
          {lastTrack && lastLesson ? <><p>{lastTrack.title} · {lastLesson.title}</p><Link className={styles.button} href={lessonUrl(lastTrack, lastLesson)}>Continuar aula</Link></>
          : published.find(item => item.required && available(item).length) ? <Link className={styles.button} href={trackUrl(published.find(item => item.required && available(item).length)!)}>Ver primeira trilha</Link>
          : <p>As trilhas ficam disponíveis após publicação pela matriz.</p>}
        </section>
        <h2>Trilhas de formação</h2>
        <div className={styles.filters}><label>Buscar trilha, módulo ou aula<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <label>Filtrar<select value={filter} onChange={event => setFilter(event.target.value)}>{[['all','Todas'],['new','Não iniciadas'],['started','Em andamento'],['done','Concluídas'],['required','Obrigatórias'],['optional','Opcionais']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        <div className={styles.grid}>{visible.map(item => {
          const count = available(item).length;
          const percent = count ? Math.round(completed(item) / count * 100) : 0;
          return <Link className={styles.card} href={trackUrl(item)} key={item.id}>
            <div className={styles.cover}>
              {item.cover_url && <img src={hubAsset(item.cover_url)} alt="" width={1080} height={1920} loading="lazy" style={{ objectPosition: item.focal_x + '% ' + item.focal_y + '%' }} />}
              <span className={styles.sector}>Setor {String(item.position).padStart(2, '0')} · {item.required ? 'Obrigatória' : 'Opcional'}</span>
              <div className={styles.caption}><h3>{item.short_title}</h3><p>{item.description}</p><strong>{!count ? 'Em breve' : percent === 100 ? 'Revisar conteúdo' : available(item).some(l => progress.some(p => p.lesson_id === l.id)) ? 'Continuar' : 'Começar trilha'}</strong></div>
            </div>
            <span>{completed(item)} de {count} aulas concluídas · {percent}%</span><progress aria-label={'Progresso de ' + item.title} value={percent} max={100} />
          </Link>;
        })}</div>
        {!visible.length && <p>{published.length ? 'Nenhuma trilha corresponde aos filtros.' : 'Nenhuma trilha publicada.'} {published.length > 0 && <button onClick={() => { setQuery(''); setFilter('all'); }}>Limpar filtros</button>}</p>}
        <section className={styles.continue}>
          <h2>Atividades e banca</h2>
          <p>As atividades cadastradas aparecem nas respectivas aulas.</p>
          <p>{banca ? 'Banca: ' + ({ draft: 'rascunho', submitted: 'em avaliação', approved: 'aprovada', retry_required: 'novo envio necessário' }[banca] ?? banca) : 'Nenhuma avaliação da banca registrada no portal autenticado.'}</p>
          <Link href={`${homeHref}?area=sandbox`}>Abrir Sandbox e banca</Link>
        </section>
      </>}
    </main>
  </div>;
}

function LessonList({ track, done }: { track: Track; done: Set<string> }) {
  return <div>{modules(track).map(module => <section key={module.id}>
    <h3>{module.title}</h3><ol>{module.university_lessons.filter(item => item.state === 'published').sort((a,b) => a.position - b.position).map(item => <li key={item.id}><Link href={lessonUrl(track, item)}>{item.title}{done.has(item.id) ? ' · Concluída' : ''}</Link></li>)}</ol>
  </section>)}</div>;
}

function LessonView({ track, lesson, trackLessons, progress, onSave }: { track: Track; lesson: Lesson; trackLessons: Lesson[]; progress?: Progress; onSave: (value: Progress) => void }) {
  const [asset, setAsset] = useState('');
  const [assetError, setAssetError] = useState(false);
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState(progress?.notes ?? '');
  const lastSent = useRef(0);
  const resume = useRef(progress?.position_seconds ?? 0);
  const index = trackLessons.indexOf(lesson);

  async function save(data: { p_position?: number; p_notes?: string; p_complete?: boolean }, notify = false) {
    const response = await db!.rpc('university_save_progress', { p_lesson: lesson.id, ...data });
    if (response.error) { setMessage(response.error.code === '42501' ? response.error.message : 'Falha ao salvar. Tente novamente.'); return; }
    onSave(response.data as Progress);
    if (notify) setMessage('Progresso salvo.');
  }

  async function loadAsset() {
    if (!lesson.asset_path) return;
    setAssetError(false);
    const result = await db!.storage.from('university-private').createSignedUrl(lesson.asset_path, 3600, lesson.kind === 'pdf' ? { download: true } : undefined);
    if (result.error) setAssetError(true);
    else setAsset(result.data.signedUrl);
  }

  useEffect(() => { void loadAsset(); void save({}); }, [lesson.id]);
  return <section>
    <nav><Link href="/universidade">Catálogo</Link> / <Link href={trackUrl(track)}>{track.title}</Link></nav>
    <h2>{lesson.title}</h2>
    <div className={styles.lessonGrid}><div>
      {lesson.kind === 'video' && asset && !assetError && <video key={asset} controls playsInline preload="metadata" src={asset}
        onLoadedMetadata={event => { if (resume.current < event.currentTarget.duration) event.currentTarget.currentTime = resume.current; }}
        onTimeUpdate={event => { if (Date.now() - lastSent.current < 15000) return; lastSent.current = Date.now(); void save({ p_position: Math.floor(event.currentTarget.currentTime) }); }}
        onPause={event => { resume.current = Math.floor(event.currentTarget.currentTime); void save({ p_position: resume.current }); }}
        onError={() => setAssetError(true)} />}
      {lesson.kind === 'pdf' && asset && <a href={asset}>Baixar PDF da aula</a>}
      {assetError && <p role="alert">Não foi possível abrir o arquivo. <button onClick={() => void loadAsset()}>Tentar novamente</button></p>}
      {(lesson.kind === 'link' || lesson.kind === 'live') && lesson.external_url?.startsWith('https://') && <a href={lesson.external_url} target="_blank" rel="noreferrer">Abrir conteúdo autorizado ↗</a>}
      <p className={styles.text}>{lesson.body}</p>
      <LessonActivity lessonId={lesson.id} />
      {progress?.completed_at ? <p role="status">Aula concluída</p> : <button onClick={() => void save({ p_complete: true }, true)}>{lesson.kind === 'video' ? 'Confirmar que assisti' : 'Marcar como concluída'}</button>}
      {lesson.kind === 'video' && <p>A conclusão é autodeclarada. A posição salva serve para retomar o vídeo.</p>}
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void save({ p_notes: notes }, true); }}>
        <label>Anotações pessoais<textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={10000} /></label><button>Salvar anotações</button>
      </form>
      {message && <p role="status">{message}</p>}
      <nav>{index > 0 && <Link href={lessonUrl(track, trackLessons[index - 1])}>← Aula anterior</Link>}{index + 1 < trackLessons.length && <Link href={lessonUrl(track, trackLessons[index + 1])}>Próxima aula →</Link>}</nav>
    </div><details open><summary>Módulos e aulas</summary><LessonList track={track} done={new Set(progress?.completed_at ? [lesson.id] : [])} /></details></div>
  </section>;
}

function Management({ tracks, user, onChange }: { tracks: Track[]; user: string; onChange: () => void }) {
  const [selected, setSelected] = useState('');
  const [moduleId, setModule] = useState('');
  const [lessonId, setLesson] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const track = tracks.find(item => item.id === selected);
  const module = track?.university_modules.find(item => item.id === moduleId);
  const lesson = module?.university_lessons.find(item => item.id === lessonId);

  async function submit(event: FormEvent<HTMLFormElement>, target: 'track' | 'module' | 'lesson') {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    setBusy(true);
    setMessage('');
    try {
      if (target === 'track') {
        const row = { slug: value('slug'), title: value('title'), short_title: value('short_title'), description: value('description'),
          objectives: value('objectives'), audience: value('audience'), position: Number(value('position')), state: value('state'),
          required: data.has('required'), cover_url: value('cover_url') || null, focal_x: Number(value('focal_x')), focal_y: Number(value('focal_y')), updated_by: user };
        if (row.cover_url && !row.cover_url.startsWith('https://')) throw new Error('Use uma URL HTTPS para a capa.');
        const response = track ? await db!.from('university_tracks').update(row).eq('id', track.id) : await db!.from('university_tracks').insert(row).select('id').single();
        if (response.error) throw response.error;
        if (!track && response.data) setSelected((response.data as { id: string }).id);
      } else if (target === 'module' && track) {
        const row = { title: value('title'), position: Number(value('position')), track_id: track.id };
        const response = module ? await db!.from('university_modules').update(row).eq('id', module.id) : await db!.from('university_modules').insert(row);
        if (response.error) throw response.error;
      } else if (target === 'lesson' && module) {
        const kind = value('kind');
        const file = data.get('asset');
        let asset = lesson?.asset_path ?? null;
        if (file instanceof File && file.size) {
          if (file.size > 50 * 1024 * 1024 || !(kind === 'pdf' ? file.type === 'application/pdf' : kind === 'video' && ['video/mp4','video/webm'].includes(file.type))) throw new Error('Use PDF, MP4 ou WebM compatível com a aula, até 50 MB.');
          asset = crypto.randomUUID();
          const upload = await db!.storage.from('university-private').upload(asset, file);
          if (upload.error) throw upload.error;
        }
        const row = { module_id: module.id, title: value('title'), body: value('body'), kind, state: value('state'), position: Number(value('position')),
          asset_path: kind === 'video' || kind === 'pdf' ? asset : null, external_url: value('external_url') || null, updated_by: user };
        const response = lesson ? await db!.from('university_lessons').update(row).eq('id', lesson.id) : await db!.from('university_lessons').insert(row);
        if (response.error) throw response.error;
      }
      setMessage('Alterações salvas.');
      onChange();
    } catch (cause) {
      setMessage(cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  return <section>
    <h2>Gestão de conteúdo</h2>
    <p>As sete trilhas iniciais são rascunhos. Cadastre aulas reais antes de publicar.</p>
    <label>Trilha<select value={selected} onChange={event => { setSelected(event.target.value); setModule(''); setLesson(''); }}>
      <option value="">Nova trilha</option>{tracks.map(item => <option key={item.id} value={item.id}>{item.title} · {states.find(([value]) => value === item.state)?.[1]}</option>)}
    </select></label>
    <form key={selected} className={styles.form} onSubmit={event => void submit(event, 'track')}>
      <label>Endereço da trilha<input name="slug" defaultValue={track?.slug} pattern="[a-z0-9-]+" required /></label>
      <label>Título completo<input name="title" defaultValue={track?.title} required /></label>
      <label>Título da capa<input name="short_title" defaultValue={track?.short_title} required /></label>
      <label>Descrição<textarea name="description" defaultValue={track?.description} required /></label>
      <label>Objetivos<textarea name="objectives" defaultValue={track?.objectives} /></label>
      <label>Público<input name="audience" defaultValue={track?.audience} /></label>
      <label>URL HTTPS da capa<input type="url" name="cover_url" defaultValue={track?.cover_url ?? ''} /></label>
      <label>Ponto focal X (%)<input type="number" min={0} max={100} name="focal_x" defaultValue={track?.focal_x ?? 50} required /></label>
      <label>Ponto focal Y (%)<input type="number" min={0} max={100} name="focal_y" defaultValue={track?.focal_y ?? 50} required /></label>
      <label>Ordem<input type="number" name="position" defaultValue={track?.position ?? 1} required /></label>
      <label>Estado<select name="state" defaultValue={track?.state ?? 'draft'}>{states.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><input type="checkbox" name="required" defaultChecked={track?.required ?? true} /> Obrigatória</label>
      <button disabled={busy}>Salvar trilha</button>
      {track?.state === 'published' && <Link href={trackUrl(track)}>Ver trilha publicada</Link>}
    </form>
    {track && <>
      <label>Módulo<select value={moduleId} onChange={event => { setModule(event.target.value); setLesson(''); }}><option value="">Novo módulo</option>{modules(track).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <form key={moduleId} className={styles.form} onSubmit={event => void submit(event, 'module')}>
        <label>Título do módulo<input name="title" required defaultValue={module?.title} /></label>
        <label>Ordem<input type="number" name="position" defaultValue={module?.position ?? 1} required /></label>
        <button disabled={busy}>Salvar módulo</button>
      </form>
    </>}
    {module && <>
      <label>Aula<select value={lessonId} onChange={event => setLesson(event.target.value)}><option value="">Nova aula</option>{module.university_lessons.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <form key={lessonId} className={styles.form} onSubmit={event => void submit(event, 'lesson')}>
        <label>Título da aula<input name="title" defaultValue={lesson?.title} required /></label>
        <label>Tipo<select name="kind" defaultValue={lesson?.kind ?? 'text'}>{kinds.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Descrição ou conteúdo<textarea name="body" defaultValue={lesson?.body} /></label>
        <label>Link externo autorizado<input type="url" name="external_url" defaultValue={lesson?.external_url ?? ''} /></label>
        <label>Vídeo ou PDF privado<input type="file" name="asset" accept="video/mp4,video/webm,application/pdf" /></label>
        <label>Ordem<input type="number" name="position" defaultValue={lesson?.position ?? 1} required /></label>
        <label>Estado<select name="state" defaultValue={lesson?.state ?? 'draft'}>{states.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button disabled={busy}>Salvar aula</button>
      </form>
    </>}
    {lesson && <ActivityEditor key={lesson.id} lessonId={lesson.id} user={user} />}
    {message && <p role="status">{message}</p>}
  </section>;
}


function LessonActivity({ lessonId }: { lessonId: string }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [attempts, setAttempts] = useState<Submission[]>([]);
  const [response, setResponse] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh(id: string) {
    const result = await db!.from('university_submissions').select('*').eq('activity_id', id).order('created_at', { ascending: false });
    if (result.error) setNotice('Não foi possível carregar as tentativas.');
    else setAttempts(result.data as Submission[]);
  }

  useEffect(() => {
    let active = true;
    db!.from('university_activities').select('*').eq('lesson_id', lessonId).maybeSingle().then(result => {
      if (!active) return;
      if (result.error) { setNotice('Não foi possível consultar as atividades.'); return; }
      const item = result.data as Activity | null;
      setActivity(item);
      if (item) void refresh(item.id);
    });
    return () => { active = false; };
  }, [lessonId]);

  if (!activity) return notice ? <p role="alert">{notice}</p> : null;
  const pending = attempts.some(item => ['submitted','reviewing'].includes(item.state));
  const passed = attempts.some(item => item.state === 'approved');
  return <section>
    <h3>Atividade {activity.required ? 'obrigatória' : 'opcional'}</h3>
    <p className={styles.text}>{activity.instructions}</p>
    {activity.criteria && <p>Critérios · {activity.criteria}</p>}
    {activity.due_at && <p>Prazo · {new Date(activity.due_at).toLocaleString('pt-BR')}</p>}
    {attempts.map(item => <article key={item.id}>
      <p>{new Date(item.created_at).toLocaleString('pt-BR')} · {reviewStates.find(([id]) => id === item.state)?.[1]}</p>
      <p className={styles.text}>{item.response}</p>{item.feedback && <p>Feedback · {item.feedback}</p>}
    </article>)}
    {!pending && !passed && <form className={styles.form} onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      const result = await db!.from('university_submissions').insert({ activity_id: activity.id, response: response.trim() });
      setBusy(false);
      if (result.error) setNotice('Não foi possível enviar. Confira o prazo e tente novamente.');
      else { setResponse(''); setNotice('Atividade enviada.'); await refresh(activity.id); }
    }}>
      <label>Resposta<textarea value={response} maxLength={10000} onChange={event => setResponse(event.target.value)} required /></label>
      <button disabled={busy || !response.trim()}>{busy ? 'Enviando…' : 'Enviar atividade'}</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}

function ActivityEditor({ lessonId, user }: { lessonId: string; user: string }) {
  const [activity, setActivity] = useState<Activity | null>();
  const [attempts, setAttempts] = useState<Submission[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const result = await db!.from('university_activities').select('*').eq('lesson_id', lessonId).maybeSingle();
    if (result.error) { setNotice('Falha ao carregar atividade.'); return; }
    setActivity(result.data as Activity | null);
    if (result.data) {
      const submissions = await db!.from('university_submissions').select('*').eq('activity_id', result.data.id).order('created_at', { ascending: false });
      if (submissions.error) setNotice('Falha ao carregar entregas.');
      else setAttempts(submissions.data as Submission[]);
    }
  }

  useEffect(() => { void refresh(); }, [lessonId]);

  return <section>
    <h3>Atividade com revisão da matriz</h3>
    {activity !== undefined && <form key={activity?.id ?? 'new'} className={styles.form} onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      const data = new FormData(event.currentTarget);
      const due = String(data.get('due') ?? '');
      const result = await db!.from('university_activities').upsert({
        lesson_id: lessonId, instructions: String(data.get('instructions')).trim(), criteria: String(data.get('criteria')).trim(),
        due_at: due ? new Date(due).toISOString() : null, required: data.has('required'),
      }, { onConflict: 'lesson_id' });
      setBusy(false);
      setNotice(result.error ? 'Não foi possível salvar a atividade.' : 'Atividade salva.');
      if (!result.error) await refresh();
    }}>
      <label>Instruções<textarea name="instructions" defaultValue={activity?.instructions} required /></label>
      <label>Critérios<textarea name="criteria" defaultValue={activity?.criteria} /></label>
      <label>Prazo (opcional)<input name="due" type="datetime-local" defaultValue={activity?.due_at ? new Date(new Date(activity.due_at).getTime() - new Date(activity.due_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''} /></label>
      <label><input type="checkbox" name="required" defaultChecked={activity?.required ?? true} /> Obrigatória</label>
      <button disabled={busy}>Salvar atividade</button>
    </form>}
    {attempts.map(item => <article key={item.id}>
      <p>Aluno {item.user_id} · {new Date(item.created_at).toLocaleString('pt-BR')}</p>
      <p className={styles.text}>{item.response}</p>
      <form className={styles.form} onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        const data = new FormData(event.currentTarget);
        const result = await db!.from('university_submissions').update({ state: data.get('state'), feedback: data.get('feedback'), reviewed_by: user }).eq('id', item.id);
        setBusy(false);
        setNotice(result.error ? 'Não foi possível salvar a revisão.' : 'Revisão salva.');
        if (!result.error) await refresh();
      }}>
        <label>Status<select name="state" defaultValue={item.state}>{reviewStates.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Feedback<textarea name="feedback" defaultValue={item.feedback ?? ''} /></label>
        <button disabled={busy}>Salvar revisão</button>
      </form>
    </article>)}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
