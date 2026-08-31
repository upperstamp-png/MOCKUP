import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import crypto from 'node:crypto';
import { authenticateAdmin } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../plugins/supabase.js';
import {
  createTenantSchema,
  createLicenseSchema,
  createApparelModelSchema,
  createPatternSchema,
} from '@mockup/validation';

export async function adminRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  // Aplica verificação de chave admin a todas as rotas deste plugin
  fastify.addHook('preHandler', authenticateAdmin);

  // ==========================================
  // 1. TENANTS MANAGEMENT
  // ==========================================
  fastify.get('/tenants', async (_request, reply) => {
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*, licenses(*)')
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ tenants });
  });

  fastify.post('/tenants', async (request, reply) => {
    const parse = createTenantSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send(parse.error.flatten());

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .insert(parse.data)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send(tenant);
  });

  // ==========================================
  // 2. LICENSES MANAGEMENT
  // ==========================================
  fastify.get('/licenses', async (_request, reply) => {
    const { data: licenses, error } = await supabaseAdmin
      .from('licenses')
      .select('*, tenant:tenants(name, cnpj), devices(*)')
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ licenses });
  });

  fastify.post('/licenses', async (request, reply) => {
    const parse = createLicenseSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send(parse.error.flatten());

    // Gera uma chave serial criptograficamente segura (ex: MOCK-XXXX-XXXX-XXXX)
    const rawSerial = `MOCK-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const serialHash = crypto.createHash('sha256').update(rawSerial).digest('hex');
    const serialPrefix = rawSerial.substring(0, 9);

    const { data: license, error } = await supabaseAdmin
      .from('licenses')
      .insert({
        tenant_id: parse.data.tenantId,
        serial_key_hash: serialHash,
        serial_key_prefix: serialPrefix,
        max_devices: parse.data.maxDevices,
        expires_at: parse.data.expiresAt,
        status: parse.data.status,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Retorna a chave serial em texto puro APENAS no momento da criação
    return reply.status(201).send({
      license,
      generatedPlainSerialKey: rawSerial,
    });
  });

  fastify.patch('/licenses/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: 'active' | 'blocked' | 'expired' };

    const { data: updated, error } = await supabaseAdmin
      .from('licenses')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send(updated);
  });

  // ==========================================
  // 3. APPAREL MODELS MANAGEMENT
  // ==========================================
  fastify.get('/models', async (_request, reply) => {
    const { data: models, error } = await supabaseAdmin
      .from('apparel_models')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ models });
  });

  fastify.post('/models', async (request, reply) => {
    const parse = createApparelModelSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send(parse.error.flatten());

    const { data: model, error } = await supabaseAdmin
      .from('apparel_models')
      .insert({
        tenant_id: parse.data.tenantId || null,
        title: parse.data.title,
        category: parse.data.category,
        front_shadow_url: parse.data.frontShadowUrl,
        back_shadow_url: parse.data.backShadowUrl,
        mask_url: parse.data.maskUrl,
        mask_back_url: parse.data.maskBackUrl || null,
        thumbnail_url: parse.data.thumbnailUrl,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send(model);
  });

  // ==========================================
  // 4. PATTERNS MANAGEMENT
  // ==========================================
  fastify.get('/patterns', async (_request, reply) => {
    const { data: patterns, error } = await supabaseAdmin
      .from('patterns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ patterns });
  });

  fastify.post('/patterns', async (request, reply) => {
    const parse = createPatternSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send(parse.error.flatten());

    const { data: pattern, error } = await supabaseAdmin
      .from('patterns')
      .insert({
        tenant_id: parse.data.tenantId || null,
        title: parse.data.title,
        category: parse.data.category,
        svg_file_url: parse.data.svgFileUrl,
        thumbnail_url: parse.data.thumbnailUrl,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send(pattern);
  });

  // ==========================================
  // 5. AUDIT LOGS
  // ==========================================
  fastify.get('/audit-logs', async (_request, reply) => {
    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ logs });
  });
}
