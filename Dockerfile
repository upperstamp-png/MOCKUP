# ====================================================================
# MULTI-STAGE DOCKERFILE: Mockup B2B Platform (Web + API)
# ====================================================================

# 1. BASE STAGE
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production

# 2. DEPENDENCIES STAGE
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/canvas-engine/package.json ./packages/canvas-engine/
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
RUN npm ci

# 3. BUILDER STAGE
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=dependencies /app/packages/validation/node_modules ./packages/validation/node_modules
COPY --from=dependencies /app/packages/canvas-engine/node_modules ./packages/canvas-engine/node_modules
COPY --from=dependencies /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules

COPY . .

# Build packages first
RUN npm run build --workspace=@mockup/types
RUN npm run build --workspace=@mockup/validation
RUN npm run build --workspace=@mockup/canvas-engine
RUN npm run build --workspace=@mockup/api
RUN npm run build --workspace=@mockup/web

# 4. RUNNER API STAGE
FROM node:20-alpine AS api-runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1
CMD ["node", "apps/api/dist/server.js"]

# 5. RUNNER WEB STAGE
FROM node:20-alpine AS web-runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || curl -f http://localhost:3000/ || exit 1
CMD ["npm", "run", "start", "--workspace=@mockup/web"]
