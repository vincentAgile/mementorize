# syntax=docker/dockerfile:1

# Mementorize API: multi-stage image. Built from the repository root
# (the monorepo is the build context), usually through docker compose:
#
#   docker build -f apps/api/Dockerfile --target runtime -t mementorize-api .
#   docker build -f apps/api/Dockerfile --target migrate -t mementorize-migrate .
#
# Stages: base -> prune -> build -> migrate (one-shot: applies migrations)
#                                -> runtime (the API itself, default target)

ARG NODE_VERSION=24

# --- base: Node, pnpm (version from "packageManager" in package.json, via
# Corepack) and openssl, which Prisma's migration engine links against.
FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache openssl
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# No "Corepack is about to download pnpm, continue?" question during the build.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- prune: keeps only what the api needs from the monorepo. --docker splits
# the result in two: out/json (package.json files + pruned lockfile) and
# out/full (sources), so that dependencies are installed in a layer that
# only changes when the lockfile changes, not on every source edit.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@^2 prune api --docker

# --- build: installs everything (dev dependencies included), compiles, then
# extracts a production-only copy of the api into /app.
FROM base AS build
# prisma.config.ts reads DATABASE_URL even for `prisma generate`, which never
# connects. A placeholder for this stage only: it doesn't reach the runtime image.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY --from=prune /repo/out/json/ .
# The api's postinstall runs `prisma generate`, which needs the schema.
COPY --from=prune /repo/out/full/apps/api/prisma ./apps/api/prisma
COPY --from=prune /repo/out/full/apps/api/prisma.config.ts ./apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm --filter api build
# pnpm deploy: copies the package (only the paths listed in "files") and
# installs its production dependencies in /app. --legacy: the workspace
# doesn't use injected packages (pnpm >= 10 asks for it explicitly).
# The Prisma client is generated code: it has to be generated again next to
# the @prisma/client installed in /app, with the CLI of this stage.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter api deploy --prod --legacy --ignore-scripts /app \
    && cd /app && /repo/apps/api/node_modules/.bin/prisma generate

# --- migrate: `prisma migrate deploy`, run once before the API starts
# (service "migrate" in docker-compose.yml). Based on the build stage: the
# Prisma CLI and its migration engine are dev dependencies, which the
# runtime image leaves out.
FROM build AS migrate
WORKDIR /repo/apps/api
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# --- runtime: compiled code + production dependencies, nothing else (no
# sources, no build tools). Files stay owned by root and the process runs as
# the unprivileged "node" user: the app can't modify its own code.
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
