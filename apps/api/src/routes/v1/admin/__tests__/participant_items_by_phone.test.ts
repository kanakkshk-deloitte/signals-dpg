import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';

vi.mock('@/config', () => ({
    apiConfig: {
        domain: 'http://source.local',
        port: 3000,
        served_domains: [{ network: 'purple_dot', domain: 'person_with_disability' }],
        network_config_source: 'local',
        network_config_local_file: '',
        network_config_urls: [],
        allow_extra_schema_data: true,
        schema_registry_url: '',
    },
    authConfig: {
        secret: 'test-secret',
        middleware_enabled: false,
        url: 'http://source.local/api/auth',
        create_test_otp: false,
    },
    databasesConfig: {
        pg_url: 'postgres://localhost/test',
    },
    getCurrentApiBaseUrl: () => 'http://source.local',
    instance: { INSTANCE_NAME: 'test', INSTANCE_ENV: 'development' },
    api: { API_DOMAIN: 'http://source.local', API_PORT: 3000 },
    auth: {},
    databases: {},
    matchScore: {},
    notification: {},
    networkRuntime: {},
    schemaRegistry: {},
}));

const selectMock = vi.fn();

vi.mock('@api/db/postgres/drizzle_config', () => ({
    db: {
        select: (...args: unknown[]) => selectMock(...args),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('@/utils/item_decrypt', () => ({
    decryptItemPrivate: (row: { item_state: Record<string, unknown> }) => ({ mergedState: row.item_state }),
}));

function mockEmptyRows() {
    const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
    };
    selectMock.mockReturnValue(chain);
}

function mockRows(rows: Array<Record<string, unknown>>) {
    const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(rows),
    };
    selectMock.mockReturnValue(chain);
}

async function buildApp(orgType: 'aggregator' | 'network_service' | 'voice' | null) {
    const app = Fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    if (orgType) {
        app.addHook('preHandler', async (request) => {
            request.acting_org = {
                org_id: 'org_test',
                org_type: orgType,
                service_user_id: 'usr_test',
            };
        });
    }

    const { participant_items_by_phone } = await import('../participant_items_by_phone');
    await app.register(participant_items_by_phone);
    return app;
}

describe('GET /api/v1/admin/participant/items/by-phone (unit)', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        selectMock.mockReset();
        mockEmptyRows();
        app = await buildApp('network_service');
    });

    it('rejects missing phone_number with 400', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/participant/items/by-phone',
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects missing acting_org with 403', async () => {
        const app2 = await buildApp(null);
        const res = await app2.inject({
            method: 'GET',
            url: '/participant/items/by-phone?phone_number=919999999999',
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('INVALID_ACTING_ORG');
    });

    it('rejects voice acting org with 403', async () => {
        const app2 = await buildApp('voice');
        const res = await app2.inject({
            method: 'GET',
            url: '/participant/items/by-phone?phone_number=919999999999',
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('ACTING_ORG_TYPE_NOT_ALLOWED');
    });

    it('returns empty result when no matching items', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/participant/items/by-phone?phone_number=919999999999',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ total: 0, items: [] });
    });

    it('matches query with +91 against local 10-digit item mobile_number', async () => {
        mockRows([
            {
                item_id: '11111111-1111-4111-8111-111111111111',
                item_network: 'purple_dot',
                item_domain: 'person_with_disability',
                item_type: 'profile_1.0',
                created_by: 'usr_111',
                item_state: { mobile_number: '1234123455' },
                item_private_state: '',
                item_locations: [],
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                updated_at: new Date('2026-01-01T00:00:00.000Z'),
            },
        ]);

        const res = await app.inject({
            method: 'GET',
            url: '/participant/items/by-phone?phone_number=%2B911234123455',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().total).toBe(1);
        expect(res.json().items[0].created_by).toBe('usr_111');
    });

    it('matches query without +91 against +91 item mobile_number', async () => {
        mockRows([
            {
                item_id: '22222222-2222-4222-8222-222222222222',
                item_network: 'purple_dot',
                item_domain: 'person_with_disability',
                item_type: 'profile_1.0',
                created_by: 'usr_222',
                item_state: { mobile_number: '+919258202617' },
                item_private_state: '',
                item_locations: [],
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                updated_at: new Date('2026-01-01T00:00:00.000Z'),
            },
        ]);

        const res = await app.inject({
            method: 'GET',
            url: '/participant/items/by-phone?phone_number=9258202617',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().total).toBe(1);
        expect(res.json().items[0].created_by).toBe('usr_222');
    });

    it('matches when phone is stored under phone instead of mobile_number', async () => {
        mockRows([
            {
                item_id: '33333333-3333-4333-8333-333333333333',
                item_network: 'purple_dot',
                item_domain: 'person_with_disability',
                item_type: 'profile_1.0',
                created_by: 'usr_333',
                item_state: { phone: '9258202617' },
                item_private_state: '',
                item_locations: [],
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                updated_at: new Date('2026-01-01T00:00:00.000Z'),
            },
        ]);

        const res = await app.inject({
            method: 'GET',
            url: '/participant/items/by-phone?phone_number=9258202617',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().total).toBe(1);
        expect(res.json().items[0].created_by).toBe('usr_333');
    });
});
