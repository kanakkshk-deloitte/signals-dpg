import { resolve } from 'node:path';

import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/server.ts'],
    tsconfig: './tsconfig.json',
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    dts: false,
    esbuildOptions(options) {
        options.alias = {
            ...options.alias,
            '@': resolve('src'),
        };
    },
    external: [
        'fastify',
        '@fastify/swagger',
        '@scalar/fastify-api-reference',
        'fastify-type-provider-zod',
        '@aws-sdk/client-bedrock-runtime',
        'dotenv',
        'pg',
        'pg/*',
    ],
});
