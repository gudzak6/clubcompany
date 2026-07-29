FROM node:22-slim AS builder

WORKDIR /app

ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}

RUN apt-get update -y \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

RUN npm ci --no-audit --no-fund

COPY . .

RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build:client && npm run build:server


FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV BASE_PATH=/

RUN apt-get update -y \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "--experimental-specifier-resolution=node", "server/dist/index.js"]
