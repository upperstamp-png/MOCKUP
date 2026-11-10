/**
 * @file sessions.service.ts
 * @description Gestão de sessões ativas simultâneas de vendedores e heartbeat periódico
 */

import { supabaseAdmin } from '../../plugins/supabase.js';
import { HeartbeatResponse } from '@mockup/types';

export class SessionsService {
  /**
   * Processa o heartbeat da sessão e valida o limite de terminais simultâneos
   */
  public async processHeartbeat(
    sessionToken: string,
    tenantId: string,
    licenseId: string,
    ipAddress?: string
  ): Promise<HeartbeatResponse> {
    const now = new Date();
    const thresholdMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    // 1. Atualiza timestamp da sessão atual
    await supabaseAdmin
      .from('active_sessions')
      .update({
        last_seen_at: now.toISOString(),
        ip_address: ipAddress,
      })
      .eq('session_token_hash', sessionToken)
      .eq('tenant_id', tenantId);

    // 2. Busca licença e limite de sessões
    const { data: license } = await supabaseAdmin
      .from('licenses')
      .select('status, expires_at, max_devices')
      .eq('id', licenseId)
      .single();

    const maxSessions = license?.max_devices || 3;
    const licenseStatus = license?.status || 'active';

    // 3. Conta sessões ativas nos últimos 5 minutos
    const { count } = await supabaseAdmin
      .from('active_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('license_id', licenseId)
      .gte('last_seen_at', thresholdMinutesAgo);

    const activeCount = count || 1;

    return {
      valid: licenseStatus === 'active' && activeCount <= maxSessions,
      activeSessionsCount: activeCount,
      maxSessions,
      licenseStatus,
    };
  }

  /**
   * Encerra uma sessão específica
   */
  public async terminateSession(sessionId: string, tenantId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('active_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('tenant_id', tenantId);

    return !error;
  }
}

export const sessionsService = new SessionsService();
