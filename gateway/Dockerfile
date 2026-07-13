# Built from the repository root: docker build -f gateway/Dockerfile .
FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY gateway ./gateway

RUN npm install --no-audit --no-fund \
  && npm run build -w @ecom/config \
  && npm run build -w @ecom/logger \
  && npm run build -w @ecom/http \
  && npm run build -w @ecom/events \
  && npm run build -w @ecom/gateway

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "gateway/dist/main.js"]
