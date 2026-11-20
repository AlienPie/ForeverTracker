# syntax=docker/dockerfile:1
# Build:  podman build -t forevertracker:dev .
ARG NODE_IMAGE=docker.io/library/node:26-slim

# ---- build: install, build apps/web, bundle the CLIs, prune to prod deps ----
FROM ${NODE_IMAGE} AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build \
 && pnpm --filter web bundle:token /app/create-token.mjs
# Production node_modules for apps/web (better-sqlite3 native binary, drizzle-orm)
RUN pnpm --filter web deploy --prod /deploy

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0 \
    BODY_SIZE_LIMIT=8M
WORKDIR /app
# @ft/db's migrations folder is pinned to /app/packages/db/drizzle at build time (same path here).
COPY --from=build /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=build /app/apps/web/build ./build
# Curated quest tags, link overrides and zone data (read at runtime from ./data/curated, or CURATED_DIR).
COPY --from=build /app/data/curated ./data/curated
COPY --from=build /app/create-token.mjs /app/list-tokens.mjs /app/revoke-token.mjs /app/content-sync.mjs ./
COPY --from=build /deploy/node_modules ./node_modules
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
# build/index.js is the app entry (apps/web/entry/index.js): plain-HTTP origin handling, see README.
CMD ["node", "build"]
