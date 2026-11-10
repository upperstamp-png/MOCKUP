export type ModuleTabId =
  | 'day'
  | 'agenda'
  | 'tasks'
  | 'crm'
  | 'catalog'
  | 'quotes'
  | 'studio'
  | 'orders'
  | 'finance'
  | 'support'
  | 'documents'
  | 'training'
  | 'sandbox'
  | 'notifications'
  | 'settings'
  | 'network_admin';

export interface ScheduleEventItem {
  id: string;
  unit_id: string;
  event_type: 'entrega' | 'reuniao' | 'follow_up' | 'outro';
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  meeting_url: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  order_id: string | null;
  order_number?: string | null;
  assigned_to: string | null;
  assigned_name?: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'canceled';
  color_tag: 'blue' | 'cyan' | 'emerald' | 'amber' | 'slate';
  is_sandbox: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortalTaskItem {
  id: string;
  unit_id: string;
  task_type: 'contato' | 'reuniao' | 'follow_up' | 'vencimento' | 'aprovacao_esperada' | 'entrega' | 'implantacao';
  title: string;
  description: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  opportunity_id: string | null;
  order_id: string | null;
  order_number?: string | null;
  assigned_to: string | null;
  assigned_name?: string | null;
  due_at: string;
  status: 'pending' | 'in_progress' | 'completed' | 'canceled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  completed_at: string | null;
  is_sandbox: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortalUnitSummary {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  unitType: 'franchise' | 'headquarters';
  operationalStatus: 'onboarding' | 'pending_approval' | 'active' | 'restricted' | 'suspended';
  trainingCompleted: boolean;
  bancaApproved: boolean;
  implantationApproved: boolean;
}

export interface CommercialConfig {
  config_status: 'not_configured' | 'pending_approval' | 'approved';
  commercial_modality: 'pending_definition' | 'revenda' | 'intermediacao';
  royalty_bps: number | null;
  marketing_fund_bps: number | null;
  factory_transfer_bps: number | null;
  default_price_list_code: string | null;
  max_discount_bps: number;
  territory_rule_status: string;
  territory_notes: string | null;
  default_lead_time_min_days: number | null;
  default_lead_time_max_days: number | null;
  production_release_rules: Record<string, boolean>;
  payment_gateway_provider: string;
  payment_gateway_status: string;
  nfe_emitter_provider: string;
  nfe_emitter_status: string;
  notes: string | null;
}

export interface IntegrationsStatus {
  supabase_auth: boolean;
  supabase_storage: boolean;
  postgresql: boolean;
  asaas_payments: boolean;
  nfe_emitter: boolean;
  whatsapp_api: boolean;
  email_smtp: boolean;
}

export interface PortalMeResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
  };
  activeUnit: PortalUnitSummary;
  activeRole: {
    slug: string;
    name: string;
    scope: 'unit' | 'factory' | 'network';
    permissions: string[];
  };
  availableUnits: PortalUnitSummary[];
  commercialConfig: CommercialConfig | null;
  unreadNotifications: number;
  integrationsStatus: IntegrationsStatus;
}

export interface PriorityItem {
  id: string;
  dedupeKey: string;
  severity: 'critical' | 'high' | 'medium';
  category: string;
  customerName: string;
  referenceCode: string;
  problem: string;
  deadline: string | null;
  responsibleName: string;
  impact: string;
  recommendedAction: string;
  actionTab: ModuleTabId;
  actionEntityId: string;
}

export interface MyDayResponse {
  generatedAt: string;
  period: { key: string; label: string };
  unitGovernance: {
    unitCode: string;
    unitName: string;
    operationalStatus: string;
    trainingCompleted: boolean;
    bancaApproved: boolean;
    implantationApproved: boolean;
    commercialConfigStatus: string;
    commercialModality: string;
    territoryRuleStatus: string;
    implantationPendingItems: Array<{ key: string; label: string; tab: string; detail: string }>;
    initialFranchiseFeeCents: number;
    initialFeeNote: string;
  };
  commercialKpis: {
    periodLabel: string;
    openOpportunities: { count: number; estimatedValueCents: number; definition: string };
    sentQuotes: { count: number; totalValueCents: number; definition: string };
    proposalConversion: { ratePct: number | null; convertedCount: number; baseCount: number; definition: string };
    confirmedOrders: { count: number; totalValueCents: number; definition: string };
    receivedValue: { amountCents: number; definition: string };
    openReceivablesBalance: { amountCents: number; overdueCents: number; definition: string };
  };
  operationSnapshotKpis: {
    artsAwaitingAction: { count: number; definition: string };
    ordersInProduction: { count: number; definition: string };
    delayedOrders: { count: number; definition: string };
    upcomingDeliveries: { count: number; definition: string };
    openTickets: { count: number; definition: string };
  };
  priorities: PriorityItem[];
  agenda: Array<{
    id: string;
    task_type: string;
    title: string;
    description: string | null;
    due_at: string;
    status: string;
    priority: string;
    customer_name: string | null;
    order_number: string | null;
    assigned_name: string | null;
  }>;
  scheduleEvents?: ScheduleEventItem[];
  featuredOrders: Array<{
    id: string;
    order_number: string;
    customer_name: string;
    commercial_status: string;
    financial_status: string;
    approval_status: string;
    production_status: string;
    logistics_status: string;
    grade_approved: boolean;
    estimated_delivery_date: string | null;
    event_date: string | null;
    release_block_reasons: string[];
    total_pieces: number;
  }>;
  trainingSummary: {
    totalMandatoryCourses: number;
    completedMandatoryCourses: number;
    totalLessons: number;
    completedLessons: number;
  };
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    category: string;
    is_pinned: boolean;
    published_at: string;
  }>;
}
