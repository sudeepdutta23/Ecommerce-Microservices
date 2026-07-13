# Built from the repository root: docker build -f services/auth-service/Dockerfile .
FROM node:20-alpine

# Prisma's query/schema engines require OpenSSL, which node:20-alpine omits.
RUN apk add --no-cache openssl

WORKDIR /app

# Only this service and the shared packages are copied; the workspace globs
# simply won't match the absent services, keeping images independent.
# NODE_ENV is set only after the build: devDependencies (typescript, prisma
# CLI) are needed at build time.
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/auth-service ./services/auth-service

RUN npm install --no-audit --no-fund \
  && npx prisma generate --schema services/auth-service/prisma/schema.prisma \
  && npm run build -w @ecom/config \
  && npm run build -w @ecom/logger \
  && npm run build -w @ecom/http \
  && npm run build -w @ecom/events \
  && npm run build -w @ecom/auth-service

ENV NODE_ENV=production
EXPOSE 4001
CMD ["sh", "-c", "npx prisma migrate deploy --schema services/auth-service/prisma/schema.prisma && node services/auth-service/dist/main.js"]
