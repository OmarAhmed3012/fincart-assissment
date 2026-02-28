FROM node:20-alpine AS builder

WORKDIR /monorepo

COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY gateway-api/package.json ./gateway-api/
COPY gateway-worker/package.json ./gateway-worker/
COPY packages/shared/package.json ./packages/shared/

RUN npm install

COPY packages/shared ./packages/shared
COPY gateway-worker ./gateway-worker

RUN npm run build -w @fincart/shared
RUN npm run build -w @fincart/gateway-worker

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /monorepo/gateway-worker/package.json ./
COPY --from=builder /monorepo/gateway-worker/dist ./dist
COPY --from=builder /monorepo/packages/shared/package.json /monorepo/packages/shared/
COPY --from=builder /monorepo/packages/shared/dist /monorepo/packages/shared/dist
COPY --from=builder /monorepo/node_modules ./node_modules
COPY --from=builder /monorepo/packages/shared ./packages/shared

USER node

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "dist/main.js"]
