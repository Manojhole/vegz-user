import hashlib
import os
import secrets
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

from .database import Base, engine, get_db
from .models import Address, OtpSession, Order, OrderItem, Product, User
from .schemas import (
    AddressIn, AddressOut, AuthOut, CartItemIn, OtpRequest, OtpVerify,
    OrderIn, ProductOut, UserOut,
)

load_dotenv()
APP_ENV = os.getenv("APP_ENV", "production").lower()
JWT_SECRET = os.getenv("JWT_SECRET", "local-dev-only-change-this-secret")
OTP_SECRET = os.getenv("OTP_SECRET", "local-dev-only-otp-secret")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "10080"))
OTP_TTL_MINUTES = int(os.getenv("OTP_TTL_MINUTES", "5"))
DELIVERY_FEE = Decimal(os.getenv("DELIVERY_FEE", "25"))
FREE_DELIVERY_MINIMUM = Decimal(os.getenv("FREE_DELIVERY_MINIMUM", "499.00"))

if APP_ENV == "production" and (
    JWT_SECRET == "local-dev-only-change-this-secret"
    or OTP_SECRET == "local-dev-only-otp-secret"
    or len(JWT_SECRET) < 32
    or len(OTP_SECRET) < 32
):
    raise RuntimeError("Set strong, separate JWT_SECRET and OTP_SECRET values before production.")

app = FastAPI(
    title="Vegz User API",
    version="0.1.0",
    description="Monolithic customer ordering API for Vegz. Shop, agent, and admin can share these database tables in later modules.",
)

origins = [
    item.strip()
    for item in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8000,http://127.0.0.1:8000,https://vegz.online,https://www.vegz.online",
    ).split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

SEED_PRODUCTS = [
    {
        "name": "Tomato", "slug": "tomato", "category": "Daily essentials",
        "description": "Juicy, ripe tomatoes for everyday cooking.",
        "image_url": "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("32.00"), "stock_qty": 120,
    },
    {
        "name": "Potato", "slug": "potato", "category": "Daily essentials",
        "description": "Fresh everyday potatoes, sorted with care.",
        "image_url": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("28.00"), "stock_qty": 180,
    },
    {
        "name": "Red Onion", "slug": "red-onion", "category": "Daily essentials",
        "description": "Kitchen-ready red onions with a bold flavour.",
        "image_url": "https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("36.00"), "stock_qty": 100,
    },
    {
        "name": "Carrot", "slug": "carrot", "category": "Fresh picks",
        "description": "Crunchy carrots, full of colour and freshness.",
        "image_url": "https://images.unsplash.com/photo-1445282768818-728615cc910a?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("45.00"), "stock_qty": 80,
    },
    {
        "name": "Spinach", "slug": "spinach", "category": "Leafy greens",
        "description": "Tender green leaves, great for dals and curries.",
        "image_url": "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=700&q=85",
        "unit": "bunch", "price": Decimal("20.00"), "stock_qty": 70,
    },
    {
        "name": "Broccoli", "slug": "broccoli", "category": "Fresh picks",
        "description": "Fresh green florets for colourful, healthy meals.",
        "image_url": "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=700&q=85",
        "unit": "pc", "price": Decimal("55.00"), "stock_qty": 45,
    },
    {
        "name": "Cabbage", "slug": "cabbage", "category": "Fresh picks",
        "description": "Firm, crisp cabbage for salads and stir-fries.",
        "image_url": "https://images.unsplash.com/photo-1594282486552-05f4d1e3d3c9?auto=format&fit=crop&w=700&q=85",
        "unit": "pc", "price": Decimal("30.00"), "stock_qty": 60,
    },
    {
        "name": "Green Capsicum", "slug": "green-capsicum", "category": "Fresh picks",
        "description": "Bright green capsicum with a clean, crisp bite.",
        "image_url": "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("60.00"), "stock_qty": 55,
    },
    {
        "name": "Cucumber", "slug": "cucumber", "category": "Fresh picks",
        "description": "Crisp cucumbers for salads.",
        "image_url": "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("35.00"), "stock_qty": 35,
    },
    {
        "name": "Cauliflower", "slug": "cauliflower", "category": "Fresh picks",
        "description": "Fresh florets for curries.",
        "image_url": "https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?auto=format&fit=crop&w=700&q=85",
        "unit": "pc", "price": Decimal("40.00"), "stock_qty": 35,
    },
    {
        "name": "Brinjal", "slug": "brinjal", "category": "Fresh picks",
        "description": "Glossy brinjals for home cooking.",
        "image_url": "https://images.unsplash.com/photo-1659261200848-1f3c2f8a0f19?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("42.00"), "stock_qty": 35,
    },
    {
        "name": "Lady Finger", "slug": "lady-finger", "category": "Fresh picks",
        "description": "Tender okra for Indian cooking.",
        "image_url": "https://images.unsplash.com/photo-1635350673954-9a2f5f2e5e9a?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("48.00"), "stock_qty": 35,
    },
    {
        "name": "Green Peas", "slug": "green-peas", "category": "Fresh picks",
        "description": "Sweet peas for curries and snacks.",
        "image_url": "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("80.00"), "stock_qty": 35,
    },
    {
        "name": "Beetroot", "slug": "beetroot", "category": "Fresh picks",
        "description": "Earthy beetroot for salads and juices.",
        "image_url": "https://images.unsplash.com/photo-1607305387299-a3d9611cd469?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("38.00"), "stock_qty": 35,
    },
    {
        "name": "Radish", "slug": "radish", "category": "Fresh picks",
        "description": "Fresh radish with a peppery crunch.",
        "image_url": "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("30.00"), "stock_qty": 35,
    },
    {
        "name": "Pumpkin", "slug": "pumpkin", "category": "Fresh picks",
        "description": "Sweet pumpkin for comforting meals.",
        "image_url": "https://images.unsplash.com/photo-1570586437263-ab629fccc818?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("32.00"), "stock_qty": 35,
    },
    {
        "name": "Bitter Gourd", "slug": "bitter-gourd", "category": "Fresh picks",
        "description": "Fresh karela for traditional recipes.",
        "image_url": "https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("50.00"), "stock_qty": 35,
    },
    {
        "name": "Bottle Gourd", "slug": "bottle-gourd", "category": "Fresh picks",
        "description": "Tender bottle gourd for light meals.",
        "image_url": "https://images.unsplash.com/photo-1594282486552-05f4d1e3d3c9?auto=format&fit=crop&w=700&q=85",
        "unit": "pc", "price": Decimal("35.00"), "stock_qty": 35,
    },
    {
        "name": "Green Beans", "slug": "green-beans", "category": "Fresh picks",
        "description": "Crisp beans for stir-fries and sabzi.",
        "image_url": "https://images.unsplash.com/photo-1567375698348-5d9d5ae99de0?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("55.00"), "stock_qty": 35,
    },
    {
        "name": "Sweet Corn", "slug": "sweet-corn", "category": "Fresh picks",
        "description": "Sweet corn for snacks and soups.",
        "image_url": "https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=700&q=85",
        "unit": "pc", "price": Decimal("25.00"), "stock_qty": 35,
    },
    {
        "name": "Garlic", "slug": "garlic", "category": "Daily essentials",
        "description": "Aromatic garlic for everyday flavour.",
        "image_url": "https://images.unsplash.com/photo-1615477550927-6ec8445fc5b5?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("120.00"), "stock_qty": 35,
    },
    {
        "name": "Ginger", "slug": "ginger", "category": "Daily essentials",
        "description": "Fresh ginger root for chai and curries.",
        "image_url": "https://images.unsplash.com/photo-1615485500704-8e990f9900f2?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("90.00"), "stock_qty": 35,
    },
    {
        "name": "Green Chilli", "slug": "green-chilli", "category": "Daily essentials",
        "description": "Green chillies to add a little heat.",
        "image_url": "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("60.00"), "stock_qty": 35,
    },
    {
        "name": "Coriander", "slug": "coriander", "category": "Leafy greens",
        "description": "Fragrant coriander bunches.",
        "image_url": "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=700&q=85",
        "unit": "bunch", "price": Decimal("15.00"), "stock_qty": 35,
    },
    {
        "name": "Mint", "slug": "mint", "category": "Leafy greens",
        "description": "Fresh mint for chutneys and drinks.",
        "image_url": "https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=700&q=85",
        "unit": "bunch", "price": Decimal("15.00"), "stock_qty": 35,
    },
    {
        "name": "Spring Onion", "slug": "spring-onion", "category": "Leafy greens",
        "description": "Spring onions for noodles and stir-fries.",
        "image_url": "https://images.unsplash.com/photo-1587049633312-76c8eb07bbc5?auto=format&fit=crop&w=700&q=85",
        "unit": "bunch", "price": Decimal("25.00"), "stock_qty": 35,
    },
    {
        "name": "Red Bell Pepper", "slug": "red-bell-pepper", "category": "Fresh picks",
        "description": "Sweet red pepper for colourful meals.",
        "image_url": "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("90.00"), "stock_qty": 35,
    },
    {
        "name": "Lettuce", "slug": "lettuce", "category": "Leafy greens",
        "description": "Crisp lettuce for salads and wraps.",
        "image_url": "https://images.unsplash.com/photo-1556801712-76c8eb07bbc9?auto=format&fit=crop&w=700&q=85",
        "unit": "pc", "price": Decimal("45.00"), "stock_qty": 35,
    },
    {
        "name": "Basmati Rice", "slug": "basmati-rice", "category": "Grocery",
        "description": "Fragrant rice for biryani and pulao.",
        "image_url": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("95.00"), "stock_qty": 60,
    },
    {
        "name": "Toor Dal", "slug": "toor-dal", "category": "Grocery",
        "description": "Split pigeon peas for everyday dal.",
        "image_url": "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("145.00"), "stock_qty": 60,
    },
    {
        "name": "Moong Dal", "slug": "moong-dal", "category": "Grocery",
        "description": "Moong dal for khichdi and soups.",
        "image_url": "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("125.00"), "stock_qty": 60,
    },
    {
        "name": "Chana Dal", "slug": "chana-dal", "category": "Grocery",
        "description": "Chana dal for curries and snacks.",
        "image_url": "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("95.00"), "stock_qty": 60,
    },
    {
        "name": "Wheat Flour", "slug": "wheat-flour", "category": "Grocery",
        "description": "Everyday atta for soft rotis.",
        "image_url": "https://images.unsplash.com/photo-1608198093002-ad4e005484d7?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("48.00"), "stock_qty": 60,
    },
    {
        "name": "Besan", "slug": "besan", "category": "Grocery",
        "description": "Gram flour for pakoras and chilla.",
        "image_url": "https://images.unsplash.com/photo-1608198093002-ad4e005484d7?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("85.00"), "stock_qty": 60,
    },
    {
        "name": "Cooking Oil", "slug": "cooking-oil", "category": "Grocery",
        "description": "Kitchen oil for daily meal preparation.",
        "image_url": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=700&q=85",
        "unit": "L", "price": Decimal("145.00"), "stock_qty": 60,
    },
    {
        "name": "Sugar", "slug": "sugar", "category": "Grocery",
        "description": "Fine sugar for tea and baking.",
        "image_url": "https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("48.00"), "stock_qty": 60,
    },
    {
        "name": "Salt", "slug": "salt", "category": "Grocery",
        "description": "Essential everyday cooking salt.",
        "image_url": "https://images.unsplash.com/photo-1518110925495-5fe2fda0442f?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("22.00"), "stock_qty": 60,
    },
    {
        "name": "Tea Powder", "slug": "tea-powder", "category": "Grocery",
        "description": "Everyday tea for your morning cup.",
        "image_url": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=700&q=85",
        "unit": "250 g", "price": Decimal("120.00"), "stock_qty": 60,
    },
    {
        "name": "Coffee", "slug": "coffee", "category": "Grocery",
        "description": "Rich coffee for your daily brew.",
        "image_url": "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=700&q=85",
        "unit": "200 g", "price": Decimal("160.00"), "stock_qty": 60,
    },
    {
        "name": "Turmeric Powder", "slug": "turmeric-powder", "category": "Spices",
        "description": "Golden turmeric powder for cooking.",
        "image_url": "https://images.unsplash.com/photo-1615485500704-8e990f9900f2?auto=format&fit=crop&w=700&q=85",
        "unit": "100 g", "price": Decimal("35.00"), "stock_qty": 60,
    },
    {
        "name": "Red Chilli Powder", "slug": "red-chilli-powder", "category": "Spices",
        "description": "Ground chilli for warmth and colour.",
        "image_url": "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=700&q=85",
        "unit": "100 g", "price": Decimal("42.00"), "stock_qty": 60,
    },
    {
        "name": "Cumin Seeds", "slug": "cumin-seeds", "category": "Spices",
        "description": "Aromatic cumin for seasoning.",
        "image_url": "https://images.unsplash.com/photo-1599909533605-f2c5a5a4c2ca?auto=format&fit=crop&w=700&q=85",
        "unit": "100 g", "price": Decimal("38.00"), "stock_qty": 60,
    },
    {
        "name": "Mustard Seeds", "slug": "mustard-seeds", "category": "Spices",
        "description": "Mustard seeds for tadka and pickles.",
        "image_url": "https://images.unsplash.com/photo-1603905179139-2e0a8c1e5f68?auto=format&fit=crop&w=700&q=85",
        "unit": "100 g", "price": Decimal("28.00"), "stock_qty": 60,
    },
    {
        "name": "Poha", "slug": "poha", "category": "Grocery",
        "description": "Flattened rice for quick breakfasts.",
        "image_url": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("65.00"), "stock_qty": 60,
    },
    {
        "name": "Oats", "slug": "oats", "category": "Grocery",
        "description": "Rolled oats for breakfast and baking.",
        "image_url": "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=700&q=85",
        "unit": "500 g", "price": Decimal("85.00"), "stock_qty": 60,
    },
    {
        "name": "Peanuts", "slug": "peanuts", "category": "Grocery",
        "description": "Crunchy peanuts for snacks and chutneys.",
        "image_url": "https://images.unsplash.com/photo-1567892737950-30c4db37cd89?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("140.00"), "stock_qty": 60,
    },
    {
        "name": "Jaggery", "slug": "jaggery", "category": "Grocery",
        "description": "Traditional jaggery for sweets and drinks.",
        "image_url": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=700&q=85",
        "unit": "kg", "price": Decimal("70.00"), "stock_qty": 60,
    },
    {
        "name": "Pasta", "slug": "pasta", "category": "Grocery",
        "description": "Pantry pasta for quick family meals.",
        "image_url": "https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=700&q=85",
        "unit": "500 g", "price": Decimal("75.00"), "stock_qty": 60,
    }
]

Base.metadata.create_all(bind=engine)


def seed_products() -> None:
    from .database import SessionLocal

    db = SessionLocal()
    try:
        existing_slugs = set(db.scalars(select(Product.slug)).all())
        missing = [Product(**item) for item in SEED_PRODUCTS if item["slug"] not in existing_slugs]
        if missing:
            db.add_all(missing)
            db.commit()
    finally:
        db.close()


seed_products()


def _otp_digest(phone: str, otp: str) -> str:
    return hashlib.sha256(f"{phone}:{otp}:{OTP_SECRET}".encode("utf-8")).hexdigest()


def _create_access_token(user_id: int) -> str:
    expires = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expires}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _require_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in with your mobile number.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Account not found. Please sign in again.")
    return user


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _order_payload(order: Order) -> dict:
    return {
        "id": order.id,
        "tracking_code": order.tracking_code,
        "subtotal": float(order.subtotal),
        "delivery_fee": float(order.delivery_fee),
        "total_amount": float(order.total_amount),
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "status": order.status,
        "created_at": order.created_at.isoformat() + "Z",
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "unit": item.unit,
                "unit_price": float(item.unit_price),
                "quantity": item.quantity,
                "line_total": float(item.line_total),
            }
            for item in order.items
        ],
    }


@app.get("/api/store-config")
def store_config():
    return {
        "currency": "INR",
        "delivery_fee": float(DELIVERY_FEE),
        "free_delivery_minimum": float(FREE_DELIVERY_MINIMUM),
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "vegz-user-api"}


@app.get("/api/products", response_model=list[ProductOut])
def list_products(
    category: str | None = Query(default=None, max_length=60),
    db: Session = Depends(get_db),
):
    query = select(Product).where(Product.is_active.is_(True), Product.stock_qty > 0).order_by(Product.id)
    if category and category.lower() != "all":
        query = query.where(Product.category == category)
    return list(db.scalars(query).all())


@app.post("/api/auth/request-otp")
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)):
    if APP_ENV != "development":
        raise HTTPException(
            status_code=503,
            detail="SMS OTP provider is not configured. Configure an approved SMS provider before enabling non-development checkout.",
        )
    now = datetime.utcnow()
    recent = db.scalar(
        select(OtpSession)
        .where(OtpSession.phone == payload.phone, OtpSession.created_at > now - timedelta(seconds=45))
        .order_by(desc(OtpSession.created_at))
        .limit(1)
    )
    if recent:
        raise HTTPException(status_code=429, detail="Please wait a moment before requesting another code.")

    otp = f"{secrets.randbelow(1_000_000):06d}"
    session = OtpSession(
        phone=payload.phone,
        otp_hash=_otp_digest(payload.phone, otp),
        expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
        attempts=0,
    )
    db.add(session)
    db.commit()

    # Production integration point: send this code through an approved SMS provider.
    # Never expose the OTP in production API responses or logs.
    response = {
        "message": "Verification code requested. Connect an SMS provider before production use.",
        "expires_in_seconds": OTP_TTL_MINUTES * 60,
    }
    if APP_ENV == "development":
        response["demo_otp"] = otp
    return response


@app.post("/api/auth/verify-otp", response_model=AuthOut)
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    session = db.scalar(
        select(OtpSession)
        .where(OtpSession.phone == payload.phone)
        .order_by(desc(OtpSession.created_at))
        .limit(1)
    )
    now = datetime.utcnow()
    if (
        session is None
        or session.verified_at is not None
        or session.expires_at < now
        or session.attempts >= 5
        or session.otp_hash != _otp_digest(payload.phone, payload.otp)
    ):
        if session is not None and session.verified_at is None:
            session.attempts += 1
            db.commit()
        raise HTTPException(status_code=400, detail="That code is invalid or expired. Request a new code.")
    session.verified_at = now
    user = db.scalar(select(User).where(User.phone == payload.phone))
    if user is None:
        user = User(phone=payload.phone)
        db.add(user)
        db.flush()
    db.commit()
    db.refresh(user)
    return {
        "access_token": _create_access_token(user.id),
        "token_type": "bearer",
        "user": {"id": user.id, "phone": user.phone, "full_name": user.full_name},
    }


@app.get("/api/me", response_model=UserOut)
def get_me(user: User = Depends(_require_user)):
    return user


@app.get("/api/addresses", response_model=list[AddressOut])
def list_addresses(user: User = Depends(_require_user), db: Session = Depends(get_db)):
    return list(
        db.scalars(
            select(Address).where(Address.user_id == user.id).order_by(desc(Address.is_default), desc(Address.created_at))
        ).all()
    )


@app.post("/api/addresses", response_model=AddressOut, status_code=201)
def create_address(payload: AddressIn, user: User = Depends(_require_user), db: Session = Depends(get_db)):
    phone = "".join(ch for ch in payload.phone if ch.isdigit() or ch == "+")
    if payload.is_default:
        for old in db.scalars(select(Address).where(Address.user_id == user.id)).all():
            old.is_default = False
    address = Address(
        user_id=user.id,
        label=payload.label,
        recipient_name=payload.recipient_name.strip(),
        phone=phone,
        line1=payload.line1.strip(),
        line2=payload.line2.strip(),
        landmark=payload.landmark.strip(),
        city=payload.city.strip(),
        state=payload.state.strip(),
        postal_code=payload.postal_code.strip(),
        is_default=payload.is_default,
    )
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


@app.post("/api/orders", status_code=201)
def create_order(payload: OrderIn, user: User = Depends(_require_user), db: Session = Depends(get_db)):
    address = db.scalar(
        select(Address).where(Address.id == payload.address_id, Address.user_id == user.id)
    )
    if address is None:
        raise HTTPException(status_code=404, detail="Choose a saved delivery address.")

    # Enforce one supplier department per order; vegetables and grocery use separate fulfilment.
    # Grocery/spices are the grocery department; other seeded categories are vegetables.
    # Validate from database records, not from client-provided department labels.
    # Merge duplicate product rows and validate quantities before changing stock.
    quantities: dict[int, int] = {}
    for item in payload.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
    if any(qty > 99 for qty in quantities.values()):
        raise HTTPException(status_code=400, detail="Maximum quantity per vegetable is 99.")

    products: dict[int, Product] = {}
    for product_id, quantity in quantities.items():
        product = db.scalar(select(Product).where(Product.id == product_id, Product.is_active.is_(True)).with_for_update())
        if product is None:
            raise HTTPException(status_code=400, detail="One of your vegetables is no longer available.")
        if product.stock_qty < quantity:
            raise HTTPException(status_code=409, detail=f"Only {product.stock_qty} {product.unit} of {product.name} remain.")
        products[product_id] = product

    departments = {
        "grocery" if product.category.strip().lower() in {"grocery", "spices"} else "vegetables"
        for product in products.values()
    }
    if len(departments) > 1:
        raise HTTPException(
            status_code=400,
            detail="Vegetables and grocery have separate suppliers and deliveries. Place separate orders for each department.",
        )

    subtotal = Decimal("0.00")
    lines: list[dict] = []
    for product_id, quantity in quantities.items():
        product = products[product_id]
        unit_price = Decimal(str(product.price))
        line_total = _money(unit_price * quantity)
        subtotal += line_total
        lines.append({
            "product": product,
            "quantity": quantity,
            "unit_price": unit_price,
            "line_total": line_total,
        })
    subtotal = _money(subtotal)
    delivery_fee = Decimal("0.00") if subtotal >= FREE_DELIVERY_MINIMUM else DELIVERY_FEE
    total = _money(subtotal + delivery_fee)

    order = Order(
        tracking_code="VGZ-" + secrets.token_hex(4).upper(),
        user_id=user.id,
        address_id=address.id,
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        total_amount=total,
        payment_method=payload.payment_method,
        payment_status="pending",
        status="placed",
    )
    db.add(order)
    for line in lines:
        product = line["product"]
        product.stock_qty -= line["quantity"]
        order.items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                unit=product.unit,
                unit_price=line["unit_price"],
                quantity=line["quantity"],
                line_total=line["line_total"],
            )
        )
    db.commit()
    db.refresh(order)
    result = _order_payload(order)
    result["message"] = (
        "Order placed. Online payment is still pending until a payment gateway is configured."
        if payload.payment_method == "online"
        else "Order placed. Pay the delivery agent when your order arrives."
    )
    return result


@app.get("/api/orders")
def list_orders(user: User = Depends(_require_user), db: Session = Depends(get_db)):
    orders = db.scalars(
        select(Order).options(joinedload(Order.items)).where(Order.user_id == user.id).order_by(desc(Order.created_at))
    ).unique().all()
    return [_order_payload(order) for order in orders]


@app.get("/api/orders/{order_id}")
def get_order(order_id: int, user: User = Depends(_require_user), db: Session = Depends(get_db)):
    order = db.scalar(
        select(Order)
        .options(joinedload(Order.items))
        .where(Order.id == order_id, Order.user_id == user.id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    return _order_payload(order)


@app.get("/api/orders/{order_id}/track")
def track_order(order_id: int, user: User = Depends(_require_user), db: Session = Depends(get_db)):
    order = db.scalar(select(Order).where(Order.id == order_id, Order.user_id == user.id))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    steps = [
        {"status": "placed", "label": "Order placed"},
        {"status": "confirmed", "label": "Shop confirmed"},
        {"status": "packed", "label": "Freshness check & packed"},
        {"status": "out_for_delivery", "label": "Out for delivery"},
        {"status": "delivered", "label": "Delivered"},
    ]
    current = next((i for i, step in enumerate(steps) if step["status"] == order.status), 0)
    return {
        "order_id": order.id,
        "tracking_code": order.tracking_code,
        "status": order.status,
        "payment_status": order.payment_status,
        "updated_at": order.updated_at.isoformat() + "Z",
        "steps": [
            {**step, "complete": index <= current, "current": index == current}
            for index, step in enumerate(steps)
        ],
    }


frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
