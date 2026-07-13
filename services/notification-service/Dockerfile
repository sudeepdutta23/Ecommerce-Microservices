# Built from the repository root: docker build -f services/notification-service/Dockerfile .
FROM node:20-alpine

# Prisma's query/schema engines require OpenSSL, which node:20-alpine omits.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/notification-service ./services/notification-service

RUN npm install --no-audit --no-fund \
  && npx prisma generate --schema services/notification-service/prisma/schema.prisma \
  && npm run build -w @ecom/config \
  && npm run build -w @ecom/logger \
  && npm run build -w @ecom/http \
  && npm run build -w @ecom/events \
  && npm run build -w @ecom/notification-service

ENV NODE_ENV=production
EXPOSE 4005
CMD ["sh", "-c", "npx prisma migrate deploy --schema services/notification-service/prisma/schema.prisma && node services/notification-service/dist/main.js"]
