# The Jury Forge image (WP 1-12; technical-approach §3.13). One image runs the `migrate`, `app`, and
# `worker` containers: `docker run <image> <command>`. It is built for linux/amd64 and linux/arm64,
# runs as the distroless `nonroot` user, works with a read-only root filesystem (only /tmp is
# written), and holds plain JavaScript: the build emits `dist/` from the TypeScript sources
# (technical-approach §3.1). Base images are pinned by multi-arch digest; Renovate updates them.

ARG BUILD_IMAGE=node:24-trixie-slim@sha256:4d00acb4bcc42c454c4eb801526f7ad7f772ea3bd4fd168c5cc2e384abcbb9d4
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:675c532423b908f9e56f9d60a4e62309b63cd2a3175acb90a46b96f7ee68e121

FROM ${BUILD_IMAGE} AS build
WORKDIR /src
# pnpm is the version the root package.json pins (packageManager), fetched and verified by corepack.
RUN corepack enable
# Manifests first, so the dependency layer is cached until a manifest or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY packages/contracts/package.json packages/contracts/
COPY packages/crypto/package.json packages/crypto/
COPY packages/domain/package.json packages/domain/
COPY packages/forge/package.json packages/forge/
COPY packages/gateway/package.json packages/gateway/
COPY packages/parsing/package.json packages/parsing/
COPY packages/pipeline/package.json packages/pipeline/
COPY packages/store/package.json packages/store/
COPY packages/testkit/package.json packages/testkit/
# Install scripts stay denied (pnpm-workspace.yaml allowBuilds); the image needs none.
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
# Production dependencies of the server and the workspace packages it uses, without sources or
# tests; then point each workspace package at its emitted JavaScript.
RUN pnpm --filter @jury-forge/server deploy --prod /out \
  && node scripts/apply-publish-config.ts /out

FROM ${RUNTIME_IMAGE}
WORKDIR /app
# Root-owned and read-only to the nonroot user that runs it.
COPY --from=build /out /app
USER nonroot
ENV NODE_ENV=production
ENTRYPOINT ["/nodejs/bin/node", "/app/dist/main.js"]
