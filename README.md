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

## Run locally with Python (SQLite; no MySQL required)

Python 3.11+ is recommended. Run these commands from the repository root:

    python3 -m venv .venv
    # macOS/Linux
    source .venv/bin/activate
    # Windows PowerShell: .venv\\Scripts\\Activate.ps1
    pip install -r backend/requirements.txt
    cp backend/.env.example .env
    uvicorn backend.app.main:app --reload --port 8003

The example environment uses SQLite, so you do not need to install or start MySQL. The local database file `vegz.db` is created in the directory from which Uvicorn is started. Open the customer app at http://localhost:8003, API docs at http://localhost:8003/docs, and health check at http://localhost:8003/api/health.

If you prefer MySQL, set `DATABASE_URL` in your root `.env` to a valid MySQL SQLAlchemy URL and ensure the server is running, the database exists, and the configured account has table-creation permissions. A refused connection to `127.0.0.1:3306` means no MySQL server is accepting connections there.

## Android and web

The frontend is a PWA with a manifest and static-asset service worker. On Android, open the deployed HTTPS site in Chrome and choose **Install app** or **Add to Home screen**.

A native Android WebView shell is also included under the `android/` folder. Open that folder in Android Studio with JDK 17 and Android SDK 35 installed. It loads `https://vegz.online` by default; change `WEB_APP_URL` in `android/app/build.gradle` for a staging environment. Build an APK from Android Studio or run `gradle assembleDebug` after installing compatible Gradle 8.7+ and configuring the Android SDK. The shell is only a client container; customer screens and business APIs remain in the web/Python application. The APK has not been built in this environment.

HTTPS is required for PWA installation and is enforced by the Android shell. The vegz.online DNS and hosting are not configured by this repository commit.

## API and database

- API root: same-origin /api (for example, https://vegz.online/api/products).
- Database tables: users, otp_sessions, products, addresses, orders, and order_items.
- The customer module can share this same database with future shop, delivery-agent and admin modules. Those modules and their role-specific endpoints are not implemented in this first release.
- Product prices and stock are checked server-side during order creation. Delivery pricing comes from /api/store-config.
- When `SHOP_SERVICE_URL`, `SHOP_INTERNAL_TOKEN`, `AGENT_SERVICE_URL`, and `DISPATCH_SHARED_SECRET` are configured, the customer catalog syncs from open shops, mixed-shop checkout creates a suborder per shop, and one delivery assignment carries each shop as a pickup stop.
- Configure `SHOP_INTERNAL_TOKEN` identically in vegz-user and vegz-shop, and `DISPATCH_SHARED_SECRET` identically in vegz-user and vegz-agent. For local processes, use shop port 8002 and agent port 8001; for Docker, use private service DNS names instead of localhost.

## Before production

- Set APP_ENV=production, a strong unique JWT_SECRET, a separate strong OTP_SECRET, and the production MySQL DATABASE_URL. Do not use the example values.
- Configure AWS SNS OTP delivery for testing by setting `OTP_PROVIDER=sns`, `AWS_REGION`, and `OTP_MESSAGE_TEMPLATE` in your untracked root `.env`. Install dependencies with `pip install -r backend/requirements.txt`. Supply AWS credentials through your local AWS profile / `aws configure` or an attached IAM role (never commit credentials). The SNS principal needs permission to publish SMS, and SNS SMS sandbox accounts can message only verified destination numbers. The default development configuration continues to return a demo OTP unless `OTP_PROVIDER=sns` is selected.
- Integrate a payment gateway (for example, Razorpay) and verify signed payment callbacks before marking orders paid. The current online option creates an order with payment status pending; it does **not** collect money yet.
- Add schema migrations, production rate limiting, monitoring/backups, a TLS reverse proxy, and secrets management.
- Point vegz.online DNS to your hosting provider and configure HTTPS there. Domain and hosting have not been configured by this repository commit.
- Connect live delivery-agent status/GPS and shop inventory updates. Tracking currently shows the order status stored by the API, not live GPS.

## Important note

This is the first customer-facing MVP scaffold pushed to the repository. Prices and stock quantities are seed/demo data and should be replaced with actual shop inventory and pricing before orders are accepted from the public.


## Multi-shop integration configuration

Copy the integration variables from `backend/.env.example` into the root `.env` and set the same strong random secrets in the corresponding shop and agent `.env` files. Keep all service URLs private to the EC2 Docker network in production. The apps use separate database schemas/services; do not point their independent models at one shared database without a reviewed migration plan.
