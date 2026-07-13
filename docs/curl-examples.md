# curl examples

All examples go through the gateway (`http://localhost:8080`). Every response echoes an `x-correlation-id` header you can grep across all service logs.

```bash
BASE=http://localhost:8080

# Register (asynchronously provisions profile + welcome notification)
curl -s -X POST $BASE/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","password":"Str0ngPass!"}'

# Login and capture the access token (requires jq)
TOKEN=$(curl -s -X POST $BASE/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","password":"Str0ngPass!"}' \
  | jq -r .data.tokens.accessToken)

# Browse products: search + price filter + sort + pagination
curl -s "$BASE/api/v1/products?search=keyboard&minPriceCents=1000&sort=priceCents&order=asc&page=1&limit=10"

# Create an order — Idempotency-Key is mandatory; rerunning the exact same
# command returns the same order with an `x-idempotent-replay: true` header.
curl -s -X POST $BASE/api/v1/orders \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: demo-order-0001' \
  -d '{"items":[{"productId":"a1000000-0000-4000-8000-000000000001","quantity":2}]}'

# My orders
curl -s "$BASE/api/v1/orders" -H "authorization: Bearer $TOKEN"

# Notifications generated from the events
curl -s "$BASE/api/v1/notifications" -H "authorization: Bearer $TOKEN"

# Batch analytics ingestion (anonymous allowed)
curl -s -X POST $BASE/api/v1/events \
  -H 'content-type: application/json' \
  -d '{"events":[{"type":"page.view","payload":{"remote":"catalog"}}]}'

# Admin flows
ADMIN=$(curl -s -X POST $BASE/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin123!"}' \
  | jq -r .data.tokens.accessToken)

# Move an order through its lifecycle (PENDING -> PAID -> SHIPPED -> DELIVERED)
curl -s -X PATCH "$BASE/api/v1/orders/<ORDER_ID>/status" \
  -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d '{"status":"PAID"}'

# Analytics summary report
curl -s "$BASE/api/v1/reports/summary" -H "authorization: Bearer $ADMIN"

# Aggregate health of every service
curl -s $BASE/health/services
```
