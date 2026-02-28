FROM node:20-alpine AS builder

WORKDIR /monorepo

COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY gateway-api/package.json ./gateway-api/
COPY gateway-worker/package.json ./gateway-worker/
COPY packages/shared/package.json ./packages/shared/

RUN npm install

COPY packages/shared ./packages/shared
COPY gateway-api ./gateway-api

RUN npm run build -w @fincart/shared
RUN npm run build -w @fincart/gateway-api

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /monorepo/gateway-api/package.json ./
COPY --from=builder /monorepo/gateway-api/dist ./dist
COPY --from=builder /monorepo/node_modules ./node_modules
COPY --from=builder /monorepo/packages/shared ./packages/shared

USER node

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/main.js"]
