'use client';

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ApparelModel,
  Pattern,
  MockupElement,
  MockupView,
  LayerState,
} from '@mockup/types';
import { Header } from '@/components/Header';
import styles from './workspace.module.css';
import { TeamSetupDialog, type TeamSetup } from './TeamSetupDialog';
import { MockupCanvas } from '@/features/canvas/MockupCanvas';
import { StandardColorGrid } from '@/components/StandardColorGrid';
import { DecalManager } from '@/components/DecalManager';
import { ExportModal } from '@/components/ExportModal';
import { useMockupStore, GarmentPart } from '@/features/studio/store/mockupStore';
import { useHistoryStore } from '@/features/studio/store/historyStore';
import { useSessionStore } from '@/features/studio/store/sessionStore';
import { getCustomUniformPatterns } from '@/lib/texture-manager';
import { formatBrl, hubAsset, portalFetch, PortalApiError, useUnifiedHubPrefix } from '@/lib/api-client';
import type { PortalMeResponse } from '@/components/portal/PortalTypes';
import { LoadingCard, StatusPill } from '@/components/portal/UiPrimitives';
import {
  Shirt,
  Sparkles,
  Layers,
  MousePointer2,
  Palette,
  Tags,
} from 'lucide-react';

const DEFAULT_SVG_PATTERNS: Pattern[] = [
  {
    id: 'pat_thunder',
    title: 'Thunder',
    category: 'Esportivo',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <polygon points="0,0 400,0 200,800 0,800" fill="#ffffff" fill-opacity="0.9"/>
      <polygon points="450,0 800,0 600,800 250,800" fill="#ffffff" fill-opacity="0.6"/>
      <polygon points="650,0 800,0 800,800 700,800" fill="#ffffff" fill-opacity="0.3"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pat_stripes',
    title: 'Listras',
    category: 'Futebol',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <rect x="100" y="0" width="100" height="800" fill="#ffffff"/>
      <rect x="300" y="0" width="100" height="800" fill="#ffffff"/>
      <rect x="500" y="0" width="100" height="800" fill="#ffffff"/>
      <rect x="700" y="0" width="100" height="800" fill="#ffffff"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pat_chevron',
    title: 'Chevron',
    category: 'Moderno',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <path d="M0,100 L400,300 L800,100 L800,200 L400,400 L0,200 Z" fill="#ffffff"/>
      <path d="M0,300 L400,500 L800,300 L800,400 L400,600 L0,400 Z" fill="#ffffff"/>
      <path d="M0,500 L400,700 L800,500 L800,600 L400,800 L0,600 Z" fill="#ffffff"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
  {
    id: 'pat_camo',
    title: 'Camuflado',
    category: 'Tático',
    thumbnail_url: '',
    svg_file_url: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
      <rect width="800" height="800" fill="#000000"/>
      <rect x="50" y="50" width="120" height="120" fill="#ffffff" fill-opacity="0.8"/>
      <rect x="250" y="100" width="180" height="100" fill="#ffffff" fill-opacity="0.5"/>
      <rect x="500" y="80" width="140" height="150" fill="#ffffff" fill-opacity="0.7"/>
      <rect x="100" y="300" width="160" height="120" fill="#ffffff" fill-opacity="0.6"/>
      <rect x="400" y="350" width="200" height="140" fill="#ffffff" fill-opacity="0.8"/>
      <rect x="150" y="550" width="180" height="160" fill="#ffffff" fill-opacity="0.7"/>
      <rect x="450" y="600" width="220" height="120" fill="#ffffff" fill-opacity="0.5"/>
    </svg>`,
    created_at: new Date().toISOString(),
  },
];

const DEFAULT_MODELS: ApparelModel[] = [
  {
    id: 'model_camisa_gola_careca',
    title: 'Camisa Gola Careca',
    category: 'futebol',
    front_shadow_url: hubAsset('/assets/MOCKUP_MULTIPLAY.png'),
    back_shadow_url: hubAsset('/assets/MOCKUP_MULTIPLAY.png'),
    mask_url: hubAsset('/assets/background_mask.png'),
    background_mask_url: hubAsset('/assets/background_mask.png'),
    front_mask_url: hubAsset('/assets/frente_mask.png'),
    back_mask_url: hubAsset('/assets/costas_mask.png'),
    sleeve_left_mask_url: hubAsset('/assets/manga_esquerda_mask.png'),
    sleeve_right_mask_url: hubAsset('/assets/mnagas_direita_mask.png'),
    collar_mask_url: hubAsset('/assets/gola_mask.png'),
    escudo_mask_url: hubAsset('/assets/escudo_mask.png'),
    logomarca_frente_mask_url: hubAsset('/assets/logomarca_frente_mask.png'),
    logomarca_costas_mask_url: hubAsset('/assets/logomarca_costas_mask.png'),
    numero_frente_mask_url: hubAsset('/assets/numero_frente_mask.png'),
    numero_costas_mask_url: hubAsset('/assets/numero_costas_mask.png'),
    nome_costas_acima_mask_url: hubAsset('/assets/nome_costas_acima_mask.png'),
    nome_costas_barra_mask_url: hubAsset('/assets/nome_costas_barra_mask.png'),
    thumbnail_url: hubAsset('/assets/MOCKUP_MULTIPLAY.png'),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const studioTools = [
  { id: 'colors', label: 'Cores', icon: Palette },
  { id: 'patterns', label: 'Estampas', icon: Layers },
  { id: 'decals', label: 'Logos e textos', icon: Sparkles },
  { id: 'catalog', label: 'Produtos e preços', icon: Tags },
] as const;

type StudioTool = (typeof studioTools)[number]['id'];

const editableParts: { id: NonNullable<GarmentPart>; label: string }[] = [
  { id: 'collar', label: 'Gola Careca' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Costas' },
  { id: 'sleeve_left', label: 'Manga Esq.' },
  { id: 'sleeve_right', label: 'Manga Dir.' },
  { id: 'sleeves', label: 'Ambas Mangas' },
];

interface StudioCustomerOption {
  id: string;
  name: string;
}

interface StudioArtOption {
  id: string;
  title: string;
  customer_id: string;
  customer_name: string;
}

interface StudioProductOption {
  id: string;
  sku: string;
  slug: string;
  name: string;
  category: string;
  fabric: string;
  description: string;
  availability_status: string;
  supply_price_cents: number | null;
  suggested_sale_price_cents: number | null;
}

function StudioContent() {
  const router = useRouter();
  const hubPrefix = useUnifiedHubPrefix();
  const homeHref = hubPrefix ? `${hubPrefix}` : '/';
  const searchParams = useSearchParams();
  const initialModelParam = searchParams.get('model');
  const artProjectParam = searchParams.get('artProjectId') || searchParams.get('reopen');
  const initialCrmParam = searchParams.get('crm');

  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [customers, setCustomers] = useState<StudioCustomerOption[]>([]);
  const [artProjects, setArtProjects] = useState<StudioArtOption[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<StudioProductOption[]>([]);
  const [catalogSlug, setCatalogSlug] = useState<string>(initialModelParam || 'camisa-authentic');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCrmParam || '');
  const [selectedArtId, setSelectedArtId] = useState<string>(artProjectParam || '');
  const [showTeamSetup, setShowTeamSetup] = useState(() =>
    Boolean(initialCrmParam && !artProjectParam)
  );
  const reopenedRef = useRef<string | null>(null);

  const {
    modelId,
    view,
    colorA,
    colorB,
    backgroundColor,
    collarColor,
    frontColor,
    backColor,
    sleeveLeftColor,
    sleeveRightColor,
    sleevesColor,
    selectedPart,
    elements,
    selectedElementId,
    setPattern,
    setColorA,
    setColorB,
    setCollarColor,
    setFrontColor,
    setBackColor,
    setSleeveLeftColor,
    setSleeveRightColor,
    setSleevesColor,
    setSelectedPart,
    setSelectedElementId,
    updateElementsBatch,
    loadLayerState,
    getLayerState,
  } = useMockupStore();

  const teamName = useMockupStore((state) => state.clientName);
  const currentPatternId = useMockupStore((state) => state.patternId);
  const { pushSnapshot, undo, redo, past, future } = useHistoryStore();

  const [models] = useState<ApparelModel[]>(DEFAULT_MODELS);
  const [patterns, setPatterns] = useState<Pattern[]>(DEFAULT_SVG_PATTERNS);
  const [patternsReady, setPatternsReady] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<StudioTool>('colors');

  const reloadPortalContext = useCallback(async () => {
    try {
      const profile = await useSessionStore.getState().fetchMe();
      if (!profile) {
        router.replace('/login');
        return;
      }
      setMe(profile);

      const perms = profile.activeRole?.permissions || [];
      const [custRes, artsRes, catRes] = await Promise.all([
        perms.includes('crm:read')
          ? portalFetch<{ items: StudioCustomerOption[] }>('/crm/customers?limit=100').catch(() => ({
              items: [],
            }))
          : Promise.resolve({ items: [] as StudioCustomerOption[] }),
        perms.includes('arts:read')
          ? portalFetch<{ items: StudioArtOption[] }>('/arts').catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] as StudioArtOption[] }),
        perms.includes('catalog:read')
          ? portalFetch<{ items: StudioProductOption[] }>('/catalog/products').catch(() => ({
              items: [],
            }))
          : Promise.resolve({ items: [] as StudioProductOption[] }),
      ]);

      setCustomers(custRes.items || []);
      setArtProjects(artsRes.items || []);
      const prods = catRes.items || [];
      setCatalogProducts(prods);

      if (initialModelParam && prods.some((p) => p.slug === initialModelParam)) {
        setCatalogSlug(initialModelParam);
      } else if (prods.length > 0) {
        setCatalogSlug((prev) => (prods.some((p) => p.slug === prev) ? prev : prods[0].slug));
      }

      if (initialCrmParam && (custRes.items || []).some((c) => c.id === initialCrmParam)) {
        setSelectedCustomerId(initialCrmParam);
      }
    } catch (err) {
      if (err instanceof PortalApiError && err.statusCode === 401) {
        router.replace('/login');
        return;
      }
    } finally {
      setAuthChecking(false);
    }
  }, [router, initialModelParam, initialCrmParam]);

  useEffect(() => {
    reloadPortalContext();
  }, [reloadPortalContext]);

  // Sincroniza Estampas do servidor local (/api/textures) e texturas customizadas
  useEffect(() => {
    async function loadAllPatterns() {
      let diskTextures: Pattern[] = [];
      try {
        const res = await fetch(hubAsset('/api/textures'));
        const data = await res.json();
        if (data.success && Array.isArray(data.textures)) {
          diskTextures = data.textures.map(
            (t: {
              id: string;
              name: string;
              thumbnail_url: string;
              svg_file_url: string;
              created_at: string;
            }) => ({
              id: t.id,
              title: t.name,
              category: 'Estampas',
              thumbnail_url: hubAsset(t.thumbnail_url),
              svg_file_url: hubAsset(t.svg_file_url),
              created_at: t.created_at,
            })
          );
        }
      } catch {
        // Continua com defaults locais
      }

      const custom = getCustomUniformPatterns();
      const customConverted: Pattern[] = custom.map((p) => ({
        id: p.id,
        title: p.name,
        category: 'Estampa',
        thumbnail_url: p.thumbnailUrl ? hubAsset(p.thumbnailUrl) : p.url.startsWith('<svg') ? p.url : hubAsset(p.url),
        svg_file_url: p.url.startsWith('<svg') ? p.url : hubAsset(p.url),
        created_at: p.createdAt,
      }));

      const map = new Map<string, Pattern>();
      [...diskTextures, ...customConverted, ...DEFAULT_SVG_PATTERNS].forEach((item) => {
        map.set(item.id, item);
      });

      setPatterns(Array.from(map.values()));
      setPatternsReady(true);
    }

    loadAllPatterns();
  }, []);

  // Reabrir projeto de arte real pelo banco (layer_state salvo na versão mais recente)
  useEffect(() => {
    if (!artProjectParam || !patternsReady || authChecking || reopenedRef.current === artProjectParam) {
      return;
    }

    async function loadArtProject() {
      try {
        const res = await portalFetch<{
          project: { id: string; customer_id: string; customer_name: string; title: string };
          versions: Array<{ id: string; version_number: number; layer_state: LayerState | null }>;
        }>(`/arts/${artProjectParam}`);

        setSelectedArtId(res.project.id);
        setSelectedCustomerId(res.project.customer_id);

        const versionWithState = res.versions.find((v) => Boolean(v.layer_state));
        if (versionWithState?.layer_state) {
          const st = versionWithState.layer_state;
          const matchedModel = models.find((m) => m.id === st.modelId) || models[0];
          const matchedPattern = st.patternId
            ? patterns.find((p) => p.id === st.patternId) ?? null
            : null;
          loadLayerState(st, matchedModel, matchedPattern);
        } else {
          const current = getLayerState();
          loadLayerState({
            ...current,
            clientName: res.project.customer_name || res.project.title,
          });
        }
        reopenedRef.current = artProjectParam;
      } catch {
        // Ignora se projeto não possuir layer_state ou não existir nesta unidade
        reopenedRef.current = artProjectParam;
      }
    }

    loadArtProject();
  }, [artProjectParam, patternsReady, authChecking, models, patterns, loadLayerState, getLayerState]);

  useEffect(() => {
    if (selectedElementId) setActiveTool('decals');
  }, [selectedElementId]);

  useEffect(() => {
    if (selectedPart) setActiveTool('colors');
  }, [selectedPart]);

  if (authChecking || !me) {
    return (
      <div className="king-studio apple-backdrop h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <LoadingCard message="Autenticando Studio 3D na sua unidade..." />
        </div>
      </div>
    );
  }

  const activeCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;
  const activeArt = artProjects.find((a) => a.id === selectedArtId) ?? null;
  const catalogProduct =
    catalogProducts.find((p) => p.slug === catalogSlug) || catalogProducts[0] || null;
  const toolLabel = studioTools.find((tool) => tool.id === activeTool)?.label;
  const currentModel = models.find((m) => m.id === modelId) || models[0];
  const currentPattern = patterns.find((p) => p.id === currentPatternId) || null;

  function applyTeam(team: TeamSetup) {
    pushSnapshot(getLayerState());
    const state = getLayerState();
    loadLayerState({
      ...state,
      clientName: team.name,
      view: 'both',
      colorA: team.primary,
      colorB: team.secondary,
      frontColor: team.primary,
      backColor: team.primary,
      collarColor: team.secondary,
      sleevesColor: team.primary,
      sleeveLeftColor: team.primary,
      sleeveRightColor: team.primary,
      elements: [
        ...state.elements.filter((element) => element.id !== team.crest.id && element.id !== team.number.id),
        team.crest,
        team.number,
      ],
      selectedPart: null,
      selectedElementId: null,
    });
    pushSnapshot(getLayerState());
    setShowTeamSetup(false);
    setActiveTool('patterns');
  }

  const handleElementsChange = (newElements: MockupElement[]) => {
    updateElementsBatch(newElements);
    pushSnapshot(getLayerState());
  };

  const handleUndo = () => {
    const prevState = undo(getLayerState());
    if (prevState) loadLayerState(prevState);
  };

  const handleRedo = () => {
    const nextState = redo(getLayerState());
    if (nextState) loadLayerState(nextState);
  };

  const effectiveColorPart: NonNullable<GarmentPart> =
    selectedPart &&
    ['collar', 'front', 'back', 'sleeve_left', 'sleeve_right', 'sleeves'].includes(selectedPart)
      ? selectedPart
      : 'collar';

  const getColorForPart = (part: NonNullable<GarmentPart>) => {
    switch (part) {
      case 'front':
        return frontColor;
      case 'back':
        return backColor;
      case 'sleeve_left':
        return sleeveLeftColor;
      case 'sleeve_right':
        return sleeveRightColor;
      case 'sleeves':
        return sleevesColor;
      case 'collar':
      default:
        return collarColor;
    }
  };

  const handlePartColorSet = (part: NonNullable<GarmentPart>, hex: string) => {
    switch (part) {
      case 'front':
        setFrontColor(hex);
        break;
      case 'back':
        setBackColor(hex);
        break;
      case 'sleeve_left':
        setSleeveLeftColor(hex);
        break;
      case 'sleeve_right':
        setSleeveRightColor(hex);
        break;
      case 'sleeves':
        setSleevesColor(hex);
        break;
      case 'collar':
      default:
        setCollarColor(hex);
        break;
    }
    pushSnapshot(getLayerState());
  };

  const getPartBadgeLabel = () => {
    switch (selectedPart) {
      case 'collar':
        return 'Editando: Gola Careca';
      case 'front':
        return 'Editando: Frente da Camisa';
      case 'back':
        return 'Editando: Costas da Camisa';
      case 'sleeve_left':
        return 'Editando: Manga Esquerda';
      case 'sleeve_right':
        return 'Editando: Manga Direita';
      case 'sleeves':
        return 'Editando: Ambas as Mangas';
      default:
        return 'Editando: Uniforme';
    }
  };

  return (
    <div className="king-studio apple-backdrop flex flex-col h-screen max-h-screen overflow-hidden text-wise-ink">
      <Header
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        modelTitle={`${catalogProduct?.name || currentModel.title} · Mockup Studio`}
        tenantName={`${me.activeUnit.code} · ${me.activeUnit.name} (${me.activeRole.name})`}
        canAccessAdmin={me.activeRole.scope !== 'unit'}
      />

      <div className={styles.masthead}>
        <div>
          <p className={styles.kicker}>
            KING SPORTS / STUDIO DE ARTES · {(catalogProduct?.name || currentModel.title).toUpperCase()}
          </p>
          <h1>
            Vista a identidade <span>do seu time.</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {artProjects.length > 0 && (
            <label className="text-[11px] font-semibold text-wise-body flex items-center gap-1.5">
              <span>Projeto Arte:</span>
              <select
                value={selectedArtId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedArtId(id);
                  if (id) {
                    const found = artProjects.find((a) => a.id === id);
                    if (found) setSelectedCustomerId(found.customer_id);
                  }
                }}
                className="rounded-xl apple-glass-well px-3 py-1.5 text-xs text-wise-ink font-semibold outline-none max-w-[200px]"
              >
                <option value="" className="bg-[#181818] text-white">Novo / Livre</option>
                {artProjects.map((ap) => (
                  <option key={ap.id} value={ap.id} className="bg-[#181818] text-white">
                    {ap.title} · {ap.customer_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {customers.length > 0 && (
            <label className="text-[11px] font-semibold text-wise-body flex items-center gap-1.5">
              <span>Cliente CRM:</span>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="rounded-xl apple-glass-well px-3 py-1.5 text-xs text-wise-ink font-semibold outline-none max-w-[180px]"
              >
                <option value="" className="bg-[#181818] text-white">Sem vínculo CRM</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#181818] text-white">
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <Link
            href={`${homeHref}?tab=studio`}
            className="text-xs font-semibold text-wise-ink-deep bg-white/8 hover:bg-white/15 border border-white/15 rounded-full px-3 py-1 transition-colors"
          >
            Artes &amp; Aprovações ↗
          </Link>
          <div className={styles.matchTag}>
            <Shirt size={16} aria-hidden="true" /> Frente + costas
          </div>
        </div>
      </div>

      <div className={styles.workspace}>
        <nav className={styles.tools} aria-label="Ferramentas do Studio">
          <button type="button" onClick={() => setShowTeamSetup(true)}>
            <span className={styles.toolIndex}>01</span> Configurar time
          </button>
          {studioTools.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTool === id}
              aria-controls="studio-properties"
              onClick={() => setActiveTool(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span className={styles.toolIndex}>{String(index + 2).padStart(2, '0')}</span>
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={!selectedElementId && !selectedPart}
            onClick={() => {
              setSelectedElementId(null);
              setSelectedPart(null);
            }}
          >
            <MousePointer2 size={16} aria-hidden="true" />
            Limpar seleção
          </button>
        </nav>

        <aside id="studio-properties" className={styles.inspector} aria-labelledby="studio-tool-title">
          <h2 id="studio-tool-title" className={styles.panelTitle}>
            {toolLabel}
          </h2>
          <div className={styles.panelBody} key={activeTool}>
            {activeTool === 'catalog' && (
              <section className={styles.catalog}>
                <label
                  className="block text-xs font-bold uppercase tracking-wider text-wise-body"
                  htmlFor="studio-catalog"
                >
                  Catálogo vigente ({catalogProducts.length} produtos)
                </label>
                {catalogProducts.length === 0 ? (
                  <p className="mt-2 text-xs text-wise-mute">
                    Catálogo indisponível para o perfil atual.
                  </p>
                ) : (
                  <>
                    <select
                      id="studio-catalog"
                      className="mt-2 w-full rounded-xl apple-glass-well p-2.5 text-sm text-wise-ink outline-none focus:border-blue-400/70"
                      value={catalogSlug}
                      onChange={(event) => setCatalogSlug(event.target.value)}
                    >
                      {catalogProducts.map((product) => (
                        <option key={product.id} value={product.slug} className="bg-[#181818] text-white">
                          {product.name} ({product.category})
                        </option>
                      ))}
                    </select>
                    {catalogProduct && (
                      <div className="mt-3 rounded-2xl apple-glass-well p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-wise-mute">{catalogProduct.sku}</span>
                          <StatusPill value={catalogProduct.availability_status} />
                        </div>
                        <p className="text-sm font-bold text-wise-ink">
                          Sugerido: {formatBrl(catalogProduct.suggested_sale_price_cents)}
                        </p>
                        <p className="text-xs text-wise-body">
                          Fornecimento: {formatBrl(catalogProduct.supply_price_cents)}
                        </p>
                        <p className="text-xs text-wise-body">{catalogProduct.fabric}</p>
                        <p className="text-xs text-wise-mute">{catalogProduct.description}</p>
                      </div>
                    )}
                  </>
                )}
                <Link
                  href={`${homeHref}?tab=catalog`}
                  className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 px-3 py-1.5 text-xs font-semibold text-wise-ink-deep transition-colors"
                >
                  Ver tabela e medidas completas ↗
                </Link>
              </section>
            )}

            {activeTool === 'colors' && (
              <div className="space-y-3">
                <p className="text-xs text-wise-body">
                  Escolha uma peça abaixo ou clique diretamente na camisa no canvas para pintar individualmente.
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  {editableParts.map((part) => {
                    const active = effectiveColorPart === part.id;
                    const hex = getColorForPart(part.id);
                    return (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => setSelectedPart(part.id)}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                          active
                            ? 'apple-glass-cta text-white'
                            : 'border-white/12 bg-white/5 hover:bg-white/10 text-wise-body hover:text-wise-ink'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/45 shrink-0"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="truncate">{part.label}</span>
                      </button>
                    );
                  })}
                </div>

                <StandardColorGrid
                  label={editableParts.find((p) => p.id === effectiveColorPart)?.label ?? 'Gola Careca'}
                  sublabel="20 cores oficiais"
                  selectedColor={getColorForPart(effectiveColorPart)}
                  onChange={(hex) => handlePartColorSet(effectiveColorPart, hex)}
                />

                <button
                  type="button"
                  onClick={() => {
                    const hex = getColorForPart(effectiveColorPart);
                    pushSnapshot(getLayerState());
                    setFrontColor(hex);
                    setBackColor(hex);
                    setSleevesColor(hex);
                    setColorA(hex);
                    pushSnapshot(getLayerState());
                  }}
                  className="w-full rounded-full border border-white/15 bg-white/8 hover:bg-white/14 py-2 text-xs font-semibold text-wise-ink-deep transition-colors"
                >
                  Aplicar cor selecionada em todo o corpo e mangas
                </button>
              </div>
            )}

            {activeTool === 'patterns' && (
              <div className="space-y-3">
                <p className="text-sm text-wise-body">Escolha uma estampa sublimada ou use Liso.</p>
                <div className="p-2.5 rounded-2xl apple-glass-well">
                  <div className={styles.patternGrid}>
                    <button
                      type="button"
                      aria-pressed={currentPattern === null}
                      onClick={() => {
                        setPattern(null);
                        pushSnapshot(getLayerState());
                      }}
                      className={`flex flex-col items-center p-1.5 rounded-xl border text-left transition-all ${
                        currentPattern === null
                          ? 'bg-blue-500/20 border-blue-400/70 text-white'
                          : 'bg-white/5 border-white/12 text-wise-body hover:bg-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="w-full aspect-square rounded-lg bg-white/8 border border-white/15 flex items-center justify-center mb-0.5 text-wise-ink">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-bold text-center leading-tight">Liso</span>
                    </button>

                    {patterns.map((p) => {
                      const isSelected = currentPattern?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setPattern(p);
                            pushSnapshot(getLayerState());
                          }}
                          className={`flex flex-col items-center p-1.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-blue-500/20 border-blue-400/70 text-white'
                              : 'bg-white/5 border-white/12 text-wise-body hover:bg-white/10 hover:border-white/25'
                          }`}
                        >
                          <div className="w-full aspect-square rounded-lg bg-white/8 border border-white/15 flex items-center justify-center mb-0.5 overflow-hidden p-0.5">
                            {p.thumbnail_url &&
                            (p.thumbnail_url.startsWith('http') ||
                              p.thumbnail_url.startsWith('/') ||
                              p.thumbnail_url.startsWith('data:image')) ? (
                              <img src={hubAsset(p.thumbnail_url)} alt={p.title} className="w-full h-full object-contain" />
                            ) : (
                              <Sparkles className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-wise-mute'}`} />
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-center line-clamp-1 leading-tight">
                            {p.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {currentPattern && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-white/12 pb-1">
                      <span className="text-[10px] font-bold text-wise-mute uppercase tracking-wider">
                        Cores da Estampa
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-wise-ink-deep font-semibold">
                        20 Cores Oficiais
                      </span>
                    </div>

                    <StandardColorGrid
                      label="Cor 1 da Textura"
                      sublabel="Tom primário"
                      selectedColor={colorA}
                      onChange={(hex) => {
                        setColorA(hex);
                        pushSnapshot(getLayerState());
                      }}
                    />

                    <StandardColorGrid
                      label="Cor 2 da Textura"
                      sublabel="Áreas claras da estampa"
                      selectedColor={colorB}
                      onChange={(hex) => {
                        setColorB(hex);
                        pushSnapshot(getLayerState());
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTool === 'decals' && (
              <div className="space-y-3">
                <DecalManager
                  elements={elements}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  onAddElement={(newEl) => {
                    const targetView: MockupView = view === 'back' ? 'back' : 'front';
                    const elementWithView = { ...newEl, view: targetView };
                    useMockupStore.getState().addElement(elementWithView);
                    pushSnapshot(getLayerState());
                  }}
                  onUpdateElement={(upEl) => {
                    useMockupStore.getState().updateElement(upEl);
                    pushSnapshot(getLayerState());
                  }}
                  onRemoveElement={(delId) => {
                    useMockupStore.getState().removeElement(delId);
                    pushSnapshot(getLayerState());
                  }}
                />
              </div>
            )}
          </div>
        </aside>

        <section className={styles.document} aria-label="Tela do mockup">
          <div className={styles.documentTab}>
            <Shirt size={14} />
            <span>{activeArt?.title || teamName || activeCustomer?.name || currentModel.title}</span>
          </div>

          {selectedPart && (
            <div className={styles.selection}>
              <span className="px-3 py-1 rounded-full apple-glass-cta text-white font-semibold text-xs">
                {getPartBadgeLabel()}
              </span>
            </div>
          )}

          <div className={styles.viewport}>
            <MockupCanvas
              model={currentModel}
              pattern={currentPattern}
              backgroundColor={backgroundColor}
              colorA={colorA}
              colorB={colorB}
              collarColor={collarColor}
              frontColor={frontColor}
              backColor={backColor}
              sleeveLeftColor={sleeveLeftColor}
              sleeveRightColor={sleeveRightColor}
              sleevesColor={sleevesColor}
              selectedPart={selectedPart}
              elements={elements}
              view={view}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onSelectPart={(part: GarmentPart) => setSelectedPart(part)}
              onChangeCollarColor={(cC) => {
                setCollarColor(cC);
                pushSnapshot(getLayerState());
              }}
              onChangeFrontColor={(fc) => {
                setFrontColor(fc);
                pushSnapshot(getLayerState());
              }}
              onChangeBackColor={(bc) => {
                setBackColor(bc);
                pushSnapshot(getLayerState());
              }}
              onChangeSleeveLeftColor={(slc) => {
                setSleeveLeftColor(slc);
                pushSnapshot(getLayerState());
              }}
              onChangeSleeveRightColor={(src) => {
                setSleeveRightColor(src);
                pushSnapshot(getLayerState());
              }}
              onChangeSleevesColor={(cS) => {
                setSleevesColor(cS);
                pushSnapshot(getLayerState());
              }}
              onChangeElements={handleElementsChange}
            />
          </div>
          <footer className={styles.status}>
            <span>
              MOCKUP ILUSTRATIVO · {catalogProduct?.name || currentModel.title} · {me.activeUnit.code}
            </span>
            <span>
              {elements.length} {elements.length === 1 ? 'aplicação' : 'aplicações'}
            </span>
          </footer>
        </section>
      </div>

      {showTeamSetup && (
        <TeamSetupDialog
          clientName={activeCustomer?.name ?? teamName}
          onApply={applyTeam}
          onClose={() => setShowTeamSetup(false)}
        />
      )}

      <ExportModal
        key={`${teamName}-${selectedArtId}-${selectedCustomerId}`}
        initialClientName={activeCustomer?.name ?? teamName}
        customerId={selectedCustomerId || null}
        artProjectId={selectedArtId || null}
        customers={customers}
        artProjects={artProjects}
        unitLabel={`${me.activeUnit.code} · ${me.activeUnit.name}`}
        canSaveToPortal={me.activeRole.permissions.includes('arts:write')}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onSaved={async (savedArtId) => {
          setSelectedArtId(savedArtId);
          await portalFetch<{ items: StudioArtOption[] }>('/arts')
            .then((r) => setArtProjects(r.items || []))
            .catch(() => undefined);
        }}
        model={currentModel}
        pattern={currentPattern}
        colorA={colorA}
        colorB={colorB}
        elements={elements}
        getLayerState={getLayerState}
      />
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="king-studio apple-backdrop h-screen flex items-center justify-center text-xs text-wise-mute">
          Carregando Studio...
        </div>
      }
    >
      <StudioContent />
    </Suspense>
  );
}
