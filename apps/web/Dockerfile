# syntax=docker/dockerfile:1

# Mementorize web (Next.js): multi-stage image. Built from the repository
# root (the monorepo is the build context), usually through docker compose:
#
#   docker build -f apps/web/Dockerfile -t mementorize-web .
#
# Stages: base -> prune -> build -> runtime

ARG NODE_VERSION=24

# --- base: Node and pnpm (version from "packageManager", via Corepack).
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# No "Corepack is about to download pnpm, continue?" question during the build.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- prune: keeps only what the web app needs from the monorepo (see the
# api's Dockerfile for the out/json + out/full split).
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@^2 prune web --docker

# --- build: `next build` with output: 'standalone' (next.config.ts) also
# writes .next/standalone, a self-contained server with only the
# node_modules files it actually uses.
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm --filter web build

# --- runtime: the standalone server and the static assets (which Next.js
# leaves out of standalone/, as a CDN would normally serve them).
# API_URL is read when the server runs, not when it's built: the same image
# works whatever the API's address (set by docker-compose.yml).
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
# Listen on every interface: by default the server would only answer
# inside the container.
ENV HOSTNAME=0.0.0.0
WORKDIR /app
# Owned by "node": the server writes its cache under .next/ at runtime.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
