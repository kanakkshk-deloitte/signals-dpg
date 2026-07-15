import type { FastifyPluginAsync } from 'fastify';
import { metabase_dashboard_url } from './dashboard_url';

export const metabase_routes: FastifyPluginAsync = async (app) => {
    await app.register(metabase_dashboard_url);
};

export default metabase_routes;
