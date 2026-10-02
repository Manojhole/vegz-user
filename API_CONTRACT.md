# Vegz Shared API Contract

The Android customer app and the future Vegz web app use the same backend API.

Base URL:
- Development: http://localhost:4000
- Production: https://api.vegz.online

## Authentication

POST /api/auth/register
POST /api/auth/login

Authenticated requests send:
Authorization: Bearer <JWT>

## Products

GET /api/products
GET /api/products/:id

## Orders

POST /api/orders
GET /api/orders

The backend calculates the order total from current database prices inside a transaction. Clients must not be trusted to provide the final price.

## Health

GET /health

## CORS

Set CORS_ORIGINS to the exact production web origins, comma-separated. Do not use * in production.

## Payment

Payment provider integration must be server-side with secret keys, signature/webhook verification, idempotency and reconciliation. A mobile/web payment-success callback alone must never be treated as settlement.
## Marketplace role APIs
- GET /api/me (authenticated)
- GET /api/orders/:id (customer sees own order; staff/admin can inspect)
- POST /api/shop/products (shop/admin)
- PATCH /api/shop/products/:id (shop/admin)
- PATCH /api/shop/orders/:id/status (shop/admin)
- PATCH /api/agent/orders/:id/status (agent/admin)
- GET /api/admin/dashboard (admin)
- GET /api/admin/orders (admin)

## Order/payment safety
Orders accept an optional Idempotency-Key header. Prices and stock are calculated and locked server-side. Orders start in PAYMENT_PENDING. A payment provider must verify provider signatures/webhooks before payment_status becomes PAID; the client must never be trusted to declare payment success.