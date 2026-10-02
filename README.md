# 🥬 Vegz User

**Vegz User** is the customer-facing Android application for the Vegz vegetable quick-commerce platform.

The app is designed to help end users discover fresh vegetables, place orders, make secure payments, and track deliveries through a simple mobile shopping experience.

## 🎯 Purpose

Vegz User connects customers with the Vegz marketplace so they can:

- Browse vegetables and categories
- Search and filter products
- View product details and prices
- Select quantities
- Add products to cart
- Manage delivery addresses
- Checkout and make payments
- Receive order confirmation
- Track orders and delivery status
- View order history and order details
- Manage profile and settings
- Access help and support

## 🛒 Customer Order Flow

```text
Login / Registration
        ↓
Browse Vegetables
        ↓
Search / Filter
        ↓
Product Details
        ↓
Select Quantity
        ↓
Add to Cart
        ↓
Delivery Address
        ↓
Checkout
        ↓
Payment
        ↓
Order Confirmation
        ↓
Order Tracking
        ↓
Delivery
        ↓
Order Completed
```

## 🏗️ Platform Integration

Vegz User is one client application in the larger Vegz platform.

```text
                    Vegz Platform

     ┌──────────────┬──────────────┬──────────────┐
     │              │              │              │
 vegz-user      vegz-shop      vegz-agent     vegz-admin
     │              │              │              │
     └──────────────┴───────┬──────┴──────────────┘
                            │
                       HTTPS / REST
                            │
                            ▼
                    vegz-backend
                   Node.js + Express
                            │
                            ▼
                          MySQL
```

The application uses the shared Vegz backend API for authentication, products, inventory, carts, orders, payments, delivery tracking, and other customer operations.

## 📱 Technology

- React Native
- Expo
- Android
- REST API
- Secure authentication
- Backend-driven business logic

## 🔐 Security

Security is part of the application design from the beginning.

- HTTPS-only API communication
- Secure authentication and token handling
- Server-side authorization
- Input validation
- No backend secrets in the mobile application
- Secure payment verification through the backend
- Protection against unauthorized access

## 🚧 Project Status

**Under Development**

The application will be developed incrementally, starting with the customer experience and then integrating the complete Vegz marketplace backend.

## 📌 Related Vegz Applications

- `vegz-user` — Customer Android application
- `vegz-shop` — Shop/farmer/vendor application
- `vegz-agent` — Delivery-agent application
- `vegz-admin` — Admin web application
- `vegz-website` — Customer website
- `vegz-backend` — Shared modular monolith backend

## 📄 License

This project is currently intended for development and educational purposes.


## 🧑‍💻 Current Development

The initial customer-app foundation is now in place:

- Expo + React Native Android application
- TypeScript configuration
- Home screen with vegetable product cards
- Product details screen
- Cart screen foundation
- Profile screen foundation
- Backend API configuration via `EXPO_PUBLIC_API_BASE_URL`
- Product API service foundation

## 🔄 CI/CD

GitHub Actions are included for the application lifecycle:

### CI
Runs on pushes and pull requests to `main`:

1. Install dependencies
2. Type-check the TypeScript code
3. Export the Android bundle

### Android Build
Runs manually or when a version tag such as `v0.1.0` is pushed.

The Android build uses **Expo EAS**. Configure the repository secret:

```text
EXPO_TOKEN
```

The token must be stored only in GitHub Actions Secrets and never committed to the repository.

## 🚀 Development

Install dependencies:

```bash
npm install
```

Start Expo:

```bash
npm start
```

Set the backend API when required:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.vegz.online
```

The application will be connected to the real Vegz backend as the authentication, product, cart, order, payment, and delivery modules are implemented.
