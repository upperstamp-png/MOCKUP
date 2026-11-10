import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { billingWebhookSchema } from '@mockup/validation';
import { supabaseAdmin } from '../../plugins/supabase.js';

export async function billingRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  /**
   * POST /api/v1/billing/webhook
   * Recebe notificações assíncronas do Gateway de Pagamento e atualiza status de licença
   */
  fastify.post('/webhook', async (request, reply) => {
    const parseResult = billingWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Payload do webhook de billing inválido',
        details: parseResult.error.flatten(),
      });
    }

    const { event, tenantId, externalSubscriptionId } = parseResult.data;
    request.log.info({ event, tenantId, externalSubscriptionId }, 'Processando webhook de billing');

    // 1. Tratamento por tipo de evento
    if (event === 'payment_confirmed' || event === 'subscription_renewed') {
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30);

      // Atualiza licença do tenant para ativa com nova data
      await supabaseAdmin
        .from('licenses')
        .update({
          status: 'active',
          expires_at: newExpiry.toISOString(),
        })
        .eq('tenant_id', tenantId);

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_end: newExpiry.toISOString(),
        })
        .eq('external_subscription_id', externalSubscriptionId);
    } else if (event === 'payment_failed') {
      // Bloqueia licença ou marca como pendente
      await supabaseAdmin
        .from('licenses')
        .update({ status: 'blocked' })
        .eq('tenant_id', tenantId);

      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('external_subscription_id', externalSubscriptionId);
    } else if (event === 'subscription_canceled') {
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled', cancel_at_period_end: true })
        .eq('external_subscription_id', externalSubscriptionId);
    }

    // Registra evento no log de auditoria
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: tenantId,
      actor_type: 'billing_gateway',
      action: `BILLING_${event.toUpperCase()}`,
      details: parseResult.data as unknown as Record<string, unknown>,
    });

    return reply.status(200).send({ received: true });
  });
}
