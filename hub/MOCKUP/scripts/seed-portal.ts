import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { dbPool, withTransaction } from '../apps/api/src/plugins/db.js';
import { supabaseAdmin } from '../apps/api/src/plugins/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEFAULT_PASSWORD = process.env.SEED_PORTAL_PASSWORD || 'KingSports@2026';

// UUIDs determinísticos para reexecução 100% idempotente
const IDS = {
  units: {
    sp: '11111111-1111-4111-8111-111111111101',
    cps: '11111111-1111-4111-8111-111111111102',
    cwb: '11111111-1111-4111-8111-111111111103',
    bh: '11111111-1111-4111-8111-111111111104',
    hq: '11111111-1111-4111-8111-111111111199',
  },
  customers: {
    mackenzie: '22222222-2222-4222-8222-222222222201',
    vilaMadalena: '22222222-2222-4222-8222-222222222202',
    pulseFit: '22222222-2222-4222-8222-222222222203',
    colegioVitoria: '22222222-2222-4222-8222-222222222204',
    copaMooca: '22222222-2222-4222-8222-222222222205',
    cpsGuaraniYouth: '22222222-2222-4222-8222-222222222206',
    sbxAtletica: '22222222-2222-4222-8222-222222222299',
  },
  opps: {
    mackenzie: '33333333-3333-4333-8333-333333333301',
    vilaMadalena: '33333333-3333-4333-8333-333333333302',
    pulseFit: '33333333-3333-4333-8333-333333333303',
    copaMooca: '33333333-3333-4333-8333-333333333304',
    lostExample: '33333333-3333-4333-8333-333333333305',
    cpsOpp: '33333333-3333-4333-8333-333333333306',
    sbxOpp: '33333333-3333-4333-8333-333333333399',
  },
  quotes: {
    mackenzie: '44444444-4444-4444-8444-444444444401',
    copaMoocaSent: '44444444-4444-4444-8444-444444444402',
    incompleteCost: '44444444-4444-4444-8444-444444444403',
  },
  arts: {
    mackenzie: '55555555-5555-4555-8555-555555555501',
    vilaMadalena: '55555555-5555-4555-8555-555555555502',
    pulseFit: '55555555-5555-4555-8555-555555555503',
    revisaoSuperseded: '55555555-5555-4555-8555-555555555504',
    sbxArt: '55555555-5555-4555-8555-555555555599',
  },
  artVersions: {
    mackV1: '56666666-5555-4555-8555-555555555501',
    vilaV1: '56666666-5555-4555-8555-555555555502',
    pulseV1: '56666666-5555-4555-8555-555555555503',
    revV1: '56666666-5555-4555-8555-555555555504',
    revV2: '56666666-5555-4555-8555-555555555505',
  },
  orders: {
    ks1041Prod: '66666666-6666-4666-8666-666666666601',
    ks1042Blocked: '66666666-6666-4666-8666-666666666602',
    ks1043WaitFactory: '66666666-6666-4666-8666-666666666603',
    ks1038Dispatched: '66666666-6666-4666-8666-666666666604',
    ks1035Delivered: '66666666-6666-4666-8666-666666666605',
    ks1039Canceled: '66666666-6666-4666-8666-666666666606',
    cpsOrder: '66666666-6666-4666-8666-666666666607',
    sbxOrder: '66666666-6666-4666-8666-666666666699',
  },
  receivables: {
    r1Paid: '77777777-7777-4777-8777-777777777701',
    r2OverduePartial: '77777777-7777-4777-8777-777777777702',
    r3PendingValidation: '77777777-7777-4777-8777-777777777703',
    r4Reversed: '77777777-7777-4777-8777-777777777704',
    r5WaitEntry: '77777777-7777-4777-8777-777777777705',
  },
  tickets: {
    spOpen: '88888888-8888-4888-8888-888888888801',
    spWaitingUnit: '88888888-8888-4888-8888-888888888802',
    cpsTicket: '88888888-8888-4888-8888-888888888803',
  },
  priceLists: {
    v2026: '99999999-9999-4999-8999-999999999901',
  },
  scheduleEvents: {
    entregaMackenzie: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    entregaSantaVitoria: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
    reuniaoCopaMooca: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
    reuniaoPulseFit: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
  },
};

const SEED_USERS = [
  { email: 'gestor.sp@kingsports.local', fullName: 'Lucas Andrade', roleSlug: 'franqueado', unitId: IDS.units.sp },
  { email: 'vendedor.sp@kingsports.local', fullName: 'Mariana Souza', roleSlug: 'franqueado', unitId: IDS.units.sp },
  { email: 'designer.sp@kingsports.local', fullName: 'Rafael Costa', roleSlug: 'franqueado', unitId: IDS.units.sp },
  { email: 'financeiro.sp@kingsports.local', fullName: 'Beatriz Lima', roleSlug: 'franqueado', unitId: IDS.units.sp },
  {
    email: 'diretor.sp.cps@kingsports.local',
    fullName: 'Eduardo Nogueira',
    roleSlug: 'franqueado',
    unitId: IDS.units.sp,
    secondaryMemberships: [{ unitId: IDS.units.cps, roleSlug: 'franqueado' }],
  },
  { email: 'gestor.campinas@kingsports.local', fullName: 'Camila Ferreira', roleSlug: 'franqueado', unitId: IDS.units.cps },
  { email: 'gestor.curitiba@kingsports.local', fullName: 'Henrique Rocha', roleSlug: 'franqueado', unitId: IDS.units.cwb },
  { email: 'gestor.bh@kingsports.local', fullName: 'Patrícia Alves', roleSlug: 'franqueado', unitId: IDS.units.bh },
  { email: 'fabrica.pcp@kingsports.local', fullName: 'Carlos Alberto PCP', roleSlug: 'admin', unitId: IDS.units.hq },
  { email: 'suporte@kingsports.local', fullName: 'Fernanda Martins SAC', roleSlug: 'admin', unitId: IDS.units.hq },
  { email: 'admin.rede@kingsports.local', fullName: 'Augusto Igor Rede', roleSlug: 'admin', unitId: IDS.units.hq },
];

const CATALOG_PRODUCTS = [
  { sku: 'KS-CAM-FUSION', slug: 'fusion', name: 'Fusion', category: 'Camisas', fabric: 'Dry Fit Colmeia', comp: '100% Poliéster microfilamentado (Dry Fit Colmeia 145g/m²)', modeling: 'Gola redonda + faixa nos ombros', supply: 3290, sale: 5490, legalReview: false },
  { sku: 'KS-CAM-AUTH', slug: 'authentic', name: 'Authentic', category: 'Camisas', fabric: 'Thermo Dry + Ribana Canelada', comp: '92% Poliéster 8% Elastano Thermo Dry + Ribana Canelada', modeling: 'Linha premium clube com escudo TPU 3D', supply: 5490, sale: 9890, legalReview: false },
  { sku: 'KS-CAM-LIBERTY', slug: 'liberty', name: 'Liberty', category: 'Camisas', fabric: 'Slide Dry', comp: '100% Poliéster Slide Dry UV50+', modeling: 'Gola V estilizada + recorte anatômico', supply: 5490, sale: 9890, legalReview: false },
  { sku: 'KS-CAM-ZENITH', slug: 'zenith', name: 'Zenith', category: 'Camisas', fabric: 'Jacquard 3D + Slide Dry', comp: '100% Poliéster Jacquard 3D textura profissional', modeling: 'Gola retilínea personalizada + TPU', supply: 5790, sale: 9890, legalReview: false },
  { sku: 'KS-CAM-SWIFT', slug: 'swift', name: 'Swift', category: 'Camisas', fabric: 'AeroDry Leve', comp: '100% Poliéster AeroDry 125g/m²', modeling: 'Gola careca tradicional', supply: 2890, sale: 4990, legalReview: false },
  { sku: 'KS-CAM-PRIME', slug: 'prime-fit', name: 'Prime Fit', category: 'Camisas', fabric: 'Dry Fit Colmeia', comp: '100% Poliéster Dry Fit Colmeia', modeling: 'Modelagem ajustada society e futsal', supply: 2950, sale: 4990, legalReview: false },
  { sku: 'KS-CAM-ALFA', slug: 'alpha', name: 'Alfa', category: 'Camisas', fabric: 'Dry Colmeia + AeroDry', comp: 'Poliéster duplo por zona térmica', modeling: 'Recortes laterais ventilados', supply: 3290, sale: 5490, legalReview: false },
  { sku: 'KS-CAM-EVOL', slug: 'evolution', name: 'Evolution', category: 'Camisas', fabric: 'Thermo Dry', comp: '100% Poliéster Thermo Dry', modeling: 'Manga raglã esportiva contínua', supply: 3290, sale: 5490, legalReview: false },
  { sku: 'KS-CAM-ECLIPSE', slug: 'eclipse', name: 'Eclipse', category: 'Camisas', fabric: 'AeroDry', comp: '100% Poliéster AeroDry', modeling: 'Gola careca anatômica', supply: 2890, sale: 4990, legalReview: false },
  { sku: 'KS-CAM-INF', slug: 'infinity', name: 'Infinity', category: 'Camisas', fabric: 'Slide Dry + Retilínea', comp: '100% Poliéster Slide Dry + punho duplo retilínea', modeling: 'Clubes estruturados e escolinhas', supply: 5490, sale: 9890, legalReview: false },
  { sku: 'KS-AG-TREND', slug: 'trend', name: 'Trend', category: 'Agasalhos & College', fabric: 'Moletom Felpado', comp: '75% Algodão 25% Poliéster Felpado 300g/m²', modeling: 'Jaqueta de passeio + DTF', supply: 7890, sale: 13990, legalReview: false },
  { sku: 'KS-POL-RETRO', slug: 'polo-retro', name: 'Polo Retrô', category: 'Polos', fabric: 'Piquet Têxtil Premium', comp: '50% Algodão 50% Poliéster Piquet', modeling: 'Gola retilínea + vista clássica', supply: 6290, sale: 10990, legalReview: false },
  { sku: 'KS-AG-BOBO', slug: 'bobojaco', name: 'Bobojaco', category: 'Agasalhos & College', fabric: 'TecnoSport Matelassê', comp: '100% Poliéster matelassado + manta térmica', modeling: 'Jaqueta acolchoada de inverno', supply: 13890, sale: 23990, legalReview: false },
  { sku: 'KS-POL-LEG', slug: 'polo-legacy', name: 'Polo Legacy', category: 'Polos', fabric: 'Dry Piquet Sublimado', comp: '100% Poliéster Dry Piquet', modeling: 'Gola polo corporativa e esportiva', supply: 4590, sale: 7790, legalReview: false },
  { sku: 'KS-AG-COLL', slug: 'college', name: 'College', category: 'Agasalhos & College', fabric: 'Moletom 3 Cabos', comp: '70% Algodão 30% Poliéster 3 Cabos', modeling: 'Jaqueta colegial punhos listrados', supply: 11290, sale: 19990, legalReview: false },
  { sku: 'KS-AG-COLBOT', slug: 'college-botao-sublimado', name: 'College Botão Sublimado', category: 'Agasalhos & College', fabric: 'TecnoSport + Moletom', comp: 'Poliéster sublimável + forro moletom', modeling: 'Fechamento por botões sublimada', supply: 10900, sale: 19000, legalReview: false },
  { sku: 'KS-AG-COLZIP', slug: 'college-ziper-sublimado', name: 'College Zíper Sublimado', category: 'Agasalhos & College', fabric: 'TecnoSport Leve', comp: '100% Poliéster TecnoSport', modeling: 'Zíper frontal integral', supply: 9290, sale: 16000, legalReview: false },
  { sku: 'KS-REG-LAKERS', slug: 'regata-lakers', name: 'Regata Lakers', category: 'Regatas & Bermudas', fabric: 'Dry Fit Colmeia', comp: '100% Poliéster Dry Fit Colmeia', modeling: 'Regata basquete / corrida cava anatômica', supply: 3500, sale: 6000, legalReview: true },
  { sku: 'KS-BER-LAKERS', slug: 'bermuda-lakers', name: 'Bermuda Lakers', category: 'Regatas & Bermudas', fabric: 'TecnoSport / Colmeia', comp: '100% Poliéster TecnoSport', modeling: 'Bermuda basquete / treino', supply: 3500, sale: 6000, legalReview: true },
  { sku: 'KS-AG-OXFORD', slug: 'oxford', name: 'Oxford', category: 'Agasalhos & College', fabric: 'Oxford Estruturado', comp: '100% Poliéster Oxford + forro leve', modeling: 'Jaqueta institucional (custo sob consulta)', supply: null, sale: 16990, legalReview: false },
  { sku: 'KS-FEM-BL', slug: 'baby-look', name: 'Baby Look', category: 'Feminino', fabric: 'AeroDry / Slide Dry', comp: '100% Poliéster AeroDry feminino', modeling: 'Corte acinturado feminino', supply: 2890, sale: 4990, legalReview: false },
];

const COURSES_SEED = [
  { code: 'SEC-01', order: 1, title: 'Setor 1 — Onboarding, Cultura e Governança King Sports', format: 'Vídeo + Manual + Quiz', deliverable: 'Aceite de regras operacionais e escopo da franquia home based', criteria: '100% das aulas concluídas + quiz ≥ 80%' },
  { code: 'SEC-02', order: 2, title: 'Setor 2 — Catálogo Técnico, Tecidos e Personalizações', format: 'Catálogo Interativo + Vídeo', deliverable: 'Domínio de Dry Colmeia, Thermo Dry, Jacquard, TPU e DTF', criteria: 'Conclusão das lições técnicas' },
  { code: 'SEC-03', order: 3, title: 'Setor 3 — Precificação, Orçamentos e Margem Real', format: 'Planilha + Simulação', deliverable: 'Elaboração de proposta sem inventar margens quando custo ausente', criteria: 'Simulação aprovada no módulo Orçamentos' },
  { code: 'SEC-04', order: 4, title: 'Setor 4 — CRM Comercial, Prospecção Regional e Follow-up', format: 'Roteiro + Caso Prático', deliverable: 'Pipeline completo sem duplicidades nem perda sem motivo', criteria: 'Caso prático cadastrado no Sandbox' },
  { code: 'SEC-05', order: 5, title: 'Setor 5 — Studio 3D, Versionamento e Aprovação Jurídica de Arte', format: 'Prática no Mockup Studio', deliverable: 'Distinção entre Mockup Ilustrativo e Arquivo Final + Aceite vinculado à versão', criteria: 'Prancha v1 + aprovação vinculada' },
  { code: 'SEC-06', order: 6, title: 'Setor 6 — Pedido, Grade Nominal e Gatekeeper do PCP (Fábrica SP)', format: 'Checklist Industrial', deliverable: 'Montagem de grade sem divergência entre itens e nomes/números', criteria: 'Checklist de liberação 100% validado' },
  { code: 'SEC-07', order: 7, title: 'Setor 7 — Financeiro, Recebimentos, SAC e Pós-Venda', format: 'Fluxo Operacional + Estudo de Caso', deliverable: 'Gestão de baixas com comprovante, estornos e abertura de chamados SAC', criteria: 'Quiz final + submissão na Banca' },
];

async function ensureAuthUser(email: string, fullName: string): Promise<string> {
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  if (listErr) {
    throw new Error(`Erro ao listar usuários Supabase Auth: ${listErr.message}`);
  }
  const existing = listData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    return existing.id;
  }

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    throw new Error(`Erro ao criar usuário ${email}: ${createErr?.message}`);
  }
  return created.user.id;
}

async function runSeed(): Promise<void> {
  console.log('▶ Iniciando seed idempotente do Portal do Franqueado King Sports...');

  // 1. Garante usuários reais no Supabase Auth antes da transação SQL
  const userIdsByEmail = new Map<string, string>();
  for (const u of SEED_USERS) {
    const uid = await ensureAuthUser(u.email, u.fullName);
    userIdsByEmail.set(u.email, uid);
  }

  await withTransaction(async (client) => {
    // 2. Unidades
    const unitsData = [
      {
        id: IDS.units.hq,
        code: 'HQ-MATRIZ',
        name: 'Matriz & Fábrica São Paulo',
        city: 'São Paulo',
        state: 'SP',
        type: 'headquarters',
        status: 'active',
        training: true,
        banca: true,
        implant: true,
        feeStatus: 'paid',
        notes: 'Unidade central de governança da rede e PCP industrial em São Paulo.',
      },
      {
        id: IDS.units.sp,
        code: 'KS-SP-01',
        name: 'King Sports Paulista (SP)',
        city: 'São Paulo',
        state: 'SP',
        type: 'franchise',
        status: 'active',
        training: true,
        banca: true,
        implant: true,
        feeStatus: 'paid',
        notes: 'Unidade home-based ativa em operação. Regra comercial/split aguardando aprovação contratual específica.',
      },
      {
        id: IDS.units.cps,
        code: 'KS-CPS-02',
        name: 'King Sports Campinas',
        city: 'Campinas',
        state: 'SP',
        type: 'franchise',
        status: 'active',
        training: true,
        banca: true,
        implant: true,
        feeStatus: 'paid',
        notes: 'Unidade ativa em Campinas com configuração comercial aprovada em carteira.',
      },
      {
        id: IDS.units.cwb,
        code: 'KS-CWB-03',
        name: 'King Sports Curitiba',
        city: 'Curitiba',
        state: 'PR',
        type: 'franchise',
        status: 'active',
        training: true,
        banca: true,
        implant: true,
        feeStatus: 'contract_defined',
        notes: 'Unidade recém-habilitada ainda sem movimento comercial (validação de estados vazios).',
      },
      {
        id: IDS.units.bh,
        code: 'KS-BH-04',
        name: 'King Sports Belo Horizonte',
        city: 'Belo Horizonte',
        state: 'MG',
        type: 'franchise',
        status: 'onboarding',
        training: false,
        banca: false,
        implant: false,
        feeStatus: 'installments',
        notes: 'Unidade em implantação: concluindo Universidade, Banca Prática e envio dos documentos obrigatórios.',
      },
    ];

    for (const u of unitsData) {
      await client.query(
        `INSERT INTO portal.units (
           id, code, name, city, state, unit_type, operational_status,
           training_completed, banca_approved, implantation_approved, implantation_notes,
           initial_franchise_fee_cents, initial_fee_status, is_demo
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,2000000,$12,FALSE)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           operational_status = EXCLUDED.operational_status,
           training_completed = EXCLUDED.training_completed,
           banca_approved = EXCLUDED.banca_approved,
           implantation_approved = EXCLUDED.implantation_approved,
           implantation_notes = EXCLUDED.implantation_notes,
           initial_fee_status = EXCLUDED.initial_fee_status`,
        [u.id, u.code, u.name, u.city, u.state, u.type, u.status, u.training, u.banca, u.implant, u.notes, u.feeStatus]
      );
    }

    // 3. Configurações Comerciais por Unidade (SP e BH sem invenção de regras; CPS com exemplo aprovado)
    await client.query(
      `INSERT INTO portal.unit_commercial_configs (
         unit_id, config_status, commercial_modality, royalty_bps, marketing_fund_bps,
         factory_transfer_bps, default_price_list_code, max_discount_bps, territory_rule_status, notes
       ) VALUES
         ($1, 'not_configured', 'pending_definition', NULL, NULL, NULL, 'KS_TABELA_2026_V1', 500, 'pending_contract_definition', 'Modalidade revenda vs intermediação, royalties e fundo de marketing aguardam definição contratual aprovada.'),
         ($2, 'approved', 'revenda', 600, 200, NULL, 'KS_TABELA_2026_V1', 500, 'configured_non_exclusive', 'Exemplo de unidade com regra comercial explicitamente configurada pela administração.'),
         ($3, 'not_configured', 'pending_definition', NULL, NULL, NULL, 'KS_TABELA_2026_V1', 500, 'not_configured', 'Aguardando parametrização comercial.'),
         ($4, 'not_configured', 'pending_definition', NULL, NULL, NULL, 'KS_TABELA_2026_V1', 500, 'not_configured', 'Unidade em implantação.'),
         ($5, 'approved', 'revenda', 0, 0, NULL, 'KS_TABELA_2026_V1', 1000, 'configured_non_exclusive', 'Matriz.')
       ON CONFLICT (unit_id) DO NOTHING`,
      [IDS.units.sp, IDS.units.cps, IDS.units.cwb, IDS.units.bh, IDS.units.hq]
    );

    // 4. Perfis e Vínculos de Unidade
    for (const u of SEED_USERS) {
      const uid = userIdsByEmail.get(u.email)!;
      await client.query(
        `INSERT INTO portal.profiles (id, full_name, email, default_unit_id, is_active)
         VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = TRUE`,
        [uid, u.fullName, u.email, u.unitId]
      );
      await client.query(
        `INSERT INTO portal.unit_memberships (user_id, unit_id, role_slug, status, is_primary)
         VALUES ($1,$2,$3,'active',TRUE)
         ON CONFLICT (user_id, unit_id) DO UPDATE SET role_slug = EXCLUDED.role_slug, status = 'active'`,
        [uid, u.unitId, u.roleSlug]
      );
      if ('secondaryMemberships' in u && u.secondaryMemberships) {
        for (const sec of u.secondaryMemberships) {
          await client.query(
            `INSERT INTO portal.unit_memberships (user_id, unit_id, role_slug, status, is_primary)
             VALUES ($1,$2,$3,'active',FALSE)
             ON CONFLICT (user_id, unit_id) DO UPDATE SET role_slug = EXCLUDED.role_slug, status = 'active'`,
            [uid, sec.unitId, sec.roleSlug]
          );
        }
      }
    }

    const gestorSpId = userIdsByEmail.get('gestor.sp@kingsports.local')!;
    const vendedorSpId = userIdsByEmail.get('vendedor.sp@kingsports.local')!;
    const designerSpId = userIdsByEmail.get('designer.sp@kingsports.local')!;
    const gestorCpsId = userIdsByEmail.get('gestor.campinas@kingsports.local')!;
    const gestorBhId = userIdsByEmail.get('gestor.bh@kingsports.local')!;
    const fabricaId = userIdsByEmail.get('fabrica.pcp@kingsports.local')!;
    const suporteId = userIdsByEmail.get('suporte@kingsports.local')!;
    const adminId = userIdsByEmail.get('admin.rede@kingsports.local')!;

    // 5. Catálogo & Tabela de Preços Vigente (respeitando P03 Lakers em revisão jurídica e Oxford sem custo definido)
    await client.query(
      `INSERT INTO portal.price_lists (id, code, name, version_code, profile_scope, valid_from, status, notes, created_by)
       VALUES ($1,'KS_TABELA_2026_V1','Tabela Oficial de Fornecimento Franquia 2026','v1.0','standard','2026-01-01T00:00:00Z','active','Tabela base com custos conhecidos por modelo. Itens sem custo exibem Estimativa Incompleta.',$2)
       ON CONFLICT (code, version_code) DO NOTHING`,
      [IDS.priceLists.v2026, adminId]
    );

    const productIdsBySlug = new Map<string, string>();
    const standardSizes = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
    const sizeChartBase = {
      PP: { largura_cm: 48, altura_cm: 67 },
      P: { largura_cm: 51, altura_cm: 70 },
      M: { largura_cm: 54, altura_cm: 73 },
      G: { largura_cm: 57, altura_cm: 76 },
      GG: { largura_cm: 61, altura_cm: 79 },
      XGG: { largura_cm: 65, altura_cm: 82 },
    };

    for (const prod of CATALOG_PRODUCTS) {
      const pRes = await client.query<{ id: string }>(
        `INSERT INTO portal.products (
           sku, slug, name, category, description, modeling, fabric, fabric_composition,
           size_chart, available_personalizations, moq, indicative_lead_time_min_days,
           indicative_lead_time_max_days, availability_status, legal_review_note, studio_model_id, is_active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,10,15,22,$11,$12,$13,TRUE)
         ON CONFLICT (slug) DO UPDATE SET
           availability_status = EXCLUDED.availability_status,
           legal_review_note = EXCLUDED.legal_review_note
         RETURNING id`,
        [
          prod.sku,
          prod.slug,
          prod.name,
          prod.category,
          `${prod.name} King Sports — ${prod.modeling}. Produção centralizada em São Paulo com controle de lote.`,
          prod.modeling,
          prod.fabric,
          prod.comp,
          JSON.stringify(sizeChartBase),
          JSON.stringify([
            { code: 'sublimacao_total', label: 'Sublimação total inclusa', extraCents: 0 },
            { code: 'escudo_tpu', label: 'Escudo TPU 3D aplicado', extraCents: 1200 },
            { code: 'nome_numero', label: 'Nome e número individuais', extraCents: 600 },
          ]),
          prod.legalReview ? 'legal_review' : 'available',
          prod.legalReview
            ? 'Ata P03: Nomenclatura "Lakers" sob análise de marca registrada antes de comercialização em escala.'
            : null,
          prod.slug,
        ]
      );
      const prodId = pRes.rows[0].id;
      productIdsBySlug.set(prod.slug, prodId);

      for (const sz of standardSizes) {
        await client.query(
          `INSERT INTO portal.product_variants (product_id, variant_sku, size_code, cut_type)
           VALUES ($1,$2,$3,'unissex')
           ON CONFLICT (variant_sku) DO NOTHING`,
          [prodId, `${prod.sku}-${sz}`, sz]
        );
      }

      await client.query(
        `INSERT INTO portal.price_list_items (
           price_list_id, product_id, supply_price_cents, suggested_sale_price_cents, unit_cost_cents
         ) VALUES ($1,$2,$3,$4,$3)
         ON CONFLICT (price_list_id, product_id) DO NOTHING`,
        [IDS.priceLists.v2026, prodId, prod.supply, prod.sale]
      );
    }

    // 6. Cursos e Aulas da Universidade (7 setores)
    for (const c of COURSES_SEED) {
      const cRes = await client.query<{ id: string }>(
        `INSERT INTO portal.courses (code, sector_order, title, description, format_label, deliverable_summary, validation_criteria, is_mandatory, is_published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,TRUE)
         ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title RETURNING id`,
        [c.code, c.order, c.title, `Módulo oficial ${c.title} do Manual do Hub Digital King Sports.`, c.format, c.deliverable, c.criteria]
      );
      const courseId = cRes.rows[0].id;

      const existingLesson = await client.query<{ id: string }>(
        `SELECT id FROM portal.lessons WHERE course_id = $1 LIMIT 1`,
        [courseId]
      );
      let lessonId: string;
      if (existingLesson.rows[0]) {
        lessonId = existingLesson.rows[0].id;
      } else {
        const lRes = await client.query<{ id: string }>(
          `INSERT INTO portal.lessons (course_id, lesson_order, title, summary, video_url, duration_minutes, quiz_questions, is_published)
           VALUES ($1,1,$2,$3,'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',14,$4,TRUE)
           RETURNING id`,
          [
            courseId,
            `Aula Principal — ${c.title}`,
            c.deliverable,
            JSON.stringify([
              {
                question: `Sobre ${c.title}: qual regra operacional é obrigatória na King Sports?`,
                options: [
                  'Liberar pedido para fábrica verbalmente sem aprovar arte/grade',
                  'Seguir fluxo formal com registro de evidência e aceite vinculado à versão',
                  'Ignorar prazo do evento',
                ],
                correctIndex: 1,
              },
            ]),
          ]
        );
        lessonId = lRes.rows[0].id;
      }

      // Marca trilhas concluídas para SP e parciais para BH
      await client.query(
        `INSERT INTO portal.enrollments (unit_id, user_id, course_id, status, score_pct, completed_at)
         VALUES ($1,$2,$3,'completed',100,NOW())
         ON CONFLICT (unit_id, user_id, course_id) DO NOTHING`,
        [IDS.units.sp, gestorSpId, courseId]
      );
      await client.query(
        `INSERT INTO portal.lesson_progress (unit_id, user_id, lesson_id, status, resume_position_seconds, quiz_score_pct, completed_at)
         VALUES ($1,$2,$3,'completed',840,100,NOW())
         ON CONFLICT (unit_id, user_id, lesson_id) DO NOTHING`,
        [IDS.units.sp, gestorSpId, lessonId]
      );

      if (c.order === 1) {
        await client.query(
          `INSERT INTO portal.lesson_progress (unit_id, user_id, lesson_id, status, resume_position_seconds)
           VALUES ($1,$2,$3,'in_progress',215)
           ON CONFLICT (unit_id, user_id, lesson_id) DO NOTHING`,
          [IDS.units.bh, gestorBhId, lessonId]
        );
      }
    }

    // 7. Clientes & Contatos (SP + Campinas + Sandbox)
    const customersSeed = [
      { id: IDS.customers.mackenzie, unit: IDS.units.sp, name: 'Atlética Direito Mackenzie', doc: '11.222.333/0001-44', type: 'atletica', city: 'São Paulo', state: 'SP', origin: 'Indicação Ex-Aluno', sbx: false, contact: 'Pedro Barreto', phone: '(11) 98765-4321' },
      { id: IDS.customers.vilaMadalena, unit: IDS.units.sp, name: 'E.C. Vila Madalena', doc: '22.333.444/0001-55', type: 'time', city: 'São Paulo', state: 'SP', origin: 'Instagram Local', sbx: false, contact: 'Rodrigo Tavares', phone: '(11) 97654-3210' },
      { id: IDS.customers.pulseFit, unit: IDS.units.sp, name: 'Academia Pulse Fit Morumbi', doc: '33.444.555/0001-66', type: 'academia', city: 'São Paulo', state: 'SP', origin: 'Visita Ativa', sbx: false, contact: 'Juliana Mendes', phone: '(11) 96543-2109' },
      { id: IDS.customers.colegioVitoria, unit: IDS.units.sp, name: 'Colégio Santa Vitória', doc: '44.555.666/0001-77', type: 'escolinha', city: 'São Caetano do Sul', state: 'SP', origin: 'Google Maps', sbx: false, contact: 'Prof. Marcelo Dias', phone: '(11) 95432-1098' },
      { id: IDS.customers.copaMooca, unit: IDS.units.sp, name: 'Liga Copa Mooca Society', doc: null, type: 'organizador_eventos', city: 'São Paulo', state: 'SP', origin: 'WhatsApp', sbx: false, contact: 'Thiago Ribeiro', phone: '(11) 94321-0987' },
      { id: IDS.customers.cpsGuaraniYouth, unit: IDS.units.cps, name: 'Escolinha Taquaral Futebol', doc: '55.666.777/0001-88', type: 'escolinha', city: 'Campinas', state: 'SP', origin: 'Indicação Regional', sbx: false, contact: 'Fábio Leite', phone: '(19) 98111-2233' },
      { id: IDS.customers.sbxAtletica, unit: IDS.units.sp, name: 'Time Simulado Banca FC (Sandbox)', doc: null, type: 'time', city: 'São Paulo', state: 'SP', origin: 'Sandbox Banca', sbx: true, contact: 'Contato Fictício', phone: '(11) 90000-0000' },
    ];

    for (const c of customersSeed) {
      await client.query(
        `INSERT INTO portal.customers (id, unit_id, name, document_number, customer_type, segment, city, state, address_line, origin, owner_user_id, is_sandbox, created_by)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,'Av. Principal, 500',$8,$9,$10,$9)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.unit, c.name, c.doc, c.type, c.city, c.state, c.origin, c.unit === IDS.units.cps ? gestorCpsId : gestorSpId, c.sbx]
      );
      await client.query(
        `INSERT INTO portal.customer_contacts (unit_id, customer_id, name, role_title, phone, whatsapp, is_primary)
         SELECT $1,$2,$3,'Responsável Comercial',$4,$4,TRUE
         WHERE NOT EXISTS (SELECT 1 FROM portal.customer_contacts WHERE customer_id = $2)`,
        [c.unit, c.id, c.contact, c.phone]
      );
    }

    // 8. Oportunidades (incluindo ganho, orçamento aguardando, perda com motivo e Campinas isolada)
    const oppSeeds = [
      { id: IDS.opps.mackenzie, unit: IDS.units.sp, cust: IDS.customers.mackenzie, title: '35 Camisas Authentic JUC 2026', stage: 'ganho', status: 'won', val: 346150, ev: 'NOW() + INTERVAL \'28 days\'', loss: null, sbx: false },
      { id: IDS.opps.vilaMadalena, unit: IDS.units.sp, cust: IDS.customers.vilaMadalena, title: '22 Conjuntos Liga Várzea Zona Oeste', stage: 'ganho', status: 'won', val: 217580, ev: 'NOW() + INTERVAL \'12 days\'', loss: null, sbx: false },
      { id: IDS.opps.pulseFit, unit: IDS.units.sp, cust: IDS.customers.pulseFit, title: '40 Camisas Staff Evolution', stage: 'ganho', status: 'won', val: 219600, ev: 'NOW() + INTERVAL \'21 days\'', loss: null, sbx: false },
      { id: IDS.opps.copaMooca, unit: IDS.units.sp, cust: IDS.customers.copaMooca, title: '60 Camisas Swift Premiação Torneio', stage: 'orcamento', status: 'open', val: 299400, ev: 'NOW() + INTERVAL \'35 days\'', loss: null, sbx: false },
      { id: IDS.opps.lostExample, unit: IDS.units.sp, cust: IDS.customers.colegioVitoria, title: 'Agasalhos Inverno 2026 (Lote Anterior)', stage: 'perdido', status: 'lost', val: 480000, ev: null, loss: 'Diretoria adiou troca do uniforme escolar para próximo semestre.', sbx: false },
      { id: IDS.opps.cpsOpp, unit: IDS.units.cps, cust: IDS.customers.cpsGuaraniYouth, title: '30 Kits Fusion Sub-13 Campinas', stage: 'negociacao', status: 'open', val: 164700, ev: 'NOW() + INTERVAL \'30 days\'', loss: null, sbx: false },
      { id: IDS.opps.sbxOpp, unit: IDS.units.sp, cust: IDS.customers.sbxAtletica, title: 'Caso Prático Banca — 25 Camisas Liberty', stage: 'orcamento', status: 'open', val: 247250, ev: 'NOW() + INTERVAL \'40 days\'', loss: null, sbx: true },
    ];
    for (const o of oppSeeds) {
      await client.query(
        `INSERT INTO portal.opportunities (
           id, unit_id, customer_id, title, stage, status, segment, city, state, origin,
           estimated_value_cents, products_of_interest, event_date, next_action, next_action_at,
           owner_user_id, loss_reason, won_at, lost_at, is_sandbox, created_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,'Esportivo','São Paulo','SP','Carteira Regional',
           $7,'["Authentic","Fusion"]'::jsonb, ${o.ev ? `(${o.ev})::date` : 'NULL'},
           'Acompanhar retorno com decisor', NOW() + INTERVAL '1 day',
           $8, $9, ${o.status === 'won' ? 'NOW()' : 'NULL'}, ${o.status === 'lost' ? 'NOW()' : 'NULL'}, $10, $8
         ) ON CONFLICT (id) DO NOTHING`,
        [o.id, o.unit, o.cust, o.title, o.stage, o.status, o.val, o.unit === IDS.units.cps ? gestorCpsId : vendedorSpId, o.loss, o.sbx]
      );
    }

    // 9. Orçamentos (completo e com estimativa incompleta para validar UI)
    const authId = productIdsBySlug.get('authentic')!;
    const swiftId = productIdsBySlug.get('swift')!;
    const oxfordId = productIdsBySlug.get('oxford')!;

    await client.query(
      `INSERT INTO portal.quotes (
         id, quote_number, unit_id, customer_id, opportunity_id, price_list_id, status,
         subtotal_cents, personalization_total_cents, additional_services_cents, shipping_cents, discount_cents, total_cents,
         known_cost_cents, estimated_contribution_cents, margin_on_sale_pct, markup_pct, estimation_status,
         payment_terms, valid_until, estimated_delivery_days, share_token, share_enabled, sent_at, is_sandbox, created_by
       ) VALUES
         ($1,'ORC-0001',$2,$3,$4,$5,'converted',346150,21000,0,8500,0,375650,192150,175000,47.66,91.07,'complete','50% entrada PIX + 50% antes da expedição',CURRENT_DATE + 10,20,'ks-demo-share-0001',TRUE,NOW() - INTERVAL '4 days',FALSE,$6),
         ($7,'ORC-0002',$2,$8,$9,$5,'sent',299400,0,0,7000,0,306400,173400,126000,42.08,72.66,'complete','50% no pedido + saldo na entrega',CURRENT_DATE + 5,18,'ks-demo-share-0002',TRUE,NOW() - INTERVAL '2 days',FALSE,$6),
         ($10,'ORC-0003',$2,$11,NULL,$5,'draft',339800,0,0,6000,0,345800,NULL,NULL,NULL,NULL,'incomplete','Sob consulta de custo bordado Oxford',CURRENT_DATE + 7,25,'ks-demo-share-0003',TRUE,NULL,FALSE,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        IDS.quotes.mackenzie, IDS.units.sp, IDS.customers.mackenzie, IDS.opps.mackenzie, IDS.priceLists.v2026, vendedorSpId,
        IDS.quotes.copaMoocaSent, IDS.customers.copaMooca, IDS.opps.copaMooca,
        IDS.quotes.incompleteCost, IDS.customers.colegioVitoria,
      ]
    );

    await client.query(
      `INSERT INTO portal.quote_items (quote_id, unit_id, product_id, product_sku, product_name, quantity, unit_sale_price_cents, unit_supply_cost_cents, personalization_summary, personalization_cents, line_total_cents)
       SELECT $1,$2,$3,'KS-CAM-AUTH','Authentic',35,9890,5490,'Nome + número costas',600,367150
       WHERE NOT EXISTS (SELECT 1 FROM portal.quote_items WHERE quote_id = $1)`,
      [IDS.quotes.mackenzie, IDS.units.sp, authId]
    );
    await client.query(
      `INSERT INTO portal.quote_items (quote_id, unit_id, product_id, product_sku, product_name, quantity, unit_sale_price_cents, unit_supply_cost_cents, personalization_summary, personalization_cents, line_total_cents)
       SELECT $1,$2,$3,'KS-CAM-SWIFT','Swift',60,4990,2890,'Sublimação total numeração corrida',0,299400
       WHERE NOT EXISTS (SELECT 1 FROM portal.quote_items WHERE quote_id = $1)`,
      [IDS.quotes.copaMoocaSent, IDS.units.sp, swiftId]
    );
    await client.query(
      `INSERT INTO portal.quote_items (quote_id, unit_id, product_id, product_sku, product_name, quantity, unit_sale_price_cents, unit_supply_cost_cents, personalization_summary, personalization_cents, line_total_cents)
       SELECT $1,$2,$3,'KS-AG-OXFORD','Oxford',20,16990,NULL,'Jaqueta com nome frontal bordado sob consulta',0,339800
       WHERE NOT EXISTS (SELECT 1 FROM portal.quote_items WHERE quote_id = $1)`,
      [IDS.quotes.incompleteCost, IDS.units.sp, oxfordId]
    );

    // 10. Studio de Artes: Projetos, Versões Imutáveis & Aprovações (incluindo cenário com v2 que invalida v1!)
    await client.query(
      `INSERT INTO portal.art_projects (id, unit_id, customer_id, opportunity_id, title, briefing, status, assignee_user_id, is_sandbox, created_by)
       VALUES
         ($1,$2,$3,$4,'Manto Oficial Direito Mackenzie 2026','Camisa Authentic bordô e azul marinho com escudo TPU 3D no peito.','aprovado',$5,FALSE,$5),
         ($6,$2,$7,$8,'Uniforme Várzea E.C. Vila Madalena','Camisa Fusion verde e branca com patrocinador master nas costas.','aprovado',$5,FALSE,$5),
         ($9,$2,$10,$11,'Uniforme Staff Pulse Fit 2026','Camisa Evolution chumbo e azul neon com logo central.','aprovado',$5,FALSE,$5),
         ($12,$2,$13,NULL,'Kit Interclasse Santa Vitória (Revisão v2)','Solicitado aumento de escudo e troca da fonte dos números após v1 aprovada.','ajustes',$5,FALSE,$5),
         ($14,$2,$15,$16,'Arte Simulada Banca (Sandbox)','Arte de treino isolada em Sandbox para banca.','em_criacao',$5,TRUE,$5)
       ON CONFLICT (id) DO NOTHING`,
      [
        IDS.arts.mackenzie, IDS.units.sp, IDS.customers.mackenzie, IDS.opps.mackenzie, designerSpId,
        IDS.arts.vilaMadalena, IDS.customers.vilaMadalena, IDS.opps.vilaMadalena,
        IDS.arts.pulseFit, IDS.customers.pulseFit, IDS.opps.pulseFit,
        IDS.arts.revisaoSuperseded, IDS.customers.colegioVitoria,
        IDS.arts.sbxArt, IDS.customers.sbxAtletica, IDS.opps.sbxOpp,
      ]
    );

    await client.query(
      `INSERT INTO portal.art_versions (id, art_project_id, unit_id, version_number, artifact_kind, file_name, mime_type, preview_summary, notes, created_by)
       VALUES
         ($1,$2,$3,1,'arquivo_producao_rip','mackenzie_authentic_v1_rip.pdf','application/pdf','Arte final fechada frente/costas + máscara TPU','Pronta para sublimação SP.',$4),
         ($5,$6,$3,1,'arte_revisao','vila_madalena_v1_revisao.png','image/png','Layout aprovado pelo capitão do time','Aguarda grade de numeração para produzir.',$4),
         ($7,$8,$3,1,'arquivo_producao_rip','pulse_fit_v1_rip.pdf','application/pdf','Arte final staff aprovada','OK técnico PCP.',$4),
         ($9,$10,$3,1,'mockup_ilustrativo','santa_vitoria_v1_mockup.png','image/png','Primeira proposta ilustrativa enviada','Substituída por pedido de alteração.',$4),
         ($11,$10,$3,2,'arte_revisao','santa_vitoria_v2_revisao.png','image/png','Nova versão v2 com escudo ampliado — aguardando novo aceite formal','Invalida aprovação da v1.',$4)
       ON CONFLICT (id) DO NOTHING`,
      [
        IDS.artVersions.mackV1, IDS.arts.mackenzie, IDS.units.sp, designerSpId,
        IDS.artVersions.vilaV1, IDS.arts.vilaMadalena,
        IDS.artVersions.pulseV1, IDS.arts.pulseFit,
        IDS.artVersions.revV1, IDS.arts.revisaoSuperseded,
        IDS.artVersions.revV2,
      ]
    );

    await client.query(`UPDATE portal.art_projects SET current_version_id = $1, approved_version_id = $1 WHERE id = $2`, [IDS.artVersions.mackV1, IDS.arts.mackenzie]);
    await client.query(`UPDATE portal.art_projects SET current_version_id = $1, approved_version_id = $1 WHERE id = $2`, [IDS.artVersions.vilaV1, IDS.arts.vilaMadalena]);
    await client.query(`UPDATE portal.art_projects SET current_version_id = $1, approved_version_id = $1 WHERE id = $2`, [IDS.artVersions.pulseV1, IDS.arts.pulseFit]);
    await client.query(`UPDATE portal.art_projects SET current_version_id = $1, approved_version_id = NULL, status = 'ajustes' WHERE id = $2`, [IDS.artVersions.revV2, IDS.arts.revisaoSuperseded]);

    // Aprovações vinculadas especificamente à versão (com v1 de Santa Vitória superseded!)
    await client.query(
      `INSERT INTO portal.approvals (unit_id, entity_type, entity_id, art_project_id, art_version_id, approved_by_name, approved_by_contact, identification_method, acceptance_evidence, status, superseded_by_version_id, superseded_at, recorded_by_user_id)
       SELECT $1,'art_version',$2,$3,$2,'Pedro Barreto','(11) 98765-4321','Aceite no Portal + confirmação WhatsApp','OK formal da diretoria na versão v1','active',NULL,NULL,$4
       WHERE NOT EXISTS (SELECT 1 FROM portal.approvals WHERE art_version_id = $2)`,
      [IDS.units.sp, IDS.artVersions.mackV1, IDS.arts.mackenzie, gestorSpId]
    );
    await client.query(
      `INSERT INTO portal.approvals (unit_id, entity_type, entity_id, art_project_id, art_version_id, approved_by_name, approved_by_contact, identification_method, acceptance_evidence, status, recorded_by_user_id)
       SELECT $1,'art_version',$2,$3,$2,'Rodrigo Tavares','(11) 97654-3210','Aceite eletrônico no link da proposta','Aprovação da v1 para início da coleta de tamanhos','active',$4
       WHERE NOT EXISTS (SELECT 1 FROM portal.approvals WHERE art_version_id = $2)`,
      [IDS.units.sp, IDS.artVersions.vilaV1, IDS.arts.vilaMadalena, gestorSpId]
    );
    await client.query(
      `INSERT INTO portal.approvals (unit_id, entity_type, entity_id, art_project_id, art_version_id, approved_by_name, approved_by_contact, identification_method, acceptance_evidence, status, recorded_by_user_id)
       SELECT $1,'art_version',$2,$3,$2,'Juliana Mendes','(11) 96543-2109','Aceite por e-mail corporativo','De acordo na v1 final','active',$4
       WHERE NOT EXISTS (SELECT 1 FROM portal.approvals WHERE art_version_id = $2)`,
      [IDS.units.sp, IDS.artVersions.pulseV1, IDS.arts.pulseFit, gestorSpId]
    );
    await client.query(
      `INSERT INTO portal.approvals (unit_id, entity_type, entity_id, art_project_id, art_version_id, approved_by_name, identification_method, acceptance_evidence, status, superseded_by_version_id, superseded_at, recorded_by_user_id)
       SELECT $1,'art_version',$2,$3,$2,'Prof. Marcelo Dias','Aceite anterior em mockup v1','Aprovação invalidada após envio da revisão v2','superseded',$4,NOW(),$5
       WHERE NOT EXISTS (SELECT 1 FROM portal.approvals WHERE art_version_id = $2)`,
      [IDS.units.sp, IDS.artVersions.revV1, IDS.arts.revisaoSuperseded, IDS.artVersions.revV2, gestorSpId]
    );

    // 11. Pedidos abrangendo todos os cenários da Seção 18!
    const fusionId = productIdsBySlug.get('fusion')!;
    const evolId = productIdsBySlug.get('evolution')!;

    await client.query(
      `INSERT INTO portal.orders (
         id, order_number, unit_id, customer_id, opportunity_id, quote_id,
         art_project_id, approved_art_version_id,
         commercial_status, financial_status, approval_status, production_status, logistics_status,
         grade_approved, grade_approved_by, grade_approved_at,
         factory_accepted, factory_capacity_ok, factory_accepted_by, factory_accepted_at,
         production_released, production_released_at, release_block_reasons,
         commercial_snapshot, subtotal_cents, shipping_cents, discount_cents, total_cents,
         delivery_address, shipping_method, event_date, estimated_delivery_date, sla_started_at,
         canceled_reason, canceled_at, is_sandbox, created_by
       ) VALUES
         -- Cenário 1: Pedido em produção (Sublimação) com tudo aprovado e pago
         ($1,'KS-1041',$2,$3,$4,$5,$6,$7,'confirmed','settled','all_approved','sublimation','pending',TRUE,'Pedro Barreto',NOW()-INTERVAL '3 days',TRUE,TRUE,$8,NOW()-INTERVAL '3 days',TRUE,NOW()-INTERVAL '3 days','[]'::jsonb,'{"financial_cleared_postpaid":false}'::jsonb,346150,8500,0,354650,'{"city":"São Paulo","state":"SP","street":"Rua Maria Antônia, 403"}'::jsonb,'Motoboy / Transportadora SP',CURRENT_DATE+25,CURRENT_DATE+14,NOW()-INTERVAL '3 days',NULL,NULL,FALSE,$9),
         -- Cenário 2: Pedido BLOQUEADO (arte aprovada, SEM grade aprovada e SEM entrada financeira, evento em 12 dias!)
         ($10,'KS-1042',$2,$11,$12,NULL,$13,$14,'confirmed','pending','art_approved','blocked','pending',FALSE,NULL,NULL,FALSE,FALSE,NULL,NULL,FALSE,NULL,'["Grade de tamanhos ainda não foi aprovada pelo cliente/unidade.","Entrada financeira não confirmada para envio à produção."]'::jsonb,'{"financial_cleared_postpaid":false}'::jsonb,180000,5000,0,185000,'{"city":"São Paulo","state":"SP","street":"Rua Harmonia, 120"}'::jsonb,'Retira / Transportadora SP',CURRENT_DATE+12,CURRENT_DATE+28,NULL,NULL,NULL,FALSE,$9),
         -- Cenário 4: Pedido pronto aguardando apenas aceite fabril PCP
         ($15,'KS-1043',$2,$16,$17,NULL,$18,$19,'confirmed','settled','all_approved','not_released','pending',TRUE,'Juliana Mendes',NOW()-INTERVAL '1 day',FALSE,FALSE,NULL,NULL,FALSE,NULL,'["Aguardando aceite fabril do PCP São Paulo e confirmação de capacidade."]'::jsonb,'{"financial_cleared_postpaid":false}'::jsonb,219600,6000,0,225600,'{"city":"São Paulo","state":"SP","street":"Av. Giovanni Gronchi, 5200"}'::jsonb,'Transportadora SP',CURRENT_DATE+21,CURRENT_DATE+16,NULL,NULL,NULL,FALSE,$9),
         -- Cenário 5a: Pedido despachado em trânsito
         ($20,'KS-1038',$2,$21,NULL,NULL,$6,$7,'confirmed','partial','all_approved','finished','dispatched',TRUE,'Prof. Marcelo Dias',NOW()-INTERVAL '15 days',TRUE,TRUE,$8,NOW()-INTERVAL '14 days',TRUE,NOW()-INTERVAL '14 days','[]'::jsonb,'{"financial_cleared_postpaid":false}'::jsonb,249500,7500,0,257000,'{"city":"São Caetano do Sul","state":"SP","street":"Av. Goiás, 1400"}'::jsonb,'Jadlog Express',CURRENT_DATE+3,CURRENT_DATE+1,NOW()-INTERVAL '14 days',NULL,NULL,FALSE,$9),
         -- Cenário 5b: Pedido entregue com recebedor
         ($22,'KS-1035',$2,$3,NULL,NULL,$6,$7,'confirmed','settled','all_approved','finished','delivered',TRUE,'Pedro Barreto',NOW()-INTERVAL '28 days',TRUE,TRUE,$8,NOW()-INTERVAL '27 days',TRUE,NOW()-INTERVAL '27 days','[]'::jsonb,'{"financial_cleared_postpaid":false}'::jsonb,197800,6500,0,204300,'{"city":"São Paulo","state":"SP","street":"Rua Maria Antônia, 403"}'::jsonb,'Transportadora SP',CURRENT_DATE-4,CURRENT_DATE-6,NOW()-INTERVAL '27 days',NULL,NULL,FALSE,$9),
         -- Cenário 7: Pedido cancelado preservando histórico e excluído de vendas ativas
         ($23,'KS-1039',$2,$24,NULL,NULL,NULL,NULL,'canceled','refunded','pending','not_released','pending',FALSE,NULL,NULL,FALSE,FALSE,NULL,NULL,FALSE,NULL,'[]'::jsonb,'{}'::jsonb,149700,0,0,149700,'{"city":"São Paulo","state":"SP","street":"Rua da Mooca, 800"}'::jsonb,'Transportadora SP',NULL,NULL,NULL,'Torneio adiado pela organização do evento',NOW()-INTERVAL '6 days',FALSE,$9),
         -- Unidade Campinas isolada (para teste cross-unit!)
         ($25,'KS-CPS-101',$26,$27,$28,NULL,NULL,NULL,'confirmed','partial','pending','not_released','pending',FALSE,NULL,NULL,FALSE,FALSE,NULL,NULL,FALSE,NULL,'[]'::jsonb,'{}'::jsonb,164700,5000,0,169700,'{"city":"Campinas","state":"SP","street":"Av. Taquaral, 300"}'::jsonb,'Correios Sedex',CURRENT_DATE+30,CURRENT_DATE+22,NULL,NULL,NULL,FALSE,$29),
         -- Cenário 10: Pedido Sandbox isolado
         ($30,'SBX-KS-9001',$2,$31,$32,NULL,$33,NULL,'confirmed','pending','pending','not_released','pending',FALSE,NULL,NULL,FALSE,FALSE,NULL,NULL,FALSE,NULL,'[]'::jsonb,'{}'::jsonb,247250,0,0,247250,'{"city":"São Paulo","state":"SP","street":"Sandbox"}'::jsonb,'Simulado',CURRENT_DATE+35,CURRENT_DATE+25,NULL,NULL,NULL,TRUE,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        IDS.orders.ks1041Prod, IDS.units.sp, IDS.customers.mackenzie, IDS.opps.mackenzie, IDS.quotes.mackenzie, IDS.arts.mackenzie, IDS.artVersions.mackV1, fabricaId, gestorSpId,
        IDS.orders.ks1042Blocked, IDS.customers.vilaMadalena, IDS.opps.vilaMadalena, IDS.arts.vilaMadalena, IDS.artVersions.vilaV1,
        IDS.orders.ks1043WaitFactory, IDS.customers.pulseFit, IDS.opps.pulseFit, IDS.arts.pulseFit, IDS.artVersions.pulseV1,
        IDS.orders.ks1038Dispatched, IDS.customers.colegioVitoria,
        IDS.orders.ks1035Delivered,
        IDS.orders.ks1039Canceled, IDS.customers.copaMooca,
        IDS.orders.cpsOrder, IDS.units.cps, IDS.customers.cpsGuaraniYouth, IDS.opps.cpsOpp, gestorCpsId,
        IDS.orders.sbxOrder, IDS.customers.sbxAtletica, IDS.opps.sbxOpp, IDS.arts.sbxArt,
      ]
    );

    const orderItemsSeeds = [
      { ord: IDS.orders.ks1041Prod, unit: IDS.units.sp, pid: authId, sku: 'KS-CAM-AUTH', name: 'Authentic', qty: 35, price: 9890, cost: 5490 },
      { ord: IDS.orders.ks1042Blocked, unit: IDS.units.sp, pid: fusionId, sku: 'KS-CAM-FUSION', name: 'Fusion', qty: 30, price: 6000, cost: 3290 },
      { ord: IDS.orders.ks1043WaitFactory, unit: IDS.units.sp, pid: evolId, sku: 'KS-CAM-EVOL', name: 'Evolution', qty: 40, price: 5490, cost: 3290 },
      { ord: IDS.orders.ks1038Dispatched, unit: IDS.units.sp, pid: swiftId, sku: 'KS-CAM-SWIFT', name: 'Swift', qty: 50, price: 4990, cost: 2890 },
      { ord: IDS.orders.ks1035Delivered, unit: IDS.units.sp, pid: authId, sku: 'KS-CAM-AUTH', name: 'Authentic', qty: 20, price: 9890, cost: 5490 },
      { ord: IDS.orders.ks1039Canceled, unit: IDS.units.sp, pid: swiftId, sku: 'KS-CAM-SWIFT', name: 'Swift', qty: 30, price: 4990, cost: 2890 },
      { ord: IDS.orders.cpsOrder, unit: IDS.units.cps, pid: fusionId, sku: 'KS-CAM-FUSION', name: 'Fusion', qty: 30, price: 5490, cost: 3290 },
      { ord: IDS.orders.sbxOrder, unit: IDS.units.sp, pid: authId, sku: 'KS-CAM-AUTH', name: 'Authentic', qty: 25, price: 9890, cost: 5490 },
    ];
    for (const oi of orderItemsSeeds) {
      await client.query(
        `INSERT INTO portal.order_items (order_id, unit_id, product_id, product_sku, product_name, size_breakdown, quantity, unit_price_cents, unit_cost_cents, line_total_cents)
         SELECT $1,$2,$3,$4,$5,'{"P":6,"M":12,"G":12,"GG":5}'::jsonb,$6,$7,$8,$9
         WHERE NOT EXISTS (SELECT 1 FROM portal.order_items WHERE order_id = $1)`,
        [oi.ord, oi.unit, oi.pid, oi.sku, oi.name, oi.qty, oi.price, oi.cost, oi.qty * oi.price]
      );
    }

    await client.query(
      `INSERT INTO portal.order_personalizations (order_id, unit_id, size_code, player_name, player_number, shield_or_sponsor_notes, quantity)
       SELECT $1,$2,'G','BARRETO','10','Escudo TPU 3D peito esquerdo',1
       WHERE NOT EXISTS (SELECT 1 FROM portal.order_personalizations WHERE order_id = $1)`,
      [IDS.orders.ks1041Prod, IDS.units.sp]
    );
    await client.query(
      `INSERT INTO portal.production_events (order_id, unit_id, stage_code, status_label, notes, recorded_by)
       SELECT $1,$2,'sublimation','Impressão & Sublimação','Arte v1 enviada ao plotter Epson F9470 SP.',$3
       WHERE NOT EXISTS (SELECT 1 FROM portal.production_events WHERE order_id = $1)`,
      [IDS.orders.ks1041Prod, IDS.units.sp, fabricaId]
    );
    await client.query(
      `INSERT INTO portal.shipments (order_id, unit_id, carrier_name, tracking_code, shipping_cost_cents, status, dispatched_at, estimated_delivery_date)
       SELECT $1,$2,'Jadlog Express','JD987654321BR',7500,'dispatched',NOW()-INTERVAL '2 days',CURRENT_DATE+1
       WHERE NOT EXISTS (SELECT 1 FROM portal.shipments WHERE order_id = $1)`,
      [IDS.orders.ks1038Dispatched, IDS.units.sp]
    );
    await client.query(
      `INSERT INTO portal.shipments (order_id, unit_id, carrier_name, tracking_code, shipping_cost_cents, status, dispatched_at, delivered_at, receiver_name, delivery_notes)
       SELECT $1,$2,'Transportadora KS SP','KS1035DELIV',6500,'delivered',NOW()-INTERVAL '8 days',NOW()-INTERVAL '6 days','Pedro Barreto (Atlética)','Recebido sem ressalvas, caixas conferidas.'
       WHERE NOT EXISTS (SELECT 1 FROM portal.shipments WHERE order_id = $1)`,
      [IDS.orders.ks1035Delivered, IDS.units.sp]
    );

    // 12. Recebíveis & Transações (pago, vencido com parcial, aguardando validação, estornado, pendente entrada)
    await client.query(
      `INSERT INTO portal.receivables (id, unit_id, order_id, customer_id, installment_number, total_installments, description, due_date, amount_cents, paid_cents, status, is_sandbox, created_by)
       VALUES
         ($1,$2,$3,$4,1,1,'Pedido KS-1041 — Integral Quitado',CURRENT_DATE - 2,354650,354650,'paid',FALSE,$5),
         ($6,$2,$7,$8,1,2,'Pedido KS-1038 — 2ª Parcela Vencida',CURRENT_DATE - 4,180000,80000,'overdue',FALSE,$5),
         ($9,$2,$10,$11,1,1,'Pedido KS-1043 — Quitação Integral',CURRENT_DATE - 1,225600,225600,'paid',FALSE,$5),
         ($12,$2,$13,$4,1,1,'Pedido KS-1035 — Quitação + Teste Estorno',CURRENT_DATE - 20,204300,204300,'paid',FALSE,$5),
         ($14,$2,$15,$16,1,1,'Pedido KS-1042 — Aguardando Entrada 50%',CURRENT_DATE + 1,185000,0,'pending',FALSE,$5)
       ON CONFLICT (id) DO NOTHING`,
      [
        IDS.receivables.r1Paid, IDS.units.sp, IDS.orders.ks1041Prod, IDS.customers.mackenzie, gestorSpId,
        IDS.receivables.r2OverduePartial, IDS.orders.ks1038Dispatched, IDS.customers.colegioVitoria,
        IDS.receivables.r3PendingValidation, IDS.orders.ks1043WaitFactory, IDS.customers.pulseFit,
        IDS.receivables.r4Reversed, IDS.orders.ks1035Delivered,
        IDS.receivables.r5WaitEntry, IDS.orders.ks1042Blocked, IDS.customers.vilaMadalena,
      ]
    );

    await client.query(
      `INSERT INTO portal.payment_transactions (unit_id, receivable_id, order_id, idempotency_key, transaction_type, amount_cents, payment_method, confirmation_status, gateway_provider, external_reference, notes, recorded_by, validated_by, validated_at)
       VALUES
         ($1,$2,$3,'seed-pay-ks1041','payment',354650,'pix','confirmed','manual','PIX-E2E-1041','PIX confirmado em extrato',$4,$4,NOW()-INTERVAL '3 days'),
         ($1,$5,$6,'seed-pay-ks1038-part1','payment',80000,'pix','confirmed','manual','PIX-1038-A','Sinal parcial confirmado',$4,$4,NOW()-INTERVAL '10 days'),
         ($1,$5,$6,'seed-pay-ks1038-pending','payment',100000,'transferencia','pending_validation','manual','TED-1038-B','Comprovante enviado, aguardando validação do financeiro',$4,NULL,NULL),
         ($1,$7,$8,'seed-pay-ks1043','payment',225600,'pix','confirmed','manual','PIX-1043','Quitação integral confirmada',$4,$4,NOW()-INTERVAL '1 day'),
         ($1,$9,$10,'seed-pay-ks1035-main','payment',204300,'pix','confirmed','manual','PIX-1035','Pagamento final confirmado',$4,$4,NOW()-INTERVAL '25 days')
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        IDS.units.sp,
        IDS.receivables.r1Paid, IDS.orders.ks1041Prod, gestorSpId,
        IDS.receivables.r2OverduePartial, IDS.orders.ks1038Dispatched,
        IDS.receivables.r3PendingValidation, IDS.orders.ks1043WaitFactory,
        IDS.receivables.r4Reversed, IDS.orders.ks1035Delivered,
      ]
    );

    // 13. Despesas (pagamento à fábrica + operacional)
    await client.query(
      `INSERT INTO portal.expenses (unit_id, order_id, expense_category, description, vendor_name, due_date, amount_cents, paid_cents, status, config_basis, created_by)
       SELECT $1,$2,'pagamento_fabrica','Custo industrial lote KS-1041 (35x Authentic)','Fábrica King Sports SP',CURRENT_DATE + 5,192150,0,'pending','manual',$3
       WHERE NOT EXISTS (SELECT 1 FROM portal.expenses WHERE order_id = $2)`,
      [IDS.units.sp, IDS.orders.ks1041Prod, gestorSpId]
    );

    // 14. SAC / Chamados com nota interna oculta da unidade!
    await client.query(
      `INSERT INTO portal.support_tickets (id, ticket_number, unit_id, order_id, customer_id, category, priority, status, subject, description, assignee_user_id, sla_due_at, rework_cost_cents, is_sandbox, created_by)
       VALUES
         ($1,'SAC-101',$2,$3,$4,'Produção','high','waiting_unit','Conferência tom do escudo TPU — KS-1041','Solicitação de validação final de Pantone para acabamento do escudo TPU.',$5,NOW()+INTERVAL '8 hours',0,FALSE,$6),
         ($7,'SAC-102',$2,$8,$9,'Entrega','normal','in_progress','Previsão de entrega Jadlog — KS-1038','Cliente perguntou janela de entrega no período da tarde.',$5,NOW()+INTERVAL '24 hours',4500,FALSE,$6),
         ($10,'SAC-CPS-1',$11,$12,NULL,'Sistema','normal','open','Dúvida tabela Campinas','Verificação de configuração de frete regional.',$5,NOW()+INTERVAL '24 hours',0,FALSE,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        IDS.tickets.spOpen, IDS.units.sp, IDS.orders.ks1041Prod, IDS.customers.mackenzie, suporteId, gestorSpId,
        IDS.tickets.spWaitingUnit, IDS.orders.ks1038Dispatched, IDS.customers.colegioVitoria,
        IDS.tickets.cpsTicket, IDS.units.cps, IDS.orders.cpsOrder, gestorCpsId,
      ]
    );

    await client.query(
      `INSERT INTO portal.support_messages (ticket_id, unit_id, sender_user_id, sender_name, sender_role, is_internal, body)
       SELECT $1,$2,$3,'Fernanda Martins SAC','Suporte da Franqueadora',FALSE,'Olá Lucas! Precisamos apenas que confirme se o bordô do escudo segue Pantone 202C.'
       WHERE NOT EXISTS (SELECT 1 FROM portal.support_messages WHERE ticket_id = $1 AND is_internal = FALSE)`,
      [IDS.tickets.spOpen, IDS.units.sp, suporteId]
    );
    await client.query(
      `INSERT INTO portal.support_messages (ticket_id, unit_id, sender_user_id, sender_name, sender_role, is_internal, body)
       SELECT $1,$2,$3,'Carlos Alberto PCP','Produção da Fábrica (PCP SP)',TRUE,'[NOTA INTERNA FÁBRICA/SAC] Lote de TPU Pantone 202C já separado na bancada B2 aguardando OK.'
       WHERE NOT EXISTS (SELECT 1 FROM portal.support_messages WHERE ticket_id = $1 AND is_internal = TRUE)`,
      [IDS.tickets.spOpen, IDS.units.sp, fabricaId]
    );

    // 15. Documentos no Cofre Jurídico (modelos globais + obrigatórios BH pendentes + assinados SP)
    await client.query(
      `INSERT INTO portal.documents (unit_id, doc_category, requirement_level, title, description, current_classification, status, owner_user_id)
       SELECT NULL,'manual','reference','Manual Operacional do Hub & Regras de Produção SP','Guia oficial de fluxo comercial, Studio 3D e envio fabril.','modelo','approved',$1
       WHERE NOT EXISTS (SELECT 1 FROM portal.documents WHERE unit_id IS NULL AND title LIKE 'Manual Operacional do Hub%')`,
      [adminId]
    );
    await client.query(
      `INSERT INTO portal.documents (unit_id, doc_category, requirement_level, title, description, current_classification, status, owner_user_id)
       SELECT $1,'franquia','mandatory_onboarding','COF & Contrato de Franquia Unidade Paulista','Instrumento contratual assinado da unidade ativa.','assinado','signed',$2
       WHERE NOT EXISTS (SELECT 1 FROM portal.documents WHERE unit_id = $1 AND title LIKE 'COF & Contrato%')`,
      [IDS.units.sp, gestorSpId]
    );
    await client.query(
      `INSERT INTO portal.documents (unit_id, doc_category, requirement_level, title, description, current_classification, status, owner_user_id)
       SELECT $1,'franquia','mandatory_onboarding','Contrato de Franquia & Ficha Cadastral BH','Minuta em conferência obrigatória para liberação operacional da unidade BH.','minuta','pending',$2
       WHERE NOT EXISTS (SELECT 1 FROM portal.documents WHERE unit_id = $1 AND title LIKE 'Contrato de Franquia & Ficha%')`,
      [IDS.units.bh, gestorBhId]
    );

    // 16. Tarefas de Agenda & Banca Submetida & Comunicados
    await client.query(
      `INSERT INTO portal.tasks (unit_id, task_type, title, description, customer_id, order_id, assigned_to, created_by, due_at, status, priority, is_sandbox)
       SELECT $1,'aprovacao_esperada','Cobrar aprovação da grade nominal — E.C. Vila Madalena (KS-1042)','Evento ocorre em 12 dias; sem grade aprovada o PCP não inicia.',$2,$3,$4,$4,NOW()+INTERVAL '4 hours','pending','urgent',FALSE
       WHERE NOT EXISTS (SELECT 1 FROM portal.tasks WHERE unit_id = $1 AND title LIKE '%KS-1042%')`,
      [IDS.units.sp, IDS.customers.vilaMadalena, IDS.orders.ks1042Blocked, gestorSpId]
    );
    await client.query(
      `INSERT INTO portal.tasks (unit_id, task_type, title, description, customer_id, assigned_to, created_by, due_at, status, priority, is_sandbox)
       SELECT $1,'follow_up','Follow-up proposta ORC-0002 — Liga Copa Mooca','Proposta enviada há 2 dias para 60 camisas Swift.',$2,$3,$3,NOW()+INTERVAL '1 day','pending','high',FALSE
       WHERE NOT EXISTS (SELECT 1 FROM portal.tasks WHERE unit_id = $1 AND title LIKE '%ORC-0002%')`,
      [IDS.units.sp, IDS.customers.copaMooca, vendedorSpId]
    );

    await client.query(
      `INSERT INTO portal.banca_evaluations (unit_id, user_id, case_title, exercise_checks, submission_notes, status)
       SELECT $1,$2,'Simulação Prática Atlética Engenharia (Banca BH)','{"diagnostico_bant":true,"orcamento_sem_invencao":true,"arte_versionada":true,"gatekeeper_pcp":true}'::jsonb,'Submissão prática realizada no Sandbox aguardando avaliação da franqueadora.','submitted'
       WHERE NOT EXISTS (SELECT 1 FROM portal.banca_evaluations WHERE unit_id = $1 AND status = 'submitted')`,
      [IDS.units.bh, gestorBhId]
    );

    await client.query(
      `INSERT INTO portal.announcements (title, body, category, is_pinned, created_by)
       SELECT 'Regra Oficial P03 — SKUs Regata e Bermuda Lakers em revisão jurídica','Os modelos Regata Lakers e Bermuda Lakers permanecem visíveis apenas para consulta com bloqueio de venda até parecer final de marca registrada.','compliance',TRUE,$1
       WHERE NOT EXISTS (SELECT 1 FROM portal.announcements WHERE title LIKE '%P03%')`,
      [adminId]
    );
    await client.query(
      `INSERT INTO portal.announcements (title, body, category, is_pinned, created_by)
       SELECT 'Janela PCP São Paulo — Envio de pedidos completos até 17h','Pedidos com arte v-aprovada, grade validada e condição financeira confirmada até 17h entram na programação industrial do dia seguinte.','operacional',FALSE,$1
       WHERE NOT EXISTS (SELECT 1 FROM portal.announcements WHERE title LIKE '%Janela PCP%')`,
      [adminId]
    );

    // 17. Eventos da Agenda estilo Google Calendar (2 Entregas + 2 Reuniões na semana atual para Unidade SP)
    await client.query(
      `INSERT INTO portal.schedule_events (
         id, unit_id, event_type, title, description, start_at, end_at, all_day,
         location, meeting_url, customer_id, order_id, assigned_to, created_by,
         status, color_tag, is_sandbox
       ) VALUES
         (
           $1, $5, 'entrega',
           'Entrega Lote 35 Camisas Authentic — Direito Mackenzie',
           'Entrega programada do pedido KS-1041 com conferência de escudos TPU 3D na recepção.',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '1 day 14 hours',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '1 day 15 hours 30 minutes',
           FALSE,
           'Rua Maria Antônia, 403 — Consolação, São Paulo/SP',
           NULL,
           $6, $10, $13, $13,
           'confirmed', 'emerald', FALSE
         ),
         (
           $2, $5, 'entrega',
           'Janela de Entrega Jadlog — Colégio Santa Vitória (KS-1038)',
           'Acompanhar recebimento da remessa JD987654321BR com Prof. Marcelo Dias.',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '2 days 10 hours',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '2 days 12 hours',
           FALSE,
           'Av. Goiás, 1400 — São Caetano do Sul/SP',
           NULL,
           $7, $11, $14, $13,
           'scheduled', 'cyan', FALSE
         ),
         (
           $3, $5, 'reuniao',
           'Reunião de Fechamento ORC-0002 — Liga Copa Mooca',
           'Apresentação de condições comerciais e definição da grade de 60 camisas Swift.',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '10 hours',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '11 hours',
           FALSE,
           'Google Meet (Videoconferência)',
           'https://meet.google.com/ks-copa-mooca',
           $8, NULL, $14, $14,
           'confirmed', 'blue', FALSE
         ),
         (
           $4, $5, 'reuniao',
           'Alinhamento de Grade & Escudo TPU — Academia Pulse Fit',
           'Validação final pré-envio ao PCP São Paulo para o lote KS-1043.',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '3 days 15 hours',
           date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '3 days 16 hours',
           FALSE,
           'Av. Giovanni Gronchi, 5200 — Morumbi, São Paulo/SP',
           NULL,
           $9, $12, $15, $13,
           'scheduled', 'amber', FALSE
         )
       ON CONFLICT (id) DO UPDATE SET
         event_type = EXCLUDED.event_type,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         start_at = EXCLUDED.start_at,
         end_at = EXCLUDED.end_at,
         location = EXCLUDED.location,
         meeting_url = EXCLUDED.meeting_url,
         customer_id = EXCLUDED.customer_id,
         order_id = EXCLUDED.order_id,
         assigned_to = EXCLUDED.assigned_to,
         status = EXCLUDED.status,
         color_tag = EXCLUDED.color_tag,
         updated_at = NOW()`,
      [
        IDS.scheduleEvents.entregaMackenzie,
        IDS.scheduleEvents.entregaSantaVitoria,
        IDS.scheduleEvents.reuniaoCopaMooca,
        IDS.scheduleEvents.reuniaoPulseFit,
        IDS.units.sp,
        IDS.customers.mackenzie,
        IDS.customers.colegioVitoria,
        IDS.customers.copaMooca,
        IDS.customers.pulseFit,
        IDS.orders.ks1041Prod,
        IDS.orders.ks1038Dispatched,
        IDS.orders.ks1043WaitFactory,
        gestorSpId,
        vendedorSpId,
        designerSpId,
      ]
    );
  });

  console.log('✔ Seed completo executado com sucesso (100% idempotente).');
}

runSeed()
  .catch((err) => {
    console.error('✖ Erro no seed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbPool.end();
  });
