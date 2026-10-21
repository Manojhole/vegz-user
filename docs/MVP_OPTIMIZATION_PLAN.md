# VEGZ User — MVP Optimization Plan

## In-scope before GPS and payment gateway
- Keep checkout honest: show totals and payment method clearly; do not mark online payment as paid without a verified provider callback.
- Add bulk-order request as a separate flow rather than forcing hotel/PG/catering quantities into the household cart.
- Validate stock and prices on the server when an order is created; never trust client-submitted prices.
- Make order creation idempotent to reduce duplicate orders on retries.
- Add pagination/filtering for order history and support tickets before volume grows.
- Add request throttling and resend limits for OTP endpoints; keep OTPs hashed, short-lived and single-use.
- Use production-only secrets from environment and rotate development/demo credentials before deployment.

## B2B bulk-order flow to implement
1. Business submits name, phone, business type, delivery address, required date/time, line items, quantity and unit.
2. API validates units and quantities, saves the request as pending_review, and returns a request ID.
3. Admin reviews sourcing, stock, delivery capacity and quoted price.
4. Business accepts the quote; only then convert it to a confirmed order.
5. Shop/agent workflows receive confirmed fulfilment tasks through authenticated service-to-service APIs.

## Acceptance checks
- Invalid/negative quantities are rejected.
- Customer cannot set arbitrary prices or mark an order paid.
- Repeated submission with the same idempotency key does not create duplicate orders.
- Bulk requests cannot be mistaken for confirmed/paid orders.
- Tests cover empty catalog, unavailable stock, price changes and concurrent checkout.
