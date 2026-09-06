# VibeVision API (NestJS + drizzle/better-sqlite3). Build context = repo root
# (Coolify dockerfile build pack). SQLite lives on a persistent volume.
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++ && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter vibevision-api

FROM deps AS build
COPY backend ./backend
RUN pnpm --filter vibevision-api build

FROM node:22-alpine AS prod-deps
RUN apk add --no-cache python3 make g++ && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --prod --filter vibevision-api

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app/backend
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /app/backend/node_modules /app/backend/node_modules
COPY --from=build --chown=nodejs:nodejs /app/backend/dist /app/backend/dist
COPY --from=build --chown=nodejs:nodejs /app/backend/drizzle /app/backend/drizzle
COPY --from=build --chown=nodejs:nodejs /app/backend/package.json /app/backend/package.json
RUN mkdir -p /data && chown nodejs:nodejs /data
USER nodejs
VOLUME ["/data"]
EXPOSE 3101
ENV PORT=3101 DATABASE_PATH=/data/vibevision.sqlite
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3101')+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
