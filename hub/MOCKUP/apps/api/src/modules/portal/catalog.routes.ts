import { FastifyInstance } from 'fastify';
import { dbQuery } from '../../plugins/db.js';
import { requirePermission, requirePortalAuth } from '../../middleware/portalAuth.js';

export async function portalCatalogRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/catalog/products
  fastify.get(
    '/products',
    { preHandler: [requirePortalAuth, requirePermission('catalog:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { category?: string; search?: string; priceListCode?: string };

      const unitCfgRes = await dbQuery<{ default_price_list_code: string | null }>(
        `SELECT default_price_list_code FROM portal.unit_commercial_configs WHERE unit_id = $1`,
        [ctx.activeUnitId]
      );
      const preferredListCode =
        q.priceListCode?.trim() || unitCfgRes.rows[0]?.default_price_list_code || null;

      const priceListsRes = await dbQuery<{
        id: string;
        code: string;
        name: string;
        version_code: string;
        profile_scope: string;
        valid_from: string;
        valid_until: string | null;
        status: string;
        notes: string | null;
      }>(
        `SELECT id, code, name, version_code, profile_scope, valid_from::text, valid_until::text, status, notes
         FROM portal.price_lists
         WHERE status = 'active'
           AND (valid_until IS NULL OR valid_until >= NOW())
         ORDER BY (code = $1) DESC, valid_from DESC`,
        [preferredListCode || 'KS_TABELA_PADRAO']
      );

      const activePriceList =
        priceListsRes.rows.find((pl) => pl.code === preferredListCode) ||
        priceListsRes.rows[0] ||
        null;

      const conditions = [`p.is_active = TRUE`];
      const params: unknown[] = [activePriceList?.id ?? null];
      let idx = 2;

      if (q.category && q.category !== 'Todos') {
        conditions.push(`p.category = $${idx}`);
        params.push(q.category);
        idx++;
      }
      if (q.search?.trim()) {
        conditions.push(
          `(LOWER(p.name) LIKE $${idx} OR LOWER(p.sku) LIKE $${idx} OR LOWER(p.fabric) LIKE $${idx} OR LOWER(p.description) LIKE $${idx})`
        );
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }

      const productsRes = await dbQuery(
        `SELECT
           p.*,
           pli.supply_price_cents,
           pli.suggested_sale_price_cents,
           pli.unit_cost_cents,
           pli.additional_costs,
           COALESCE(
             (SELECT json_agg(pv ORDER BY pv.size_code)
              FROM portal.product_variants pv
              WHERE pv.product_id = p.id AND pv.is_active = TRUE),
             '[]'::json
           ) AS variants
         FROM portal.products p
         LEFT JOIN portal.price_list_items pli
           ON pli.product_id = p.id AND pli.price_list_id = $1
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.category ASC, p.name ASC`,
        params
      );

      return reply.send({
        activePriceList,
        availablePriceLists: priceListsRes.rows,
        items: productsRes.rows,
        priceGovernanceNote:
          'Os preços exibidos dependem estritamente da tabela vigente configurada para a unidade. Produtos sem custo ou preço de fornecimento definido exibem aviso explícito e não utilizam multiplicadores automáticos inventados.',
      });
    }
  );
}
