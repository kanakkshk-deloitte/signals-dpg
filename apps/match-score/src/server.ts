import fastify from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
    createJsonSchemaTransform,
    serializerCompiler,
    validatorCompiler,
} from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';
import z, {
    MatchScoreRequestSchema,
    MatchScoreResponseSchema,
} from '@dpg/schemas';
import { BedrockMatchScorer } from '@/bedrock_matcher';
import { env } from '@/env';
import { verifyDpgScoringHeaders } from '@/auth';

const app = fastify({
    logger: true,
    trustProxy: true,
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(fastifySwagger, {
    openapi: {
        info: {
            title: 'DPG Match Score Service',
            description: 'Bedrock-backed DPG score service',
            version: '1.0.0',
        },
    },
    transform: createJsonSchemaTransform({}),
});

await app.register(import('@scalar/fastify-api-reference'), {
    routePrefix: '/api/reference',
});

const scorer = new BedrockMatchScorer({
    region: env.BEDROCK_REGION,
    baseUrl: env.BEDROCK_BASE_URL,
    apiKey: env.BEDROCK_API_KEY,
    modelId: env.BEDROCK_MODEL_ID,
    version: env.DPG_SCORING_VERSION,
    promptVersion: env.DPG_SCORING_PROMPT_VERSION,
    temperature: env.BEDROCK_TEMPERATURE,
    topP: env.BEDROCK_TOP_P,
    maxTokens: env.BEDROCK_MAX_TOKENS,
});

const ErrorResponseSchema = z.object({
    error: z.string().min(1),
    message: z.string().min(1),
});

app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/',
    handler: (_, reply) => {
        reply.send({
            service: 'dpg-match-score',
            status: 'ok',
            provider: 'amazon_bedrock',
            model: env.BEDROCK_MODEL_ID,
        });
    },
});

app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/api/v1/scores/match',
    schema: {
        tags: ['match_score'],
        body: MatchScoreRequestSchema,
        response: {
            200: MatchScoreResponseSchema,
            401: ErrorResponseSchema,
            502: ErrorResponseSchema,
        },
    },
    handler: async (request, reply) => {
        if (env.DPG_SCORING_KEY_ID && env.DPG_SCORING_SECRET) {
            const verified = verifyDpgScoringHeaders({
                request,
                keyId: env.DPG_SCORING_KEY_ID,
                secret: env.DPG_SCORING_SECRET,
            });

            if (!verified) {
                return reply.code(401).send({
                    error: 'UNAUTHORIZED',
                    message: 'Invalid DPG scoring authentication headers',
                });
            }
        }

        try {
            const result = await scorer.score(request.body);
            return reply.code(200).send(result);
        } catch (error) {
            request.log.error({ error }, 'Bedrock match-score request failed');
            return reply.code(502).send({
                error: 'BEDROCK_MATCH_SCORE_FAILED',
                message: 'Could not calculate match score using Amazon Bedrock',
            });
        }
    },
});

await app
    .listen({
        port: env.MATCH_SCORE_SERVICE_PORT,
        host: '0.0.0.0',
    })
    .then((endpoint) => app.log.info(`Server Endpoint: ${endpoint}`))
    .catch((err) => {
        app.log.error(err);
        process.exit(1);
    });

let shuttingDown = false;

async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info(`Shutting down (${signal})`);

    try {
        await app.close();
    } catch (err) {
        app.log.error(err);
    } finally {
        process.exit(0);
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
