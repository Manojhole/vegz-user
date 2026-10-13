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
APP_ENV = os.getenv("APP_ENV", "development").lower()
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
]

Base.metadata.create_all(bind=engine)


def seed_products() -> None:
    from .database import SessionLocal

    db = SessionLocal()
    try:
        existing = db.scalar(select(Product.id).limit(1))
        if existing is None:
            db.add_all([Product(**item) for item in SEED_PRODUCTS])
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
