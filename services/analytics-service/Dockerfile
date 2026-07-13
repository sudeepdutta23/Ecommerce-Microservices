# Built from the repository root: docker build -f services/analytics-service/Dockerfile .
FROM node:20-alpine

# Prisma's query/schema engines require OpenSSL, which node:20-alpine omits.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/analytics-service ./services/analytics-service

RUN npm install --no-audit --no-fund \
  && npx prisma generate --schema services/analytics-service/prisma/schema.prisma \
  && npm run build -w @ecom/config \
  && npm run build -w @ecom/logger \
  && npm run build -w @ecom/http \
  && npm run build -w @ecom/events \
  && npm run build -w @ecom/analytics-service

ENV NODE_ENV=production
EXPOSE 4006
CMD ["sh", "-c", "npx prisma migrate deploy --schema services/analytics-service/prisma/schema.prisma && node services/analytics-service/dist/main.js"]
