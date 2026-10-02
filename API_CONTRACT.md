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