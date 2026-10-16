# Vegz User

Customer-facing quick-commerce app for vegetables and everyday groceries from local city shops.

## Stack

- Web: Next.js 15 + TypeScript under `web/`
- Android/iOS client: React Native + Expo Router under `mobile/`
- API: FastAPI + SQLAlchemy under `backend/`
- Databases: SQLite/MySQL in the existing development options; PostgreSQL driver and multi-app Postgres development profile are available for the new stack.

## Customer flow in this dev build

- Browse the shop-backed catalog with photos, categories, stock and prices.
- Add/remove basket quantities and calculate delivery fee/free-delivery threshold.
- Request and verify a phone OTP (development mode returns a demo code; production requires configured SMS).
- Save a delivery address, supported only in Hubli and Dharwad.
- Place a COD order and see order history/status.
- Online payment is labelled pending until a payment gateway is integrated; this code does not collect money.
- Products that are not supplied by an active shop are shown as coming soon rather than pretending they can be purchased.

The customer API communicates with the shop service and creates shop suborders and one multi-shop dispatch through authenticated service-to-service calls when integration secrets and URLs are configured. Each service keeps its own schema. Do not point the separate apps at one database schema without reviewed migrations.

## Run the web app

From this repository root:

```bash
cd web
npm install
NEXT_PUBLIC_VEGZ_API_URL=http://localhost:8003 npm run dev
```

Open `http://localhost:3000`. The customer API should be available at `http://localhost:8003`.

## Run the Expo client

```bash
cd mobile
npm install
npm run android
```

For an Android emulator, the API defaults to `http://10.0.2.2:8003`. For a physical Android device, set `EXPO_PUBLIC_VEGZ_API_URL` to the development computer’s LAN IP and ensure both devices are on the same network. Expo Go or an Android emulator/Android Studio setup is required; this repository does not currently publish an APK.

## Run the complete local stack

The shared PostgreSQL development Compose file is in `../vegz-admin/docker-compose.postgres.yml`. From that directory, after all four repositories are checked out at the desired `dev` revisions:

```bash
docker-compose -f docker-compose.postgres.yml up --build -d
```

It uses a named PostgreSQL volume. Do not use `down -v` or prune volumes if the database contents need to be retained.

## Validation

GitHub Actions on `dev` compiles/tests FastAPI, checks legacy frontend JavaScript, builds the Next.js web app, and type-checks the Expo app.

## Not production-ready yet

- Production SMS OTP provider and security review.
- Payment-gateway checkout, signed webhooks and refunds.
- Live agent GPS, push notifications and robust dispatch/retry handling.
- Schema migrations, operational observability and deployment/DNS configuration.
- Full end-to-end verification against real approved shop inventory.

