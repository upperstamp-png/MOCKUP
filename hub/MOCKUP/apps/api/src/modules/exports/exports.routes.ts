import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateSeller } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../plugins/supabase.js';
import { serverExportSchema } from '@mockup/validation';
import { generateServerSalesBoardSvg, shouldApplyWatermark } from './server-renderer.js';

export async function exportsRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  /**
   * POST /api/v1/exports/server
   * Renderização Server-Side em alta resolução e persistência completa do LayerState
   */
  fastify.post(
    '/server',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const startTime = Date.now();
      const parseResult = serverExportSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'Payload do LayerState inválido para exportação',
          details: parseResult.error.flatten(),
          timestamp: new Date().toISOString(),
        });
      }

      const session = request.userSession!;
      const { modelId, layerState, clientName, width, height } = parseResult.data;

      // 1. Busca dados do Tenant e Licença
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name, status')
        .eq('id', session.tenantId)
        .single();

      const { data: license } = await supabaseAdmin
        .from('licenses')
        .select('status, expires_at')
        .eq('id', session.licenseId)
        .single();

      // 2. Busca informações do modelo
      const { data: model } = await supabaseAdmin
        .from('apparel_models')
        .select('title, category')
        .eq('id', modelId)
        .single();

      const modelTitle = model?.title || 'Uniforme Esportivo Pro';
      const tenantName = tenant?.name || 'Confecção & Uniformes';

      // 3. Aplica regra de marca d'água no servidor
      const applyWatermark = shouldApplyWatermark({
        tenantStatus: tenant?.status || 'active',
        licenseStatus: license?.status || 'active',
        licenseExpiresAt: license?.expires_at || new Date().toISOString(),
      });

      // 4. Gera composição vetorial server-side
      const svgBoard = generateServerSalesBoardSvg({
        layerState,
        modelTitle,
        clientName,
        tenantName,
        applyWatermark,
      });

      const exportId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const fileName = `${session.tenantId}/exports/${exportId}_board.svg`;

      // 5. Upload no Supabase Storage
      try {
        await supabaseAdmin.storage
          .from('mockup-exports')
          .upload(fileName, Buffer.from(svgBoard, 'utf-8'), {
            contentType: 'image/svg+xml',
            upsert: true,
          });
      } catch {
        // Fallback caso storage mock
      }

      const boardUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgBoard)}`;
      const processingTime = Date.now() - startTime;

      // 6. Salva registro na tabela mockup_exports com LayerState serializado
      const { data: record, error: dbError } = await supabaseAdmin
        .from('mockup_exports')
        .insert({
          tenant_id: session.tenantId,
          seller_id: session.sub,
          user_id: session.sub,
          client_name: clientName,
          layer_state: layerState,
          front_png_url: boardUrl,
          back_png_url: boardUrl,
          sales_board_url: boardUrl,
          combined_png_url: boardUrl,
          status: 'completed',
          width,
          height,
          processing_time_ms: processingTime,
          watermark_applied: applyWatermark,
        })
        .select()
        .single();

      if (dbError) {
        request.log.error(dbError, 'Erro ao salvar registro de exportação no banco');
      }

      return reply.status(200).send({
        success: true,
        exportId: record?.id || exportId,
        frontPngUrl: boardUrl,
        backPngUrl: boardUrl,
        salesBoardUrl: boardUrl,
        watermarkApplied: applyWatermark,
        processingTimeMs: processingTime,
        layerState,
      });
    }
  );

  /**
   * GET /api/v1/exports/:id
   * Recupera o LayerState completo de uma proposta exportada para reabrir no Studio
   */
  fastify.get(
    '/:id',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = request.userSession!;

      const { data: record, error } = await supabaseAdmin
        .from('mockup_exports')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', session.tenantId)
        .single();

      if (error || !record) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          code: 'EXPORT_NOT_FOUND',
          message: 'Proposta comercial não encontrada',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.status(200).send(record);
    }
  );

  /**
   * GET /api/v1/exports
   * Lista o histórico de exportações do tenant
   */
  fastify.get(
    '/',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const session = request.userSession!;

      const { data: exportsList, error } = await supabaseAdmin
        .from('mockup_exports')
        .select('*, seller:profiles(full_name, email)')
        .eq('tenant_id', session.tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          code: 'FETCH_EXPORTS_ERROR',
          message: 'Erro ao buscar histórico de exportações',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.status(200).send({ exports: exportsList });
    }
  );
}
