import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateSeller } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../plugins/supabase.js';
import { createSellerSchema } from '@mockup/validation';

export async function sellersRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  fastify.addHook('preHandler', authenticateSeller);

  /**
   * GET /api/v1/sellers
   * Lista todos os vendedores do tenant com métricas
   */
  fastify.get('/', async (request, reply) => {
    const session = request.userSession!;

    const { data: sellers, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, status, last_seen_at, created_at')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ sellers });
  });

  /**
   * POST /api/v1/sellers
   * Cadastra / Convida um novo vendedor para o tenant
   */
  fastify.post('/', async (request, reply) => {
    const parse = createSellerSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send(parse.error.flatten());

    const session = request.userSession!;
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { data: seller, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        tenant_id: session.tenantId,
        full_name: parse.data.fullName,
        email: parse.data.email,
        role: parse.data.role,
        status: 'active',
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send(seller);
  });

  /**
   * PATCH /api/v1/sellers/:id/status
   * Ativa ou bloqueia um vendedor
   */
  fastify.patch('/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: 'active' | 'blocked' };
    const session = request.userSession!;

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', session.tenantId)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send(updated);
  });
}
