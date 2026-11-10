import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';

// Garante que server.ts não tente dar listen na porta 4000 quando importado em testes
process.env.NODE_ENV = 'test';

const IDS = {
  units: {
    sp: '11111111-1111-4111-8111-111111111101',
    cps: '11111111-1111-4111-8111-111111111102',
    cwb: '11111111-1111-4111-8111-111111111103',
    bh: '11111111-1111-4111-8111-111111111104',
    hq: '11111111-1111-4111-8111-111111111199',
  },
  customers: {
    spMackenzie: '22222222-2222-4222-8222-222222222201',
    cpsGuarani: '22222222-2222-4222-8222-222222222206',
  },
  orders: {
    ks1041Prod: '66666666-6666-4666-8666-666666666601',
    ks1042Blocked: '66666666-6666-4666-8666-666666666602',
    ks1039Canceled: '66666666-6666-4666-8666-666666666606',
    cpsOrder: '66666666-6666-4666-8666-666666666607',
  },
  tickets: {
    spOpen: '88888888-8888-4888-8888-888888888801',
    cpsTicket: '88888888-8888-4888-8888-888888888803',
  },
  priceLists: {
    v2026: '99999999-9999-4999-8999-999999999901',
  },
};

const TEST_PASSWORD = process.env.SEED_PORTAL_PASSWORD || 'KingSports@2026';

let app: FastifyInstance;
let dbQuery: typeof import('../dist/plugins/db.js').dbQuery;
let withRlsUserContext: typeof import('../dist/plugins/db.js').withRlsUserContext;

const createdOrderIds: string[] = [];
const createdArtProjectIds: string[] = [];
const createdQuoteIds: string[] = [];
const createdScheduleEventIds: string[] = [];
const createdTaskIds: string[] = [];

function mergeCookieJar(existingCookie: string, setCookieHeaders: string | string[] | undefined): string {
  const jar = new Map<string, string>();
  if (existingCookie) {
    for (const part of existingCookie.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0) {
        jar.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
      }
    }
  }
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : setCookieHeaders ? [setCookieHeaders] : [];
  for (const raw of list) {
    const first = raw.split(';')[0] || '';
    const idx = first.indexOf('=');
    if (idx > 0) {
      jar.set(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
    }
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function loginAs(email: string): Promise<{ cookie: string; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email,
      password: TEST_PASSWORD,
      deviceName: `test-runner-${email}`,
    },
  });
  assert.equal(res.statusCode, 200, `Login falhou para ${email}: ${res.body}`);
  const cookie = mergeCookieJar('', res.headers['set-cookie']);
  assert.ok(cookie.includes('ks_portal_access='), `Cookie HttpOnly ausente no login de ${email}`);
  return { cookie, body: JSON.parse(res.body) };
}

describe('Portal do Franqueado King Sports — Integração API, RLS & Regras de Negócio', () => {
  before(async () => {
    const serverMod = await import('../dist/server.js');
    const dbMod = await import('../dist/plugins/db.js');
    dbQuery = dbMod.dbQuery;
    withRlsUserContext = dbMod.withRlsUserContext;
    app = serverMod.buildServer();
    await app.ready();
  });

  after(async () => {
    try {
      // Limpa apenas registros temporários criados por esta suíte de testes
      const allEntityIds = [
        ...createdOrderIds,
        ...createdArtProjectIds,
        ...createdQuoteIds,
        ...createdScheduleEventIds,
        ...createdTaskIds,
      ];
      if (allEntityIds.length > 0) {
        await dbQuery(`DELETE FROM portal.notifications WHERE entity_id::text = ANY($1::text[])`, [allEntityIds]);
        await dbQuery(`DELETE FROM portal.audit_logs WHERE entity_id::text = ANY($1::text[])`, [allEntityIds]);
      }
      if (createdScheduleEventIds.length > 0) {
        await dbQuery(`DELETE FROM portal.schedule_events WHERE id = ANY($1::uuid[])`, [createdScheduleEventIds]);
      }
      if (createdTaskIds.length > 0) {
        await dbQuery(`DELETE FROM portal.tasks WHERE id = ANY($1::uuid[])`, [createdTaskIds]);
      }
      if (createdOrderIds.length > 0) {
        await dbQuery(`DELETE FROM portal.approvals WHERE entity_type = 'order_grade' AND entity_id = ANY($1::uuid[])`, [createdOrderIds]);
        await dbQuery(`DELETE FROM portal.production_events WHERE order_id = ANY($1::uuid[])`, [createdOrderIds]);
        await dbQuery(`DELETE FROM portal.payment_transactions WHERE order_id = ANY($1::uuid[]) AND reversed_transaction_id IS NOT NULL`, [createdOrderIds]);
        await dbQuery(`DELETE FROM portal.payment_transactions WHERE order_id = ANY($1::uuid[])`, [createdOrderIds]);
        await dbQuery(`DELETE FROM portal.receivables WHERE order_id = ANY($1::uuid[])`, [createdOrderIds]);
        await dbQuery(`DELETE FROM portal.order_personalizations WHERE order_id = ANY($1::uuid[])`, [createdOrderIds]);
        await dbQuery(`DELETE FROM portal.order_items WHERE order_id = ANY($1::uuid[])`, [createdOrderIds]);
        await dbQuery(`DELETE FROM portal.orders WHERE id = ANY($1::uuid[])`, [createdOrderIds]);
      }
      if (createdArtProjectIds.length > 0) {
        await dbQuery(`DELETE FROM portal.approvals WHERE art_project_id = ANY($1::uuid[])`, [createdArtProjectIds]);
        await dbQuery(`DELETE FROM portal.art_comments WHERE art_project_id = ANY($1::uuid[])`, [createdArtProjectIds]);
        await dbQuery(`UPDATE portal.art_projects SET current_version_id = NULL, approved_version_id = NULL WHERE id = ANY($1::uuid[])`, [createdArtProjectIds]);
        await dbQuery(`DELETE FROM portal.art_versions WHERE art_project_id = ANY($1::uuid[])`, [createdArtProjectIds]);
        await dbQuery(`DELETE FROM portal.art_projects WHERE id = ANY($1::uuid[])`, [createdArtProjectIds]);
      }
      if (createdQuoteIds.length > 0) {
        await dbQuery(`DELETE FROM portal.quote_items WHERE quote_id = ANY($1::uuid[])`, [createdQuoteIds]);
        await dbQuery(`DELETE FROM portal.quotes WHERE id = ANY($1::uuid[])`, [createdQuoteIds]);
      }
    } finally {
      await app.close();
    }
  });

  it('1. Autenticação obrigatória e isolamento estrito multiunidade + RLS PostgreSQL', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/api/v1/dashboard/my-day' });
    assert.equal(unauth.statusCode, 401);

    const gestorSp = await loginAs('gestor.sp@kingsports.local');
    assert.equal(gestorSp.body.activeUnit.id, IDS.units.sp);
    assert.equal(gestorSp.body.availableUnits.length, 1);

    const membersRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/unit-members',
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(membersRes.statusCode, 200);
    const membersPayload = JSON.parse(membersRes.body);
    assert.ok(Array.isArray(membersPayload.members) && membersPayload.members.length >= 4);

    // Não pode trocar para Campinas se não possui vínculo lá
    const switchBlocked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/switch-unit',
      headers: { cookie: gestorSp.cookie },
      payload: { unitId: IDS.units.cps },
    });
    assert.equal(switchBlocked.statusCode, 403);

    // Não pode ler pedido ou chamado de Campinas
    const cpsOrderRes = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${IDS.orders.cpsOrder}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(cpsOrderRes.statusCode, 403);

    const cpsTicketRes = await app.inject({
      method: 'GET',
      url: `/api/v1/support/tickets/${IDS.tickets.cpsTicket}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(cpsTicketRes.statusCode, 403);

    // Não pode criar orçamento usando cliente de Campinas
    const crossQuoteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { cookie: gestorSp.cookie },
      payload: {
        customerId: IDS.customers.cpsGuarani,
        items: [{ productSku: 'KS-CAM-FUSION', productName: 'Fusion', quantity: 10, unitSalePriceCents: 5490 }],
      },
    });
    assert.equal(crossQuoteRes.statusCode, 403);

    // Usuário multiunidade legítimo alterna apenas entre SP e Campinas
    const diretor = await loginAs('diretor.sp.cps@kingsports.local');
    assert.equal(diretor.body.availableUnits.length, 2);

    const switchOk = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/switch-unit',
      headers: { cookie: diretor.cookie },
      payload: { unitId: IDS.units.cps },
    });
    assert.equal(switchOk.statusCode, 200);
    const cpsCookie = mergeCookieJar(diretor.cookie, switchOk.headers['set-cookie']);

    const cwbBlocked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/switch-unit',
      headers: { cookie: cpsCookie },
      payload: { unitId: IDS.units.cwb },
    });
    assert.equal(cwbBlocked.statusCode, 403);

    // Teste direto de RLS no PostgreSQL com JWT claim do gestor SP
    const gestorSpUserId = gestorSp.body.user.id as string;
    const rlsCpsRows = await withRlsUserContext(gestorSpUserId, async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM portal.orders WHERE unit_id = $1`,
        [IDS.units.cps]
      );
      return res.rows;
    });
    assert.equal(rlsCpsRows.length, 0, 'RLS falhou ao vazar linhas de Campinas para gestor de SP');
  });

  it('2. Controle de perfis RBAC estrito (franqueado e admin), escopo de rede e pendência de implantação BH', async () => {
    const [gestorSp, vendedorSp, fabrica, suporte, adminRede, gestorBh] = await Promise.all([
      loginAs('gestor.sp@kingsports.local'),
      loginAs('vendedor.sp@kingsports.local'),
      loginAs('fabrica.pcp@kingsports.local'),
      loginAs('suporte@kingsports.local'),
      loginAs('admin.rede@kingsports.local'),
      loginAs('gestor.bh@kingsports.local'),
    ]);

    assert.equal(gestorSp.body.activeRole.slug, 'franqueado');
    assert.equal(vendedorSp.body.activeRole.slug, 'franqueado');
    assert.equal(gestorBh.body.activeRole.slug, 'franqueado');
    assert.equal(fabrica.body.activeRole.slug, 'admin');
    assert.equal(suporte.body.activeRole.slug, 'admin');
    assert.equal(adminRede.body.activeRole.slug, 'admin');

    // Franqueado não pode avançar produção fabril, aplicar override, abrir Torre da Rede, avaliar Banca nem ler/gravar notas internas SAC
    const advForbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${IDS.orders.ks1041Prod}/production-stage`,
      headers: { cookie: gestorSp.cookie },
      payload: { stageCode: 'cutting' },
    });
    assert.equal(advForbidden.statusCode, 403);

    const overrideForbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${IDS.orders.ks1042Blocked}/release-production`,
      headers: { cookie: gestorSp.cookie },
      payload: { override: true, overrideReason: 'Tentativa não autorizada' },
    });
    assert.equal(overrideForbidden.statusCode, 403);

    const netAdminForbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/network-admin/overview',
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(netAdminForbidden.statusCode, 403);

    const bancaEvalForbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/sandbox/banca/${crypto.randomUUID()}/evaluate`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        salesScore: 9,
        artScore: 9,
        complianceOk: true,
        decision: 'approved',
        evaluatorNotes: 'Tentativa não autorizada',
      },
    });
    assert.equal(bancaEvalForbidden.statusCode, 403);

    // No modelo de 2 perfis, todo franqueado da unidade tem operação comercial completa (incluindo quotes:approve_discount)
    const franqueadoDiscountQuote = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { cookie: vendedorSp.cookie },
      payload: {
        customerId: IDS.customers.spMackenzie,
        discountCents: 30000,
        items: [{ productSku: 'KS-CAM-FUSION', productName: 'Fusion', quantity: 10, unitSalePriceCents: 5490 }],
      },
    });
    assert.equal(franqueadoDiscountQuote.statusCode, 201);
    createdQuoteIds.push(JSON.parse(franqueadoDiscountQuote.body).quote.id);

    // Perfis Admin acessam overview de rede e revisão do Sandbox
    const netAdminOverview = await app.inject({
      method: 'GET',
      url: '/api/v1/network-admin/overview',
      headers: { cookie: adminRede.cookie },
    });
    assert.equal(netAdminOverview.statusCode, 200);

    const netAdminFactory = await app.inject({
      method: 'GET',
      url: '/api/v1/network-admin/overview',
      headers: { cookie: fabrica.cookie },
    });
    assert.equal(netAdminFactory.statusCode, 200);

    const sbxSuporte = await app.inject({
      method: 'GET',
      url: '/api/v1/sandbox/overview',
      headers: { cookie: suporte.cookie },
    });
    assert.equal(sbxSuporte.statusCode, 200);

    // BH em onboarding deve listar pendências explícitas de implantação sem bloqueio silencioso
    const bhMyDay = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/my-day',
      headers: { cookie: gestorBh.cookie },
    });
    assert.equal(bhMyDay.statusCode, 200);
    const bhBody = JSON.parse(bhMyDay.body);
    assert.ok(
      Array.isArray(bhBody.unitGovernance?.implantationPendingItems) &&
        bhBody.unitGovernance.implantationPendingItems.length >= 3
    );
  });

  it('3. Versionamento imutável de arte, aprovação por versão e invalidação por revisão', async () => {
    const gestorSp = await loginAs('gestor.sp@kingsports.local');

    // Cria projeto de arte
    const artProjRes = await app.inject({
      method: 'POST',
      url: '/api/v1/arts',
      headers: { cookie: gestorSp.cookie },
      payload: {
        customerId: IDS.customers.spMackenzie,
        title: 'Teste Integração Versionamento Arte',
        briefing: 'Camisa Fusion azul e branca com escudo bordado',
      },
    });
    assert.equal(artProjRes.statusCode, 201);
    const artProjId = JSON.parse(artProjRes.body).project.id as string;
    createdArtProjectIds.push(artProjId);

    // Envia v1 (sem arquivo binário obrigatório para Storage no teste rápido)
    const v1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/arts/${artProjId}/versions`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        artifactKind: 'arte_revisao',
        fileName: 'teste_v1.png',
        previewSummary: 'Layout v1 inicial',
      },
    });
    assert.equal(v1Res.statusCode, 201);
    const v1Id = JSON.parse(v1Res.body).version.id as string;

    // Aprova v1 explicitamente
    const approveV1 = await app.inject({
      method: 'POST',
      url: `/api/v1/arts/${artProjId}/approve`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        artVersionId: v1Id,
        approvedByName: 'Cliente Teste SP',
        identificationMethod: 'Aceite registrado em teste automatizado',
        acceptanceEvidence: 'OK na versão v1',
      },
    });
    assert.equal(approveV1.statusCode, 201);
    assert.equal(JSON.parse(approveV1.body).versionNumber, 1);

    // Cria pedido temporário vinculado à v1 aprovada
    const tempOrderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie: gestorSp.cookie },
      payload: {
        customerId: IDS.customers.spMackenzie,
        artProjectId: artProjId,
        approvedArtVersionId: v1Id,
        requireEntryPayment: false,
        deliveryAddress: { city: 'São Paulo', state: 'SP', street: 'Av. Paulista, 1000' },
        items: [{ productSku: 'KS-CAM-FUSION', productName: 'Fusion', quantity: 12, unitPriceCents: 5490 }],
      },
    });
    assert.equal(tempOrderRes.statusCode, 201);
    const tempOrder = JSON.parse(tempOrderRes.body).order;
    createdOrderIds.push(tempOrder.id);
    assert.equal(tempOrder.approval_status, 'art_approved');

    // Publica v2 -> deve invalidar aprovação da v1 (`superseded`) e colocar pedido em `revision_required`!
    const v2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/arts/${artProjId}/versions`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        artifactKind: 'arte_revisao',
        fileName: 'teste_v2.png',
        previewSummary: 'Layout v2 com alteração de escudo',
      },
    });
    assert.equal(v2Res.statusCode, 201);
    const v2Body = JSON.parse(v2Res.body);
    assert.equal(v2Body.invalidatedApprovals, 1);

    const supCheck = await dbQuery<{ status: string }>(
      `SELECT status FROM portal.approvals WHERE art_project_id = $1 AND art_version_id = $2`,
      [artProjId, v1Id]
    );
    assert.equal(supCheck.rows[0]?.status, 'superseded');

    const ordAfterV2 = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${tempOrder.id}`,
      headers: { cookie: gestorSp.cookie },
    });
    const ordAfterV2Body = JSON.parse(ordAfterV2.body);
    assert.equal(ordAfterV2Body.order.approval_status, 'revision_required');
    assert.equal(ordAfterV2Body.releaseGate.canRelease, false);

    // Aprova v2 e depois solicita revisão -> deve revogar (`revoked`) e devolver status `ajustes`
    const v2Id = v2Body.version.id as string;
    const approveV2 = await app.inject({
      method: 'POST',
      url: `/api/v1/arts/${artProjId}/approve`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        artVersionId: v2Id,
        approvedByName: 'Cliente Teste SP',
        identificationMethod: 'Aceite v2',
        acceptanceEvidence: 'OK na v2',
      },
    });
    assert.equal(approveV2.statusCode, 201);

    const revReq = await app.inject({
      method: 'POST',
      url: `/api/v1/arts/${artProjId}/comments`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        artVersionId: v2Id,
        commentType: 'revision_request',
        body: 'Ajustar tamanho do patrocinador nas costas.',
      },
    });
    assert.equal(revReq.statusCode, 201);
    assert.equal(JSON.parse(revReq.body).invalidatedApprovals, 1);

    const revCheck = await dbQuery<{ status: string }>(
      `SELECT status FROM portal.approvals WHERE art_project_id = $1 AND art_version_id = $2`,
      [artProjId, v2Id]
    );
    assert.equal(revCheck.rows[0]?.status, 'revoked');
  });

  it('4. Gatekeeper fabril rigoroso (422 em pendências) e exceção auditada (override)', async () => {
    const [gestorSp, fabrica] = await Promise.all([
      loginAs('gestor.sp@kingsports.local'),
      loginAs('fabrica.pcp@kingsports.local'),
    ]);

    // Pedido KS-1042 seeded bloqueado por grade + entrada financeira + aceite PCP
    const releaseBlocked = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${IDS.orders.ks1042Blocked}/release-production`,
      headers: { cookie: gestorSp.cookie },
      payload: { override: false },
    });
    assert.equal(releaseBlocked.statusCode, 422);
    const gateBody = JSON.parse(releaseBlocked.body);
    assert.equal(gateBody.code, 'PRODUCTION_RELEASE_BLOCKED');
    const gradeCheck = gateBody.releaseGate.checks.find((c: any) => c.key === 'approved_grade');
    const finCheck = gateBody.releaseGate.checks.find((c: any) => c.key === 'financial_condition');
    assert.equal(gradeCheck?.passed, false);
    assert.equal(finCheck?.passed, false);

    // Em pedido temporário, fábrica PCP consegue liberar com exceção formal + audit log
    const tempOrderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie: gestorSp.cookie },
      payload: {
        customerId: IDS.customers.spMackenzie,
        requireEntryPayment: true,
        deliveryAddress: { city: 'São Paulo', state: 'SP', street: 'Rua Teste, 50' },
        items: [{ productSku: 'KS-CAM-SWIFT', productName: 'Swift', quantity: 10, unitPriceCents: 4990 }],
      },
    });
    assert.equal(tempOrderRes.statusCode, 201);
    const tempOrderId = JSON.parse(tempOrderRes.body).order.id as string;
    createdOrderIds.push(tempOrderId);

    const overrideOk = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${tempOrderId}/release-production`,
      headers: { cookie: fabrica.cookie },
      payload: {
        override: true,
        overrideReason: 'Liberação emergencial autorizada pela diretoria industrial.',
      },
    });
    assert.equal(overrideOk.statusCode, 200);
    assert.equal(JSON.parse(overrideOk.body).productionStatus, 'queued_pcp');

    const auditRes = await dbQuery<{ action: string; reason: string | null }>(
      `SELECT action, reason FROM portal.audit_logs WHERE entity_type = 'order' AND entity_id = $1 AND action = 'order.production_released_override'`,
      [tempOrderId]
    );
    assert.equal(auditRes.rowCount, 1);
    assert.match(auditRes.rows[0].reason || '', /diretoria industrial/i);
  });

  it('5. Idempotência financeira, validação de comprovante, estorno, orçamento incompleto/P03 e taxa R$ 20k', async () => {
    const [gestorSp, financeiroSp, gestorCps, gestorCwb] = await Promise.all([
      loginAs('gestor.sp@kingsports.local'),
      loginAs('financeiro.sp@kingsports.local'),
      loginAs('gestor.campinas@kingsports.local'),
      loginAs('gestor.curitiba@kingsports.local'),
    ]);

    // Cria pedido e recebe parcela padrão de R$ 500,00
    const ordRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie: gestorSp.cookie },
      payload: {
        customerId: IDS.customers.spMackenzie,
        deliveryAddress: { city: 'São Paulo', state: 'SP', street: 'Rua Fin, 100' },
        items: [{ productSku: 'KS-CAM-SWIFT', productName: 'Swift', quantity: 10, unitPriceCents: 5000 }],
      },
    });
    assert.equal(ordRes.statusCode, 201);
    const ordId = JSON.parse(ordRes.body).order.id as string;
    createdOrderIds.push(ordId);

    const recRes = await dbQuery<{ id: string }>(
      `SELECT id FROM portal.receivables WHERE order_id = $1`,
      [ordId]
    );
    const receivableId = recRes.rows[0].id;
    const idemKey = `test-idem-${crypto.randomUUID()}`;

    // Outra unidade (Campinas) não pode lançar recebimento em título de SP -> 403
    const crossUnitPayForbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments',
      headers: { cookie: gestorCps.cookie },
      payload: {
        receivableId,
        idempotencyKey: `${idemKey}-cross`,
        amountCents: 50000,
        paymentMethod: 'pix',
      },
    });
    assert.equal(crossUnitPayForbidden.statusCode, 403);

    // Franqueado da unidade registra pagamento padrão sem confirmação imediata -> entra em pending_validation
    const pay1 = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments',
      headers: { cookie: gestorSp.cookie },
      payload: {
        receivableId,
        idempotencyKey: idemKey,
        amountCents: 50000,
        paymentMethod: 'pix',
        confirmImmediately: false,
      },
    });
    assert.equal(pay1.statusCode, 201);
    const pay1Body = JSON.parse(pay1.body);
    assert.equal(pay1Body.idempotentReplay, false);
    assert.equal(pay1Body.transaction.confirmation_status, 'pending_validation');

    // Replay idempotente
    const payReplay = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/payments',
      headers: { cookie: gestorSp.cookie },
      payload: {
        receivableId,
        idempotencyKey: idemKey,
        amountCents: 50000,
        paymentMethod: 'pix',
      },
    });
    assert.equal(payReplay.statusCode, 200);
    const payReplayBody = JSON.parse(payReplay.body);
    assert.equal(payReplayBody.idempotentReplay, true);
    assert.equal(payReplayBody.transaction.id, pay1Body.transaction.id);

    // Saldo da parcela continua 0 pago antes da validação financeira
    const beforeVal = await dbQuery<{ paid_cents: string; status: string }>(
      `SELECT paid_cents::text, status FROM portal.receivables WHERE id = $1`,
      [receivableId]
    );
    assert.equal(Number(beforeVal.rows[0].paid_cents), 0);

    // Franqueado de outra unidade não pode validar pagamento de SP (403)
    const valForbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/finance/payments/${pay1Body.transaction.id}/validate`,
      headers: { cookie: gestorCps.cookie },
      payload: { decision: 'confirmed' },
    });
    assert.equal(valForbidden.statusCode, 403);

    // Franqueado da unidade SP valida pagamento
    const valRes = await app.inject({
      method: 'POST',
      url: `/api/v1/finance/payments/${pay1Body.transaction.id}/validate`,
      headers: { cookie: financeiroSp.cookie },
      payload: { decision: 'confirmed', notes: 'PIX conciliado em extrato' },
    });
    assert.equal(valRes.statusCode, 200);
    assert.equal(JSON.parse(valRes.body).recalculated.paidCents, 50000);

    // Estorno rastreado preserva histórico e restaura saldo em aberto (outra unidade bloqueada -> 403)
    const revForbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/finance/payments/${pay1Body.transaction.id}/reverse`,
      headers: { cookie: gestorCps.cookie },
      payload: { reason: 'Tentativa cross-unit não autorizada' },
    });
    assert.equal(revForbidden.statusCode, 403);

    const revRes = await app.inject({
      method: 'POST',
      url: `/api/v1/finance/payments/${pay1Body.transaction.id}/reverse`,
      headers: { cookie: financeiroSp.cookie },
      payload: { reason: 'Estorno de teste para validar reabertura do título' },
    });
    assert.equal(revRes.statusCode, 201);
    const revBody = JSON.parse(revRes.body);
    assert.equal(revBody.reversalTransaction.transaction_type, 'reversal');
    assert.equal(revBody.recalculated.paidCents, 0);

    // Orçamento com item sem custo (KS-AG-OXFORD) deve marcar estimativa incompleta
    const oxfordQuote = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { cookie: gestorSp.cookie },
      payload: {
        customerId: IDS.customers.spMackenzie,
        priceListId: IDS.priceLists.v2026,
        items: [
          {
            productSku: 'KS-AG-OXFORD',
            productName: 'Oxford',
            quantity: 10,
            unitSalePriceCents: 16990,
          },
        ],
      },
    });
    assert.equal(oxfordQuote.statusCode, 201);
    const oqBody = JSON.parse(oxfordQuote.body);
    createdQuoteIds.push(oqBody.quote.id);
    assert.equal(oqBody.calculation.estimationStatus, 'incomplete');
    assert.equal(oqBody.calculation.marginOnSalePct, null);

    // Produto P03 sob revisão jurídica deve retornar 422 explícito
    const lakersBlocked = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { cookie: gestorSp.cookie },
      payload: {
        customerId: IDS.customers.spMackenzie,
        priceListId: IDS.priceLists.v2026,
        items: [
          {
            productSku: 'KS-REG-LAKERS',
            productName: 'Regata Lakers',
            quantity: 10,
            unitSalePriceCents: 6000,
          },
        ],
      },
    });
    assert.equal(lakersBlocked.statusCode, 422);
    assert.equal(JSON.parse(lakersBlocked.body).code, 'PRODUCT_LEGAL_REVIEW_BLOCKED');

    // Governança financeira SP: sem split configurado + taxa R$ 20k isolada + KS-1039 excluído
    const spFinSummary = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/summary?period=all',
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(spFinSummary.statusCode, 200);
    const spSum = JSON.parse(spFinSummary.body);
    assert.equal(spSum.apportionmentBreakdown.available, false);
    assert.equal(spSum.contractualGovernance.initialFranchiseFeeCents, 2000000);
    assert.equal(spSum.contractualGovernance.includedInCommercialRevenue, false);
    assert.ok(spSum.kpis.canceledOrdersValueCents >= 149700);

    // Campinas possui configuração comercial aprovada (revenda 6% / 2%)
    const cpsFinSummary = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/summary?period=all',
      headers: { cookie: gestorCps.cookie },
    });
    assert.equal(cpsFinSummary.statusCode, 200);
    assert.equal(JSON.parse(cpsFinSummary.body).apportionmentBreakdown.available, true);

    // Curitiba sem movimento exibe zeros reais e conversão nula (sem inventar números)
    const cwbDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/my-day',
      headers: { cookie: gestorCwb.cookie },
    });
    assert.equal(cwbDash.statusCode, 200);
    const cwbBody = JSON.parse(cwbDash.body);
    assert.equal(cwbBody.commercialKpis.confirmedOrders.count, 0);
    assert.equal(cwbBody.commercialKpis.proposalConversion.ratePct, null);

    // Tentativa de integração externa sem credencial retorna 424 explícito
    const gatewayAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/finance/integrations/attempt',
      headers: { cookie: gestorSp.cookie },
      payload: { integrationName: 'asaas_payments', operation: 'generate_charge' },
    });
    assert.equal(gatewayAttempt.statusCode, 424);
    assert.equal(JSON.parse(gatewayAttempt.body).configured, false);
  });

  it('6. Isolamento do Sandbox e sigilo de notas internas do SAC', async () => {
    const [gestorSp, suporte] = await Promise.all([
      loginAs('gestor.sp@kingsports.local'),
      loginAs('suporte@kingsports.local'),
    ]);

    // Pedidos padrão de produção não incluem SBX-KS-9001
    const prodOrders = await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(prodOrders.statusCode, 200);
    const prodNumbers = JSON.parse(prodOrders.body).items.map((o: any) => o.order_number);
    assert.ok(!prodNumbers.includes('SBX-KS-9001'));

    const sbxOrders = await app.inject({
      method: 'GET',
      url: '/api/v1/orders?sandbox=true',
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(sbxOrders.statusCode, 200);
    const sbxNumbers = JSON.parse(sbxOrders.body).items.map((o: any) => o.order_number);
    assert.ok(sbxNumbers.includes('SBX-KS-9001'));

    // Gestor SP NÃO recebe mensagens is_internal=true do SAC-101
    const unitTicket = await app.inject({
      method: 'GET',
      url: `/api/v1/support/tickets/${IDS.tickets.spOpen}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(unitTicket.statusCode, 200);
    const unitMessages = JSON.parse(unitTicket.body).messages as any[];
    assert.ok(unitMessages.every((m) => m.is_internal === false));

    // Gestor SP também recebe 403 se tentar gravar nota interna
    const unitInternalPost = await app.inject({
      method: 'POST',
      url: `/api/v1/support/tickets/${IDS.tickets.spOpen}/messages`,
      headers: { cookie: gestorSp.cookie },
      payload: { body: 'Tentativa nota interna', isInternal: true },
    });
    assert.equal(unitInternalPost.statusCode, 403);

    // Suporte da franqueadora enxerga nota interna
    const supportTicket = await app.inject({
      method: 'GET',
      url: `/api/v1/support/tickets/${IDS.tickets.spOpen}`,
      headers: { cookie: suporte.cookie },
    });
    assert.equal(supportTicket.statusCode, 200);
    const supportMessages = JSON.parse(supportTicket.body).messages as any[];
    assert.ok(supportMessages.some((m) => m.is_internal === true));
  });

  it('7. Apenas dois perfis na plataforma (franqueado e admin), Agenda Google Calendar (/api/v1/schedule) e Tarefas (/api/v1/crm/tasks)', async () => {
    // 7A. Verifica estritamente 2 perfis no banco e nenhuma assinatura legada
    const rolesRes = await dbQuery<{ role_slug: string }>(
      `SELECT role_slug FROM portal.roles_permissions ORDER BY role_slug ASC`
    );
    assert.deepEqual(
      rolesRes.rows.map((r) => r.role_slug),
      ['admin', 'franqueado']
    );

    const invalidMembershipsRes = await dbQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM portal.unit_memberships WHERE role_slug NOT IN ('franqueado', 'admin')`
    );
    assert.equal(Number(invalidMembershipsRes.rows[0]?.cnt || 0), 0);

    const [gestorSp, gestorCps, adminRede] = await Promise.all([
      loginAs('gestor.sp@kingsports.local'),
      loginAs('gestor.campinas@kingsports.local'),
      loginAs('admin.rede@kingsports.local'),
    ]);

    // Endpoint de criação de usuário na rede rejeita perfis legados via Zod
    const legacyRoleRejected = await app.inject({
      method: 'POST',
      url: '/api/v1/network-admin/users',
      headers: { cookie: adminRede.cookie },
      payload: {
        fullName: 'Teste Perfil Legado',
        email: `legado-${crypto.randomUUID().slice(0, 8)}@kingsports.local`,
        password: 'KingSports@2026',
        unitId: IDS.units.sp,
        roleSlug: 'vendedor',
      },
    });
    assert.equal(legacyRoleRejected.statusCode, 400);
    assert.equal(JSON.parse(legacyRoleRejected.body).code, 'VALIDATION_ERROR');

    // 7B. Agenda Google Calendar (/api/v1/schedule)
    const now = Date.now();
    const deliveryStart = new Date(now + 2 * 3600_000);
    const deliveryEnd = new Date(now + 3 * 3600_000);
    const meetingStart = new Date(now + 26 * 3600_000);
    const meetingEnd = new Date(now + 27 * 3600_000);
    const runTag = crypto.randomUUID().slice(0, 8);

    // Valida intervalo inválido (endAt < startAt -> 400) e cliente de outra unidade (-> 403)
    const invalidDateSchedule = await app.inject({
      method: 'POST',
      url: '/api/v1/schedule',
      headers: { cookie: gestorSp.cookie },
      payload: {
        eventType: 'entrega',
        title: `Entrega Inválida ${runTag}`,
        startAt: deliveryEnd.toISOString(),
        endAt: deliveryStart.toISOString(),
      },
    });
    assert.equal(invalidDateSchedule.statusCode, 400);
    assert.equal(JSON.parse(invalidDateSchedule.body).code, 'INVALID_DATE_RANGE');

    const crossCustSchedule = await app.inject({
      method: 'POST',
      url: '/api/v1/schedule',
      headers: { cookie: gestorSp.cookie },
      payload: {
        eventType: 'reuniao',
        title: `Reunião Cross Unit ${runTag}`,
        startAt: meetingStart.toISOString(),
        endAt: meetingEnd.toISOString(),
        customerId: IDS.customers.cpsGuarani,
      },
    });
    assert.equal(crossCustSchedule.statusCode, 403);

    // Cria evento de entrega e evento de reunião
    const createDeliveryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/schedule',
      headers: { cookie: gestorSp.cookie },
      payload: {
        eventType: 'entrega',
        title: `Entrega Teste ${runTag}`,
        description: 'Entrega programada em São Paulo',
        startAt: deliveryStart.toISOString(),
        endAt: deliveryEnd.toISOString(),
        location: 'Av. Higienópolis, 500 - São Paulo/SP',
        customerId: IDS.customers.spMackenzie,
        orderId: IDS.orders.ks1041Prod,
        colorTag: 'blue',
      },
    });
    assert.equal(createDeliveryRes.statusCode, 201);
    const deliveryEvent = JSON.parse(createDeliveryRes.body).event;
    createdScheduleEventIds.push(deliveryEvent.id);
    assert.equal(deliveryEvent.event_type, 'entrega');
    assert.equal(deliveryEvent.customer_name !== null, true);

    const createMeetingRes = await app.inject({
      method: 'POST',
      url: '/api/v1/schedule',
      headers: { cookie: gestorSp.cookie },
      payload: {
        eventType: 'reuniao',
        title: `Reunião Teste ${runTag}`,
        startAt: meetingStart.toISOString(),
        endAt: meetingEnd.toISOString(),
        meetingUrl: 'https://meet.google.com/ks-teste-reuniao',
        customerId: IDS.customers.spMackenzie,
        colorTag: 'cyan',
      },
    });
    assert.equal(createMeetingRes.statusCode, 201);
    const meetingEvent = JSON.parse(createMeetingRes.body).event;
    createdScheduleEventIds.push(meetingEvent.id);

    // Filtra por período e eventType=entrega
    const rangeStart = new Date(now - 3600_000).toISOString();
    const rangeEnd = new Date(now + 48 * 3600_000).toISOString();
    const listEntregaRes = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&eventType=entrega`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(listEntregaRes.statusCode, 200);
    const entregaIds = JSON.parse(listEntregaRes.body).items.map((item: any) => item.id);
    assert.ok(entregaIds.includes(deliveryEvent.id));
    assert.ok(!entregaIds.includes(meetingEvent.id));

    // Dashboard /my-day inclui scheduleEvents próximos
    const spMyDayRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/my-day',
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(spMyDayRes.statusCode, 200);
    const spMyDayBody = JSON.parse(spMyDayRes.body);
    assert.ok(Array.isArray(spMyDayBody.scheduleEvents));
    assert.ok(spMyDayBody.scheduleEvents.some((ev: any) => ev.id === deliveryEvent.id));

    // Confirma e reagenda evento
    const rescheduledStart = new Date(now + 4 * 3600_000).toISOString();
    const rescheduledEnd = new Date(now + 5 * 3600_000).toISOString();
    const patchEventRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/schedule/${deliveryEvent.id}`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        status: 'confirmed',
        title: `Entrega Confirmada ${runTag}`,
        startAt: rescheduledStart,
        endAt: rescheduledEnd,
      },
    });
    assert.equal(patchEventRes.statusCode, 200);
    const updatedEvent = JSON.parse(patchEventRes.body).event;
    assert.equal(updatedEvent.status, 'confirmed');
    assert.equal(updatedEvent.title, `Entrega Confirmada ${runTag}`);

    // Isolamento cross-unit na agenda
    const crossPatchSchedule = await app.inject({
      method: 'PATCH',
      url: `/api/v1/schedule/${deliveryEvent.id}`,
      headers: { cookie: gestorCps.cookie },
      payload: { status: 'canceled' },
    });
    assert.equal(crossPatchSchedule.statusCode, 403);

    const crossDeleteSchedule = await app.inject({
      method: 'DELETE',
      url: `/api/v1/schedule/${deliveryEvent.id}`,
      headers: { cookie: gestorCps.cookie },
    });
    assert.equal(crossDeleteSchedule.statusCode, 403);

    // Exclui eventos temporários
    for (const evId of [deliveryEvent.id, meetingEvent.id]) {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/schedule/${evId}`,
        headers: { cookie: gestorSp.cookie },
      });
      assert.equal(delRes.statusCode, 200);
      assert.deepEqual(JSON.parse(delRes.body), { deleted: true, id: evId });
    }

    const afterDelList = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule?search=${encodeURIComponent(runTag)}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(afterDelList.statusCode, 200);
    assert.equal(JSON.parse(afterDelList.body).items.length, 0);

    // 7C. Tarefas (/api/v1/crm/tasks): criação, buckets, edição, conclusão, reabertura e exclusão
    const spTodayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const dueTodaySp = `${spTodayStr}T15:00:00.000Z`;
    const dueOverdue = new Date(now - 48 * 3600_000).toISOString();

    const createTaskTodayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/tasks',
      headers: { cookie: gestorSp.cookie },
      payload: {
        taskType: 'reuniao',
        title: `TarefaHoje-${runTag}`,
        description: 'Confirmar alinhamento de grade e entrega',
        customerId: IDS.customers.spMackenzie,
        orderId: IDS.orders.ks1041Prod,
        dueAt: dueTodaySp,
        priority: 'high',
      },
    });
    assert.equal(createTaskTodayRes.statusCode, 201);
    const taskToday = JSON.parse(createTaskTodayRes.body).task;
    createdTaskIds.push(taskToday.id);

    const createTaskOverdueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/tasks',
      headers: { cookie: gestorSp.cookie },
      payload: {
        taskType: 'follow_up',
        title: `TarefaAtrasada-${runTag}`,
        customerId: IDS.customers.spMackenzie,
        dueAt: dueOverdue,
        priority: 'urgent',
      },
    });
    assert.equal(createTaskOverdueRes.statusCode, 201);
    const taskOverdue = JSON.parse(createTaskOverdueRes.body).task;
    createdTaskIds.push(taskOverdue.id);

    // Bucket hoje
    const bucketHojeRes = await app.inject({
      method: 'GET',
      url: `/api/v1/crm/tasks?bucket=hoje&search=${encodeURIComponent(runTag)}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(bucketHojeRes.statusCode, 200);
    const hojeIds = JSON.parse(bucketHojeRes.body).items.map((t: any) => t.id);
    assert.ok(hojeIds.includes(taskToday.id));
    assert.ok(!hojeIds.includes(taskOverdue.id));

    // Bucket atrasadas
    const bucketAtrasadasRes = await app.inject({
      method: 'GET',
      url: `/api/v1/crm/tasks?bucket=atrasadas&search=${encodeURIComponent(runTag)}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(bucketAtrasadasRes.statusCode, 200);
    const atrasadasIds = JSON.parse(bucketAtrasadasRes.body).items.map((t: any) => t.id);
    assert.ok(atrasadasIds.includes(taskOverdue.id));
    assert.ok(!atrasadasIds.includes(taskToday.id));

    // Filtro priority + taskType em abertas
    const filteredOpenRes = await app.inject({
      method: 'GET',
      url: `/api/v1/crm/tasks?bucket=abertas&priority=urgent&taskType=follow_up&search=${encodeURIComponent(runTag)}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(filteredOpenRes.statusCode, 200);
    const filteredOpenIds = JSON.parse(filteredOpenRes.body).items.map((t: any) => t.id);
    assert.deepEqual(filteredOpenIds, [taskOverdue.id]);

    // Edita e conclui tarefa -> preenche completed_at e entra em concluidas
    const completeTaskRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/crm/tasks/${taskToday.id}`,
      headers: { cookie: gestorSp.cookie },
      payload: {
        title: `TarefaConcluida-${runTag}`,
        priority: 'urgent',
        status: 'completed',
      },
    });
    assert.equal(completeTaskRes.statusCode, 200);
    const completedTask = JSON.parse(completeTaskRes.body).task;
    assert.equal(completedTask.status, 'completed');
    assert.equal(completedTask.priority, 'urgent');
    assert.ok(completedTask.completed_at !== null);

    const bucketConcluidasRes = await app.inject({
      method: 'GET',
      url: `/api/v1/crm/tasks?bucket=concluidas&search=${encodeURIComponent(runTag)}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(bucketConcluidasRes.statusCode, 200);
    const concluidasIds = JSON.parse(bucketConcluidasRes.body).items.map((t: any) => t.id);
    assert.deepEqual(concluidasIds, [taskToday.id]);

    // Reabre tarefa -> limpa completed_at
    const reopenTaskRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/crm/tasks/${taskToday.id}`,
      headers: { cookie: gestorSp.cookie },
      payload: { status: 'pending' },
    });
    assert.equal(reopenTaskRes.statusCode, 200);
    const reopenedTask = JSON.parse(reopenTaskRes.body).task;
    assert.equal(reopenedTask.status, 'pending');
    assert.equal(reopenedTask.completed_at, null);

    // Cross-unit bloqueado em tarefas
    const crossPatchTask = await app.inject({
      method: 'PATCH',
      url: `/api/v1/crm/tasks/${taskToday.id}`,
      headers: { cookie: gestorCps.cookie },
      payload: { status: 'completed' },
    });
    assert.equal(crossPatchTask.statusCode, 403);

    const crossDeleteTask = await app.inject({
      method: 'DELETE',
      url: `/api/v1/crm/tasks/${taskToday.id}`,
      headers: { cookie: gestorCps.cookie },
    });
    assert.equal(crossDeleteTask.statusCode, 403);

    // Exclui tarefas de teste via DELETE
    for (const taskId of [taskToday.id, taskOverdue.id]) {
      const delTaskRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/crm/tasks/${taskId}`,
        headers: { cookie: gestorSp.cookie },
      });
      assert.equal(delTaskRes.statusCode, 200);
      assert.deepEqual(JSON.parse(delTaskRes.body), { deleted: true, id: taskId });
    }

    const afterDelTasksRes = await app.inject({
      method: 'GET',
      url: `/api/v1/crm/tasks?bucket=todos&search=${encodeURIComponent(runTag)}`,
      headers: { cookie: gestorSp.cookie },
    });
    assert.equal(afterDelTasksRes.statusCode, 200);
    assert.equal(JSON.parse(afterDelTasksRes.body).items.length, 0);
  });
});
