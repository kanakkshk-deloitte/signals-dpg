import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import z from '@dpg/schemas';
import jwt from 'jsonwebtoken';

const DashboardUrlQuerySchema = z.object({
    dashboard: z.coerce.number().int().positive().optional(),
});

const DashboardUrlResponseSchema = z.object({
    iframeUrl: z.string(),
});

const DashboardUrlErrorSchema = z.object({
    message: z.string(),
});

export const metabase_dashboard_url: FastifyPluginAsyncZod = async (fastify) => {
    fastify.route({
        method: 'GET',
        url: '/dashboard-url',
        schema: {
            tags: ['metabase'],
            querystring: DashboardUrlQuerySchema,
            response: {
                200: DashboardUrlResponseSchema,
                503: DashboardUrlErrorSchema,
            },
        },
        handler: async (request, reply) => {
            const siteUrl = process.env.METABASE_SITE_URL;
            const secretKey = process.env.METABASE_SECRET_KEY;

            if (!siteUrl || !secretKey) {
                return reply.code(503).send({
                    message: 'Metabase embed is not configured on this API instance.',
                });
            }

            const configuredDashboardId = Number(process.env.METABASE_DASHBOARD_ID ?? '2');
            const dashboardId = request.query.dashboard ?? configuredDashboardId;

            const payload = {
                resource: { dashboard: dashboardId },
                params: {},
                exp: Math.round(Date.now() / 1000) + 10 * 60,
            };

            const token = jwt.sign(payload, secretKey);
            const normalizedSiteUrl = siteUrl.replace(/\/$/, '');
            const iframeUrl = `${normalizedSiteUrl}/embed/dashboard/${token}#bordered=true&titled=true`;

            return reply.send({ iframeUrl });
        },
    });
};
