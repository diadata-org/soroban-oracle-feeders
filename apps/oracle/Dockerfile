FROM node:21-alpine AS base

FROM base AS builder
WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune oracle-feeder --docker

FROM base AS installer
WORKDIR /app

COPY --from=builder /app/out/json/ .
RUN yarn install --frozen-lockfile

COPY --from=builder /app/out/full/ .
RUN yarn turbo build --filter=oracle-feeder && \
    yarn install --production --ignore-scripts --prefer-offline --frozen-lockfile

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs
USER nodejs
COPY --from=installer /app .

ENV NODE_ENV=production
CMD ["node", "apps/oracle/build/src/index.js"]
