#!/usr/bin/env node

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const sourceEnvFile = resolve(
    root,
    process.env.ENV_FILE ?? 'apps/match-score/.env'
);
const image = process.env.MATCH_SCORE_IMAGE ?? 'dpg-match-score:local';
const containerName =
    process.env.MATCH_SCORE_CONTAINER_NAME ?? 'dpg-match-score';
const port = process.env.MATCH_SCORE_SERVICE_PORT ?? '5103';
const network = process.env.DOCKER_NETWORK;
const shouldBuild = process.env.SKIP_BUILD !== 'true';

function normalizeEnvValue(value) {
    const trimmed = value.trim();
    if (trimmed.length < 2) return trimmed;

    const first = trimmed[0];
    const last = trimmed.at(-1);

    if (
        (first === '"' && last === '"') ||
        (first === "'" && last === "'")
    ) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function createDockerEnvFile() {
    const contents = readFileSync(sourceEnvFile, 'utf8');
    const entries = new Map();

    for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const assignment = trimmed.startsWith('export ')
            ? trimmed.slice('export '.length).trim()
            : trimmed;
        const separatorIndex = assignment.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = assignment.slice(0, separatorIndex).trim();
        const value = normalizeEnvValue(assignment.slice(separatorIndex + 1));
        if (!key) continue;

        entries.set(key, value);
    }

    const lines = [...entries.entries()].map(([key, value]) => `${key}=${value}`);
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'dpg-match-score-env-'));
    const dockerEnvFile = resolve(tmpDir, 'match-score.env');
    writeFileSync(dockerEnvFile, `${lines.join('\n')}\n`);
    return dockerEnvFile;
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        stdio: 'inherit',
    });

    if (result.error) {
        console.error(`Failed to run ${command}:`, result.error.message);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

if (shouldBuild) {
    run('docker', ['build', '-f', 'apps/match-score/Dockerfile', '-t', image, '.']);
}

const dockerEnvFile = createDockerEnvFile();
const runArgs = [
    'run',
    '--rm',
    '--name',
    containerName,
    '--env-file',
    dockerEnvFile,
    '-p',
    `${port}:5103`,
];

if (network) {
    runArgs.push('--network', network);
} else {
    runArgs.push('--add-host=host.docker.internal:host-gateway');
}

runArgs.push(image);
run('docker', runArgs);
