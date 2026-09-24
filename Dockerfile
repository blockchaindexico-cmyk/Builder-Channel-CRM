# syntax=docker/dockerfile:1.7
# Production images (M01-27):
#   docker build --target web     -t crm-web .      → Next.js standalone server (port 3000)
#   docker build --target worker  -t crm-worker .   → background worker (single self-contained bundle)
#   docker build --target migrate -t crm-migrate .  → one-off release tasks: `pnpm db:deploy` (default), `pnpm db:seed`

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/corepack
# Pin pnpm into a shared Corepack home so no user needs network access to run pnpm at runtime.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate && chmod -R a+rX /corepack
WORKDIR /app

# All dependencies (build tooling, Prisma CLI, tsx).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm rebuild esbuild @prisma/engines prisma

FROM deps AS source
COPY . .
RUN pnpm db:generate

FROM source AS build
# Build-time placeholder only (validation stays on so defaults apply); runtime images never see it.
ENV NODE_ENV=production DATABASE_URL=postgresql://build:build@localhost:5432/build \
  BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime-0000
RUN pnpm build && pnpm build:worker

FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]

# The worker is a single self-contained esbuild bundle: no node_modules needed at runtime.
FROM node:22-alpine AS worker
ENV NODE_ENV=production SERVICE_NAME=worker
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/worker ./dist/worker
USER node
CMD ["node", "dist/worker/index.mjs"]

FROM source AS migrate
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node
CMD ["pnpm", "db:deploy"]
