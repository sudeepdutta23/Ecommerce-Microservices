# E-commerce Microservices Backend

Production-grade Node.js + TypeScript + PostgreSQL microservices backend designed to pair with a plug-and-play React microfrontend platform (Module Federation). Each microfrontend maps to one bounded-context service; services are independently deployable, independently testable, and communicate through explicit contracts only.

## Architecture

```
                        React shell + remotes (Module Federation)
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  API Gateway/BFF │  :8080  (single origin, CORS,
                              └──────────────────┘          rate limit, correlation id)
     ┌──────────┬───────────┬───────────┼───────────┬──────────────┬────────────┐
     ▼          ▼           ▼           ▼           ▼              ▼            │
  auth:4001  user:4002  catalog:4003 order:4004  notification:4005 analytics:4006
     │          │           │           │           │              │
  auth_db    user_db    catalog_db   order_db   notification_db  analytics_db   (database per service)
     │          │                       │           │              │
     └──────────┴───────── RabbitMQ topic exchange `ecom.events` ──┴─────  (async integration)
```

| Service | Port | Owns | API prefix | Consumed by (frontend) |
|---|---|---|---|---|
| auth-service | 4001 | identity, credentials, sessions (JWT + rotating refresh tokens), RBAC roles | `/api/v1/auth` | shell / login remote |
| user-service | 4002 | profiles, per-microfrontend preferences | `/api/v1/profiles` | account remote |
| catalog-service | 4003 | categories, products, pricing, stock | `/api/v1/products`, `/api/v1/categories` | catalog remote |
| order-service | 4004 | checkout, order lifecycle, idempotency, transactional outbox | `/api/v1/orders` | cart/checkout remote |
| notification-service | 4005 | in-app notification feed (event-driven) | `/api/v1/notifications` | shell notification bell |
| analytics-service | 4006 | frontend event ingestion + domain-event audit log + reporting | `/api/v1/events`, `/api/v1/reports` | all remotes (fire-and-forget) |
| gateway | 8080 | reverse proxy only — no business logic | everything above | single origin for the shell |

### Integration rules (enforced by structure)

- **Database per service.** Six isolated databases; no cross-database foreign keys. References across domains are plain UUIDs (e.g. `orders.user_id`).
- **No shared code except contracts.** Services never import each other. The only shared runtime pieces are infrastructure packages (`packages/*`) and the event contracts in `@ecom/events`.
- **Async-first integration.** `user.registered`, `order.created`, `order.status_changed` flow through a RabbitMQ topic exchange. Consumers are idempotent (unique `source_event_id` / envelope-id primary keys) because delivery is at-least-once.
- **One synchronous call, made resilient.** order-service → catalog-service price/stock validation at checkout (client-supplied prices are never trusted). It uses the shared HTTP client: 3 s timeout, 2 retries with exponential backoff, correlation-id propagation, fails fast with 503 if the catalog is down.
- **Transactional outbox in order-service.** The order row, its items, the idempotency record, and the `order.created` outbox row commit in one transaction; a background worker drains the outbox to RabbitMQ using confirm-channel publishes. Events are published iff the transaction committed.
- **Idempotent writes.** `POST /api/v1/orders` requires an `Idempotency-Key` header; replays return the stored response with `x-idempotent-replay: true` (concurrent duplicates are also handled via the unique constraint).
- **Correlation IDs end-to-end.** Assigned at the gateway, propagated via `x-correlation-id` header, HTTP client, and event envelopes; attached to every log line through AsyncLocalStorage.
- **API versioning.** All routes are under `/api/v1`. Breaking changes ship as `/api/v2` side-by-side; event payload changes ship as new event types (`order.created.v2`).

## Repository layout

```
packages/
  config/           # env loading + zod validation (fail-fast startup)
  logger/           # pino structured logging + AsyncLocalStorage correlation context
  http/             # errors, API envelope, auth/RBAC middleware, validation,
                    # pagination, health router, graceful shutdown, resilient HTTP client
  events/           # event contracts (zod) + RabbitMQ EventBus (publish/subscribe/reconnect)
services/
  auth-service/     # each service: prisma/ (schema, migrations, seed) + src/
  user-service/     #   src/modules/<domain>/{dto,repository,service,controller,routes}.ts
  catalog-service/  #   src/{config,app,main}.ts — transport / domain / persistence separated
  order-service/    #   + src/outbox/worker.ts
  notification-service/
  analytics-service/
gateway/            # reverse-proxy BFF
docker/postgres/    # init script creating the six databases
docs/requests.http  # runnable end-to-end request walkthrough
```

Every service follows the same layered layout: **routes** (transport wiring) → **controller** (HTTP ↔ DTO mapping) → **service** (business rules, framework-free) → **repository** (Prisma, behind an interface). Domain services depend on repository *interfaces*, which is what makes the unit tests run without a database.

## Getting started

### Prerequisites
- Node.js ≥ 20, Docker Desktop

### Option A — everything in Docker

```bash
cp .env.example .env          # optional: change JWT_SECRET etc.
docker compose up --build -d
```

Each service container runs `prisma migrate deploy` on startup, so schemas are created automatically. Then seed reference data (from the host):

```bash
npm install
npm run generate              # prisma generate for all services

# point seeds at the dockerized Postgres
cd services/auth-service    && cp .env.example .env && npm run db:seed && cd ../..
cd services/catalog-service && cp .env.example .env && npm run db:seed && cd ../..
```

Smoke test: `curl http://localhost:8080/health/services`

### Option B — infra in Docker, services on the host (dev loop)

```bash
docker compose up -d postgres rabbitmq
npm install
npm run generate
npm run build:packages        # shared packages must be built once before dev/build

# per service (repeat for each, or use separate terminals):
cd services/auth-service
cp .env.example .env
npm run db:migrate
npm run dev                   # tsx watch
```

Seeded logins: `admin@example.com / Admin123!` (ADMIN) and `user@example.com / User1234!` (USER).

### Tests

```bash
npm test                      # runs vitest suites in all services that have them
```

Unit tests cover the critical domain logic with in-memory repository fakes: auth (registration, login, refresh rotation + reuse detection), orders (catalog pricing, idempotent replay, stock rejection, status state machine), catalog (query/filter semantics).

### Useful URLs
- Gateway: http://localhost:8080 (all `/api/v1/*` routes)
- RabbitMQ management: http://localhost:15672 (guest/guest)
- Per-service health: `GET :<port>/health/live` and `/health/ready`

See [docs/requests.http](docs/requests.http) for a full runnable walkthrough (register → browse → order → notifications → analytics), or the curl examples in [docs/curl-examples.md](docs/curl-examples.md).

**Postman**: import [docs/postman/Ecom-Backend.postman_collection.json](docs/postman/Ecom-Backend.postman_collection.json) plus the [Ecom-Backend-Local environment](docs/postman/Ecom-Backend-Local.postman_environment.json). `Auth > Register`/`Login`/`Admin Login` automatically map tokens into the environment (`accessToken`, `refreshToken`, `adminAccessToken`); every request inherits `Bearer {{accessToken}}` from the collection, admin requests override with `{{adminAccessToken}}`, and test scripts chain `productId`/`orderId`/`notificationId`/`Idempotency-Key` so the folders run top-to-bottom (Collection Runner compatible).

## API conventions

Success envelope:
```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```
Error envelope (stable machine-readable `code`):
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [] } }
```

- Auth: `Authorization: Bearer <accessToken>` (15 min TTL) + rotating refresh tokens (30 days, stored hashed, reuse detection revokes the whole session family).
- Read endpoints support `page`/`limit` (max 100) plus per-resource filters, sorting, and search (`/api/v1/products?search=keyboard&minPriceCents=1000&sort=priceCents&order=asc`).
- Money is integer cents everywhere.

## Adding a new microfrontend + service

1. Scaffold `services/<name>-service` following any existing service (copy user-service as the minimal template).
2. Add its database to `docker/postgres/init.sql` and a compose entry.
3. If it consumes/produces events, add the payload schema to `packages/events/src/contracts.ts` — this is the only shared file that ever changes.
4. Add one route entry in `gateway/src/app.ts`.

Nothing else changes; existing services are untouched.

## Production deployment notes

- **Images**: the Dockerfiles favor simplicity (single stage, dev deps included for Prisma CLI). For production, add a second stage that copies `dist/` + generated Prisma client and runs `npm prune --omit=dev`, and run migrations as a deploy step/job rather than at container start.
- **Databases**: give each service its own Postgres instance/cluster (RDS etc.) — the local single-container/multi-DB setup is a dev convenience that preserves the same isolation boundary.
- **Secrets**: replace `.env` defaults (`JWT_SECRET`, DB credentials, AMQP credentials) with a secret manager. Consider asymmetric JWT signing (RS256: auth-service holds the private key, others verify with the public key) to remove the shared-secret coupling.
- **Reliability**: declare a dead-letter exchange for the consumer queues (handlers currently `nack` without requeue); add a cleanup job for expired refresh tokens, old idempotency keys, and published outbox rows.
- **Scaling**: every service is stateless — scale horizontally behind the gateway. Competing consumers on the same queue scale event processing. The gateway's in-memory rate limiter needs a shared store (Redis) once there is more than one replica.
- **Observability**: logs are structured JSON (pino) with `service` + `correlationId` on every line — ship them to your aggregator; add OpenTelemetry tracing at the middleware/HTTP-client/event-bus seams if you need spans.
- **Stock**: checkout validates stock but does not reserve it (no distributed lock). If overselling matters, add a reservation step in catalog-service driven by `order.created` / compensating events (saga).
