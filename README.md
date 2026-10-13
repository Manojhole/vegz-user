# Vegz User

Customer-facing Vegz vegetable ordering app. This first release is a monolithic FastAPI + SQLAlchemy backend and responsive installable web app (PWA), designed to support Android browsers and desktop web from one codebase.

## MVP flow

Browse vegetables and prices → add to cart → request/verify mobile OTP → add delivery address → choose Cash on Delivery or online payment → place order → view delivery status.

## Quick start

See the project files for Docker Compose (MySQL) and local Python setup. For local development, the API can use SQLite; set `DATABASE_URL` for MySQL when needed. OTP responses expose a demo code only when `APP_ENV=development`. A real SMS provider and payment gateway must be configured before production use.
