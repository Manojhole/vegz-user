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
