import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import z from '@dpg/schemas';

const candidateEnvPaths = [
    resolve(process.cwd(), 'apps/match-score/.env'),
    resolve(process.cwd(), '.env'),
];

for (const path of candidateEnvPaths) {
    if (existsSync(path)) {
        loadDotenv({ path, override: true });
        break;
    }
}

const MatchScoreServiceEnvSchema = z.object({
    MATCH_SCORE_SERVICE_PORT: z.coerce.number().int().positive().default(5103),
    DPG_SCORING_KEY_ID: z.string().min(1).optional(),
    DPG_SCORING_SECRET: z.string().min(1).optional(),
    BEDROCK_BASE_URL: z.string().url().optional(),
    BEDROCK_API_KEY: z.string().min(1).optional(),
    BEDROCK_REGION: z.string().default('ap-south-1'),
    BEDROCK_MODEL_ID: z.string().default('anthropic.claude-3-haiku-20240307-v1:0'),
    BEDROCK_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),
    BEDROCK_TOP_P: z.coerce.number().min(0).max(1).default(0.9),
    BEDROCK_MAX_TOKENS: z.coerce.number().int().positive().default(400),
    DPG_SCORING_VERSION: z.string().default('v1'),
    DPG_SCORING_PROMPT_VERSION: z.string().default('match-compatibility-v1'),
});

export const env = MatchScoreServiceEnvSchema.parse(process.env);
