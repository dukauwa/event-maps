# Persistent deployment: one container, one SQLite file on a mounted volume.
# docker build -t tessera . && docker run -p 3000:3000 -v tessera-data:/data tessera
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/app.db UPLOADS_DIR=/data/uploads PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY package.json next.config.ts ./
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000
CMD ["pnpm", "start"]
