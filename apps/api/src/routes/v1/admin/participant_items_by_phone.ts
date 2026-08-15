import type {
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
} from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@api/db/postgres/drizzle_config';
import { items } from '@dpg/database';
import { user } from '../../../../db/postgres/schema/auth.js';
import {
    GetParticipantItemsByPhoneRequest as GetParticipantItemsByPhoneRequestSchema,
    GetParticipantItemsByPhoneResponse,
    type GetParticipantItemsByPhoneRequest as GetParticipantItemsByPhoneQueryType,
} from '@dpg/schemas';
import { decryptItemPrivate } from '@/utils/item_decrypt';
import { apiConfig } from '@/config';

type GetItemsByPhoneRequestType = FastifyRequest<{
    Querystring: GetParticipantItemsByPhoneQueryType;
}>;

export const participant_items_by_phone: FastifyPluginAsync = async (app) => {
    app.route({
        url: '/participant/items/by-phone',
        method: 'GET',
        schema: {
            tags: ['admin'],
            querystring: GetParticipantItemsByPhoneRequestSchema,
            response: { 200: GetParticipantItemsByPhoneResponse },
        },
        handler: participant_items_by_phone_handler,
    });
};

const servedNetworks = (): string[] => {
    const set = new Set<string>();
    for (const d of apiConfig.served_domains) set.add(d.network);
    return Array.from(set);
};

const phoneCandidates = (raw: string): Set<string> => {
    const trimmed = raw.trim();
    const digits = trimmed.replace(/\D/g, '');
    const out = new Set<string>();

    if (trimmed) out.add(trimmed);
    if (digits) out.add(digits);

    // Treat Indian +91 format and local 10-digit format as equivalent.
    if (digits.length === 10) {
        out.add(digits);
        out.add(`91${digits}`);
        out.add(`+91${digits}`);
    }

    if (digits.length === 12 && digits.startsWith('91')) {
        const local10 = digits.slice(-10);
        out.add(local10);
        out.add(`91${local10}`);
        out.add(`+91${local10}`);
    }

    return out;
};

const phonesMatch = (queryPhone: string, itemPhone: string): boolean => {
    const q = phoneCandidates(queryPhone);
    const i = phoneCandidates(itemPhone);

    for (const candidate of i) {
        if (q.has(candidate)) return true;
    }

    return false;
};

const readItemPhone = (state: Record<string, unknown>): string | null => {
    const mobile = state.mobile_number;
    if (typeof mobile === 'string' && mobile.trim().length > 0) {
        return mobile;
    }

    const phone = state.phone;
    if (typeof phone === 'string' && phone.trim().length > 0) {
        return phone;
    }

    return null;
};

export const participant_items_by_phone_handler = async (
    request: GetItemsByPhoneRequestType,
    reply: FastifyReply,
) => {
    if (!request.acting_org) {
        return reply.code(403).send({
            error: 'INVALID_ACTING_ORG',
            message: 'acting_org is required for /admin/participant/items/by-phone',
        });
    }

    if (
        request.acting_org.org_type !== 'aggregator' &&
        request.acting_org.org_type !== 'network_service'
    ) {
        return reply.code(403).send({
            error: 'ACTING_ORG_TYPE_NOT_ALLOWED',
            message: 'only aggregator or network_service acting orgs are allowed',
        });
    }

    const isAggregator = request.acting_org.org_type === 'aggregator';
    const networks = servedNetworks();
    const queryPhone = request.query.phone_number;

    const rows = await db
        .select({
            item_id: items.item_id,
            item_network: items.item_network,
            item_domain: items.item_domain,
            item_type: items.item_type,
            created_by: items.created_by,
            item_state: items.item_state,
            item_private_state: items.item_private_state,
            item_locations: items.item_locations,
            created_at: items.created_at,
            updated_at: items.updated_at,
        })
        .from(items)
        .innerJoin(user, eq(user.id, items.created_by))
        .where(and(
            eq(items.item_network, 'blue_dot'),
            eq(items.item_domain, 'seeker'),
            eq(items.item_type, 'profile_1.0'),
            networks.length > 0 ? inArray(items.item_network, networks) : undefined,
            isAggregator ? eq(user.onboardedByOrgId, request.acting_org.org_id) : undefined,
        ))
        .orderBy(items.created_at);

    const matched = rows.flatMap((row) => {
        const { mergedState } = decryptItemPrivate({
            item_state: row.item_state as Record<string, unknown>,
            item_private_state: row.item_private_state,
        });

        const mobileRaw = readItemPhone(mergedState);
        if (!mobileRaw) {
            return [];
        }

        if (!phonesMatch(queryPhone, mobileRaw)) {
            return [];
        }

        return [{
            item_id: row.item_id,
            item_network: row.item_network,
            item_domain: row.item_domain,
            item_type: row.item_type,
            created_by: row.created_by,
            item_state: mergedState,
            item_locations: row.item_locations,
            created_at: row.created_at.toISOString(),
            updated_at: row.updated_at.toISOString(),
        }];
    });

    return reply.code(200).send({
        total: matched.length,
        items: matched,
    });
};

export default participant_items_by_phone;
