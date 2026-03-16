#  Stage 1: deps 
FROM node:20-alpine AS deps

# Native module build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

#  Stage 2: builder 
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

#  Stage 3: runner 
FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/public                              ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static  ./.next/static

# The Next standalone output already includes the sqlite/sqlite3 runtime modules
# required by the app, so no extra native dependency copies are needed here.

# Data directory for SQLite
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

# Environment variables (override at runtime)
ENV PORT=4000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/logs.db

EXPOSE 4000

VOLUME ["/data"]

CMD ["node", "server.js"]
