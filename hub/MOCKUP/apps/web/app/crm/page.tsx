'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { formatBrl, formatDateBr, PortalApiError, portalFetch, useUnifiedHubPrefix } from '@/lib/api-client';
import styles from './crm.module.css';

const stages = [['novo','Novo lead'],['contato_iniciado','Em atendimento'],['qualificacao','Qualificado / briefing'],['orcamento','Proposta enviada'],['negociacao','Negociação'],['ganho','Ganho'],['perdido','Perdido']] as const;
const tabs = ['Oportunidades','Contatos e clientes','Atividades','Propostas','Relatórios'] as const;
type Tab = typeof tabs[number];
type Session = { user: { fullName: string }; activeUnit: { name: string }; activeRole: { permissions: string[] } };
type Customer = { id: string; name: string; city?: string; state?: string; contacts?: { name: string; phone?: string; email?: string }[] };
type Opportunity = { id: string; title: string; stage: string; customer_id: string; customer_name: string; estimated_value_cents: number | null; owner_name?: string; next_action?: string; next_action_at?: string; updated_at: string; edit_version: string; last_interaction_at?: string; notes?: string; status: string };
type Quote = { id: string; quote_number: string; status: string; total_cents: number; valid_until?: string; customer_name?: string };
type Task = { id: string; title: string; due_at: string; status: string; assigned_name?: string };
type Detail = { opportunity: Opportunity; activities: { id: string; title: string; description?: string; created_at: string; created_by_name?: string }[]; quotes: Quote[] };
type Page<T> = { items: T[]; pagination?: { total: number }; summary?: { stage: string; count: number; value: string }[] };
const json = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) });
const stageLabel = (id: string) => stages.find(([value]) => value === id)?.[1] ?? id;
const field = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  approved: 'Aprovada',
  converted: 'Convertida em pedido',
  rejected: 'Rejeitada',
  canceled: 'Cancelada',
};
const timestamp = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Informe uma data/hora válida.');
  }
  return parsed.toISOString();
};
const isLate = (value?: string) => !!value && new Date(value).getTime() < Date.now();
const errorMessage = (error: unknown) => error instanceof PortalApiError && error.statusCode === 401
  ? 'Sua sessão expirou. Entre novamente.' : error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
function cents(value: string) {
  if (!value) return null;
  if (!/^\d{1,8}([,.]\d{1,2})?$/.test(value)) throw new Error('Informe o valor com até duas casas decimais.');
  return Math.round(Number(value.replace(',', '.')) * 100);
}

export default function Crm() {
  const hubPrefix = useUnifiedHubPrefix();
  const homeHref = hubPrefix ? `${hubPrefix}` : '/';
  const [session, setSession] = useState<Session | null>();
  const [tab, setTab] = useState<Tab>('Oportunidades');
  const [mode, setMode] = useState<'kanban' | 'list'>('kanban');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState<Record<string, number>>({});
  const [data, setData] = useState<Page<Opportunity>>({ items: [] });
  const [customers, setCustomers] = useState<Page<Customer>>({ items: [] });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [opened, setOpened] = useState('');
  const [detail, setDetail] = useState<Detail>();
  const [editor, setEditor] = useState<'customer' | 'opportunity' | ''>('');
  const [duplicateNames, setDuplicateNames] = useState<string[]>([]);
  const [customerChoices, setCustomerChoices] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const allowed = (permission: string) => session?.activeRole.permissions.includes(permission) ?? false;
  const write = allowed('crm:write');
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    portalFetch<Session>('/auth/me').then(setSession).catch(reason => {
      setSession(null);
      if (!(reason instanceof PortalApiError) || reason.statusCode !== 401) setError(errorMessage(reason));
    });
  }, []);

  useEffect(() => {
    if (!session || !allowed('crm:read')) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setLoading(true);
    setError('');
    const search = new URLSearchParams({ search: query, page: String(page), limit: '25', ...(stage && { stage }) });
    const activeStages = stages.filter(([key]) => !stage || key === stage);
    let load: Promise<unknown>;
    if (tab === 'Contatos e clientes') load = portalFetch<Page<Customer>>('/crm/customers?' + search, options).then(result => { if (!controller.signal.aborted) setCustomers(result); });
    else if (tab === 'Atividades') load = portalFetch<Page<Task>>('/crm/tasks', options).then(result => { if (!controller.signal.aborted) setTasks(result.items); });
    else if (tab === 'Propostas') load = portalFetch<Page<Quote>>('/quotes', options).then(result => { if (!controller.signal.aborted) setQuotes(result.items); });
    else if (mode === 'kanban' && tab === 'Oportunidades') {
      load = Promise.all(activeStages.map(([key]) => portalFetch<Page<Opportunity>>('/crm/opportunities?' + new URLSearchParams({ search: query, stage: key, page: '1', limit: String(columns[key] ?? 10) }), options)))
        .then(results => { if (!controller.signal.aborted) setData({ items: results.flatMap(result => result.items), summary: results.flatMap(result => result.summary ?? []) }); });
    } else load = portalFetch<Page<Opportunity>>('/crm/opportunities?' + search, options).then(result => { if (!controller.signal.aborted) setData(result); });
    load.catch(reason => {
      if (!controller.signal.aborted) {
        setError(errorMessage(reason));
        if (reason instanceof PortalApiError && reason.statusCode === 401) setSession(null);
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session, tab, mode, query, stage, page, columns, revision]);

  useEffect(() => {
    if (editor !== 'opportunity') return;
    const controller = new AbortController();
    portalFetch<Page<Customer>>('/crm/customers?' + new URLSearchParams({ search: customerQuery, limit: '50' }), { signal: controller.signal })
      .then(result => setCustomerChoices(result.items)).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [editor, customerQuery, revision]);

  useEffect(() => {
    setDetail(undefined);
    if (!opened) return;
    const controller = new AbortController();
    portalFetch<Detail>('/crm/opportunities/' + opened, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setDetail(result); }).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [opened, revision]);

  async function action(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action(async () => {
      await portalFetch('/auth/login', json({ email: field(form,'email'), password: String(form.get('password') ?? '') }));
      setSession(await portalFetch<Session>('/auth/me'));
    });
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action(async () => {
      if (editor === 'customer') {
        const name = field(form,'name');
        const phone = field(form,'phone');
        const contact = field(form,'contact');
        const email = field(form,'email');
        if ((phone || email) && !contact) throw new Error('Informe o nome do contato principal.');
        if (!form.has('confirmDuplicate')) {
          const match = await portalFetch<{ possibleDuplicates: Customer[] }>('/crm/customers/duplicates-check?' + new URLSearchParams({ name, phone }));
          if (match.possibleDuplicates.length) {
            setDuplicateNames(match.possibleDuplicates.map(item => item.name));
            return;
          }
        }
        await portalFetch('/crm/customers', json({ name, customerType: field(form,'type'), city: field(form,'city') || null, state: field(form,'state') || null,
          origin: field(form,'origin') || null, primaryContact: contact ? { name: contact, phone: phone || null, email: email || null } : undefined }));
        setNotice('Cliente salvo.');
      } else {
        const result = await portalFetch<{ opportunity: Opportunity }>('/crm/opportunities', json({
          title: field(form,'title'), customerId: field(form,'customer'), origin: field(form,'origin') || null, segment: field(form,'segment') || null,
          estimatedValueCents: cents(field(form,'value')), nextAction: field(form,'nextAction') || null, nextActionAt: timestamp(field(form,'due')),
          productsOfInterest: field(form,'products').split(',').map(value => value.trim()).filter(Boolean), notes: field(form,'notes') || null,
        }));
        setOpened(result.opportunity.id);
        setNotice('Oportunidade salva.');
      }
      setDuplicateNames([]); setEditor(''); refresh();
    });
  }

  function move(event: FormEvent<HTMLFormElement>, item: Opportunity) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = field(form,'stage');
    if (target === item.stage) return;
    void action(async () => {
      await portalFetch('/crm/opportunities/' + item.id + '/stage', json({
        stage: target, expectedUpdatedAt: item.edit_version, lossReason: field(form,'reason') || null, reopenReason: field(form,'reason') || null,
      }, 'PATCH'));
      setNotice('Etapa atualizada.'); refresh();
    });
  }

  function record(event: FormEvent<HTMLFormElement>, kind: 'activity' | 'task' | 'quote' | 'art', item: Opportunity) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    void action(async () => {
      if (kind === 'activity') await portalFetch('/crm/opportunities/' + item.id + '/activities', json({ activityType: field(form,'type'), title: field(form,'title'), description: field(form,'description') || null }));
      if (kind === 'task') await portalFetch('/crm/tasks', json({ taskType: 'follow_up', title: field(form,'title'), opportunityId: item.id, customerId: item.customer_id, dueAt: timestamp(field(form,'due')) }));
      if (kind === 'art') await portalFetch('/arts', json({ customerId: item.customer_id, opportunityId: item.id, title: field(form,'title'), briefing: ['Produto','Quantidade','Cores','Escudo','Patrocínios','Referências','Entrega desejada','Observações'].map(label => label + ': ' + field(form,label)).join('\n') }));
      if (kind === 'quote') await portalFetch('/quotes', json({ customerId: item.customer_id, opportunityId: item.id, validUntil: field(form,'valid') || null,
        shippingCents: cents(field(form,'shipping')) ?? 0, discountCents: cents(field(form,'discount')) ?? 0, paymentTerms: field(form,'terms') || null,
        items: [{ productName: field(form,'product'), productSku: field(form,'sku'), quantity: Number(field(form,'quantity')), unitSalePriceCents: cents(field(form,'price')) }] }));
      target.reset(); setNotice('Registro salvo.'); refresh();
    });
  }

  function card(item: Opportunity) {
    return <article key={item.id} className={styles.card}>
      <button className={styles.titleButton} onClick={() => setOpened(item.id)}>{item.title}</button>
      <p>{item.customer_name}</p><strong>{formatBrl(item.estimated_value_cents)}</strong>
      <p>{item.owner_name || 'Sem responsável'}</p>
      <p className={item.status === 'open' && isLate(item.next_action_at) ? styles.late : undefined}>{item.next_action || 'Sem próxima ação'}{item.next_action_at && ' · ' + formatDateBr(item.next_action_at, { withTime: true })}</p>
    </article>;
  }

  return <main className={styles.crm}>
    <header className={styles.header}><div><Link href={homeHref}>← Meu dia</Link><h1>CRM comercial</h1>{session && <p>{session.activeUnit.name} · {session.user.fullName}</p>}</div>
      {write && <div className={styles.actions}><button onClick={() => { setDuplicateNames([]); setEditor('customer'); }}>Novo contato</button><button onClick={() => { setCustomerChoices([]); setCustomerQuery(''); setEditor('opportunity'); }}>Nova oportunidade</button></div>}
    </header>
    {error && <p className={styles.late} role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {session === undefined ? <p>Verificando sessão…</p> : !session ? <form className={styles.form} onSubmit={login}>
      <h2>Entre com sua conta do portal</h2><label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label><button disabled={busy}>Entrar</button>
    </form> : !allowed('crm:read') ? <p>Seu perfil não tem acesso ao CRM desta unidade.</p> : <>
      <nav className={styles.actions} aria-label="Áreas do CRM">{tabs.filter(item => item !== 'Atividades' || allowed('tasks:read')).filter(item => item !== 'Propostas' || allowed('quotes:read')).map(item =>
        <button key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setPage(1); setOpened(''); }}>{item}</button>)}</nav>
      {editor && write && <section className={styles.panel}>
        <h2>{editor === 'customer' ? 'Novo cliente e contato' : 'Nova oportunidade'}</h2>
        <form key={editor} className={styles.form} onSubmit={create}>{editor === 'customer' ? <>
          <label>Nome do cliente<input name="name" required minLength={2} maxLength={120} /></label>
          <label>Tipo<select name="type">{[['time','Time'],['escolinha','Escolinha'],['academia','Academia'],['empresa','Empresa'],['organizador_eventos','Evento'],['atletica','Atlética'],['outro','Outro']].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Contato principal<input name="contact" /></label><label>Telefone<input name="phone" type="tel" /></label><label>E-mail<input name="email" type="email" /></label>
          <label>Cidade<input name="city" /></label><label>UF<input name="state" minLength={2} maxLength={2} /></label>
          {duplicateNames.length > 0 && <label className={styles.late}><input name="confirmDuplicate" type="checkbox" required /> Possíveis duplicados: {duplicateNames.join(', ')}. Confirmo que é outro cliente.</label>}
        </> : <>
          <label>Oportunidade<input name="title" required minLength={2} maxLength={150} /></label>
          <label>Buscar cliente<input type="search" value={customerQuery} onChange={event => setCustomerQuery(event.target.value)} /></label>
          <label>Cliente<select name="customer" required defaultValue=""><option value="">Selecione</option>{customerChoices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Segmento<input name="segment" /></label><label>Produtos de interesse (separados por vírgula)<input name="products" /></label>
          <label>Valor estimado em reais<input name="value" inputMode="decimal" /></label><label>Próxima ação<input name="nextAction" /></label>
          <label>Vencimento<input name="due" type="datetime-local" /></label><label>Observações<textarea name="notes" /></label>
        </>}
          <label>Origem<input name="origin" /></label><div className={styles.actions}><button disabled={busy}>Salvar</button><button type="button" onClick={() => setEditor('')}>Cancelar</button></div>
        </form>
      </section>}
      {(tab === 'Oportunidades' || tab === 'Contatos e clientes' || tab === 'Relatórios') && <div className={styles.actions}>
        <label>Buscar<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); setColumns({}); }} type="search" /></label>
        {tab !== 'Contatos e clientes' && <label>Etapa<select value={stage} onChange={event => { setStage(event.target.value); setPage(1); }}><option value="">Todas</option>{stages.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
        {tab === 'Oportunidades' && <><button aria-pressed={mode === 'kanban'} onClick={() => setMode('kanban')}>Kanban</button><button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>Lista</button></>}
      </div>}
      {loading ? <p role="status">Carregando registros…</p> : !error || data.items.length || customers.items.length ? <>
        {tab === 'Oportunidades' && (mode === 'kanban' ? <div className={styles.board} aria-label="Quadro de oportunidades">{stages.filter(([id]) => !stage || stage === id).map(([id,label]) => {
          const items = data.items.filter(item => item.stage === id);
          const stats = data.summary?.find(item => item.stage === id);
          return <section key={id} className={styles.column}><h2>{label}</h2><p>{stats?.count ?? items.length} · {formatBrl(stats?.value ?? '0')}</p>
            {items.map(card)}{!items.length && <p>Nenhuma oportunidade</p>}{(stats?.count ?? 0) > items.length && items.length < 100 && <button onClick={() => setColumns(current => ({ ...current, [id]: Math.min(100, items.length + 10) }))}>Carregar mais</button>}
          </section>;
        })}</div> : <div className={styles.table}><table><thead><tr>{['Oportunidade','Cliente','Etapa','Valor','Responsável','Próxima ação','Último contato'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.items.map(item => <tr key={item.id}><td><button className={styles.titleButton} onClick={() => setOpened(item.id)}>{item.title}</button></td><td>{item.customer_name}</td><td>{stageLabel(item.stage)}</td><td>{formatBrl(item.estimated_value_cents)}</td><td>{item.owner_name || '—'}</td><td>{item.next_action || 'Sem próxima ação'}</td><td>{formatDateBr(item.last_interaction_at)}</td></tr>)}</tbody></table>
          {!data.items.length && <p>Nenhuma oportunidade encontrada.</p>}
        </div>)}
        {tab === 'Contatos e clientes' && <section className={styles.list}>{customers.items.length ? customers.items.map(item => <article key={item.id} className={styles.card}><h2>{item.name}</h2><p>{[item.city,item.state].filter(Boolean).join(' / ')}</p>{item.contacts?.map((contact,index) => <p key={index}>{[contact.name,contact.phone,contact.email].filter(Boolean).join(' · ')}</p>)}</article>) : <p>Nenhum cliente encontrado.</p>}</section>}
        {tab === 'Atividades' && <section className={styles.list}>{tasks.length ? tasks.map(item => <article key={item.id} className={styles.card}><h2>{item.title}</h2><p>{item.assigned_name} · {formatDateBr(item.due_at,{withTime:true})}</p><p>{item.status === 'completed' ? 'Concluída' : item.status === 'canceled' ? 'Cancelada' : isLate(item.due_at) ? 'Atrasada' : 'Pendente'}</p>
          {allowed('tasks:write') && ['pending','in_progress'].includes(item.status) && <button disabled={busy} onClick={() => void action(async () => { await portalFetch('/crm/tasks/' + item.id,json({status:'completed'},'PATCH')); refresh(); })}>Concluir tarefa</button>}
        </article>) : <p>Nenhuma atividade cadastrada.</p>}</section>}
        {tab === 'Propostas' && <QuoteList quotes={quotes} />}
        {tab === 'Relatórios' && <section className={styles.list}>{(data.summary ?? []).map(item => <button key={item.stage} onClick={() => { setStage(item.stage); setPage(1); setMode('list'); setTab('Oportunidades'); }}>{stageLabel(item.stage)} · {item.count} · {formatBrl(item.value)} estimados</button>)}{!data.summary?.length && <p>Sem dados para os filtros atuais.</p>}</section>}
        {(tab === 'Contatos e clientes' || (tab === 'Oportunidades' && mode === 'list')) && <div className={styles.actions}>
          <button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} · {(tab === 'Contatos e clientes' ? customers : data).pagination?.total ?? 0} registros</span>
          <button disabled={page * 25 >= ((tab === 'Contatos e clientes' ? customers : data).pagination?.total ?? 0)} onClick={() => setPage(value => value + 1)}>Próxima</button>
        </div>}
      </> : <button onClick={refresh}>Tentar novamente</button>}
      {opened && <section className={styles.panel} aria-label="Detalhes da oportunidade"><button onClick={() => setOpened('')}>Fechar detalhes</button>
        {!detail ? <p>Consultando oportunidade…</p> : <>
          <h2>{detail.opportunity.title}</h2><p>{detail.opportunity.customer_name} · {stageLabel(detail.opportunity.stage)} · {formatBrl(detail.opportunity.estimated_value_cents)}</p>
          <p>{detail.opportunity.owner_name || 'Sem responsável'} · {detail.opportunity.next_action || 'Sem próxima ação'}</p><p>{detail.opportunity.notes}</p>
          {write && <details><summary>Mudar etapa</summary><form key={detail.opportunity.updated_at} className={styles.form} onSubmit={event => move(event, detail.opportunity)}>
            <label>Nova etapa<select name="stage" defaultValue={detail.opportunity.stage}>{stages.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>Motivo (perda ou reabertura)<input name="reason" maxLength={300} /></label><button disabled={busy}>Salvar etapa</button>
          </form></details>}
          {write && <details><summary>Registrar contato</summary><form className={styles.form} onSubmit={event => record(event,'activity',detail.opportunity)}>
            <label>Canal<select name="type">{[['call','Ligação'],['whatsapp','WhatsApp (registro manual)'],['meeting','Reunião'],['email','E-mail'],['note','Nota']].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>Assunto<input name="title" minLength={2} required /></label><label>Resumo<textarea name="description" /></label><button disabled={busy}>Registrar</button>
          </form></details>}
          {allowed('tasks:write') && <details><summary>Agendar retorno</summary><form className={styles.form} onSubmit={event => record(event,'task',detail.opportunity)}>
            <label>Tarefa<input name="title" minLength={2} required /></label><label>Vencimento<input name="due" type="datetime-local" required /></label><button disabled={busy}>Agendar</button>
          </form></details>}
          {allowed('arts:write') && <details><summary>Solicitar arte com briefing</summary><form className={styles.form} onSubmit={event => record(event,'art',detail.opportunity)}>
            <label>Nome da arte<input name="title" minLength={2} required /></label>{['Produto','Quantidade','Cores','Escudo','Patrocínios','Referências','Entrega desejada','Observações'].map(label => <label key={label}>{label}<input name={label} /></label>)}<button disabled={busy}>Solicitar arte</button>
          </form></details>}
          {allowed('quotes:write') && <details><summary>Criar proposta de um item</summary><form className={styles.form} onSubmit={event => record(event,'quote',detail.opportunity)}>
            <label>Produto<input name="product" required /></label><label>SKU<input name="sku" required /></label><label>Quantidade<input name="quantity" type="number" min={1} required /></label>
            <label>Preço unitário (R$)<input name="price" inputMode="decimal" required /></label><label>Frete (R$)<input name="shipping" inputMode="decimal" /></label>
            <label>Desconto (R$)<input name="discount" inputMode="decimal" /></label><label>Validade<input name="valid" type="date" /></label><label>Condições<input name="terms" /></label><button disabled={busy}>Salvar proposta</button>
          </form></details>}
          <h3>Timeline comercial</h3>{detail.activities.length ? <ol>{detail.activities.map(item => <li key={item.id}><strong>{item.title}</strong><p>{item.created_by_name || 'Sistema'} · {formatDateBr(item.created_at,{withTime:true})}</p>{item.description && <p>{item.description}</p>}</li>)}</ol> : <p>Nenhum evento registrado.</p>}
          {allowed('quotes:read') && <><h3>Propostas vinculadas</h3><QuoteList quotes={detail.quotes} /></>}
        </>}
      </section>}
    </>}
  </main>;
}

function QuoteList({ quotes }: { quotes: Quote[] }) {
  return quotes.length ? <div className={styles.list}>{quotes.map(item => <article key={item.id} className={styles.card}><h3>{item.quote_number}</h3><p>{item.customer_name} · {QUOTE_STATUS_LABELS[item.status] || item.status} · {formatBrl(item.total_cents)}</p><a href={'/api/v1/quotes/' + item.id + '/print'} target="_blank" rel="noreferrer">Abrir proposta para imprimir</a></article>)}</div> : <p>Nenhuma proposta cadastrada.</p>;
}
