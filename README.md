# Vegz User

Customer-facing Vegz vegetable ordering app. This first release is a **monolithic FastAPI + SQLAlchemy backend** and a responsive, installable web app (PWA). The same frontend works on desktop browsers and Android Chrome; a separate native Android app is not required for the MVP.

## Customer flow

1. Browse vegetable photos, categories, availability, quantities and prices.
2. Add items to the basket and review subtotal, delivery fee and total.
3. Verify a mobile number with OTP.
4. Add or choose a delivery address.
5. Choose Cash on Delivery or online payment.
6. Place an order and view order history/status.

## Run locally with Docker (MySQL)

Docker Compose starts MySQL 8.4 and the monolithic app. Run:

    docker compose up --build

Then open http://localhost:8000. API health is at http://localhost:8000/api/health and API documentation is at http://localhost:8000/docs. The Compose credentials and secrets are for local development only; replace them before any shared environment.

## Run locally with Python

Python 3.11+ is recommended.

    cd backend
    python -m venv .venv
    # Windows: .venv\Scripts\activate
    source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env
    uvicorn app.main:app --reload

The .env.example uses MySQL. For a quick SQLite run, set DATABASE_URL=sqlite:///./vegz.db in your local .env. When using MySQL, make sure the database exists and the configured account has table-creation permissions.

## Android and web

The frontend is a PWA with a manifest and static-asset service worker. On Android, open the deployed HTTPS site in Chrome and choose **Install app** or **Add to Home screen**. HTTPS is required for service-worker/PWA installation on a public domain.

## API and database

- API root: same-origin /api (for example, https://vegz.online/api/products).
- Database tables: users, otp_sessions, products, addresses, orders, and order_items.
- The customer module can share this same database with future shop, delivery-agent and admin modules. Those modules and their role-specific endpoints are not implemented in this first release.
- Product prices and stock are checked server-side during order creation. Delivery pricing comes from /api/store-config.

## Before production

- Set APP_ENV=production, a strong unique JWT_SECRET, a separate strong OTP_SECRET, and the production MySQL DATABASE_URL. Do not use the example values.
- Integrate an approved SMS OTP provider. OTP is intentionally demo-only in development; non-development OTP requests return an explicit error until a provider is configured.
- Integrate a payment gateway (for example, Razorpay) and verify signed payment callbacks before marking orders paid. The current online option creates an order with payment status pending; it does **not** collect money yet.
- Add schema migrations, production rate limiting, monitoring/backups, a TLS reverse proxy, and secrets management.
- Point vegz.online DNS to your hosting provider and configure HTTPS there. Domain and hosting have not been configured by this repository commit.
- Connect live delivery-agent status/GPS and shop inventory updates. Tracking currently shows the order status stored by the API, not live GPS.

## Important note

This is the first customer-facing MVP scaffold pushed to the repository. Prices and stock quantities are seed/demo data and should be replaced with actual shop inventory and pricing before orders are accepted from the public.
