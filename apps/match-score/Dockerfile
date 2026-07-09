# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat \
    && corepack enable

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV TURBO_TELEMETRY_DISABLED=1
ENV CI=true

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.9.14 prune match-score --docker

FROM base AS deps
WORKDIR /app
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/ ./
COPY --from=pruner /repo/out/full/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=turbo-cache-match-score,target=/app/.turbo \
    pnpm turbo run build --filter=match-score
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

ENV NODE_ENV=production
ENV MATCH_SCORE_SERVICE_PORT=5103
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/package.json ./package.json

COPY --from=builder /app/apps/match-score/package.json ./apps/match-score/package.json
COPY --from=builder /app/packages ./packages

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --filter=match-score...

COPY --from=builder /app/apps/match-score/dist ./apps/match-score/dist

EXPOSE ${MATCH_SCORE_SERVICE_PORT}
USER node

CMD ["node", "apps/match-score/dist/server.js"]
