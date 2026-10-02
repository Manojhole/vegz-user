# Vegz Deployment

## Components
- Android customer app: Expo/React Native in the repository root.
- Customer web: web/.
- API: backend/.
- MySQL: production-managed MySQL or a private MySQL instance.
- Public API hostname: api.vegz.online.

## Required production environment
Backend:
- DATABASE_URL
- JWT_SECRET (long random secret)
- CORS_ORIGINS (comma-separated exact web/app origins)
- PORT

Never commit production secrets.

## Initial AWS layout
For an early low-traffic launch, use a private MySQL service and one Ubuntu API host behind Nginx/HTTPS. Keep MySQL off the public internet. Store backups outside the application host.

## Web deployment
Build web/ and serve dist/ with Nginx or deploy the container from web/Dockerfile. Set VITE_API_BASE_URL to https://api.vegz.online at build time.

## API deployment
Build backend with npm run build and run npm start. Put HTTPS termination in front of the API. Run migrations/schema setup before the application starts.

## Security checklist
- HTTPS only
- Strong JWT secret
- Database credentials from a secret store
- MySQL private network only
- Restrictive security groups
- Exact CORS origins
- Rate limiting/WAF before public launch
- Automated database backups
- Centralized logs and monitoring
- Payment provider webhook signature verification
- Idempotency for payment/order creation
- Reconciliation before settlement
- Do not treat client-side payment success as authoritative

## Payment
The current repository creates orders with PAYMENT_PENDING. A real payment provider adapter must be configured before production checkout is enabled. Do not mark payments PAID from the mobile/web client.

## Operational roles
The API now supports customer, shop, agent and admin roles. Shop product APIs, shop order status, agent delivery status and admin dashboard/order APIs are available for the next role-specific clients.