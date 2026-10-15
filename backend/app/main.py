import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, inspect, select, text
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
AWS_REGION = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "ap-south-1"))
OTP_MESSAGE_TEMPLATE = os.getenv("OTP_MESSAGE_TEMPLATE", "Your Vegz verification code is {otp}. It expires in {minutes} minutes. Do not share this code.")
logger = logging.getLogger("vegz.auth")
DELIVERY_FEE = Decimal(os.getenv("DELIVERY_FEE", "25"))
FREE_DELIVERY_MINIMUM = Decimal(os.getenv("FREE_DELIVERY_MINIMUM", "499.00"))
SHOP_SERVICE_URL = os.getenv("SHOP_SERVICE_URL", "").rstrip("/")
SHOP_PUBLIC_URL = os.getenv("SHOP_PUBLIC_URL", SHOP_SERVICE_URL).rstrip("/")
SHOP_INTERNAL_TOKEN = os.getenv("SHOP_INTERNAL_TOKEN", "")
AGENT_SERVICE_URL = os.getenv("AGENT_SERVICE_URL", "").rstrip("/")
DISPATCH_SHARED_SECRET = os.getenv("DISPATCH_SHARED_SECRET", "")

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
        "image_url": "",
        "unit": "kg", "price": Decimal("50.00"), "stock_qty": 35,
    },
    {
        "name": "Bottle Gourd", "slug": "bottle-gourd", "category": "Fresh picks",
        "description": "Tender bottle gourd for light meals.",
        "image_url": "",
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
        "image_url": "",
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
        "image_url": "",
        "unit": "kg", "price": Decimal("95.00"), "stock_qty": 60,
    },
    {
        "name": "Toor Dal", "slug": "toor-dal", "category": "Grocery",
        "description": "Split pigeon peas for everyday dal.",
        "image_url": "",
        "unit": "kg", "price": Decimal("145.00"), "stock_qty": 60,
    },
    {
        "name": "Moong Dal", "slug": "moong-dal", "category": "Grocery",
        "description": "Moong dal for khichdi and soups.",
        "image_url": "",
        "unit": "kg", "price": Decimal("125.00"), "stock_qty": 60,
    },
    {
        "name": "Chana Dal", "slug": "chana-dal", "category": "Grocery",
        "description": "Chana dal for curries and snacks.",
        "image_url": "",
        "unit": "kg", "price": Decimal("95.00"), "stock_qty": 60,
    },
    {
        "name": "Wheat Flour", "slug": "wheat-flour", "category": "Grocery",
        "description": "Everyday atta for soft rotis.",
        "image_url": "",
        "unit": "kg", "price": Decimal("48.00"), "stock_qty": 60,
    },
    {
        "name": "Besan", "slug": "besan", "category": "Grocery",
        "description": "Gram flour for pakoras and chilla.",
        "image_url": "",
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
    },
    {
        "name": "Drumstick", "slug": "drumstick", "category": "Fresh picks",
        "description": "Tender drumsticks for sambar and saaru.",
        "image_url": "",
        "unit": "kg", "price": Decimal("45.00"), "stock_qty": 40,
    },
    {
        "name": "Ridge Gourd", "slug": "ridge-gourd", "category": "Fresh picks",
        "description": "Fresh ridge gourd for palya and dal.",
        "image_url": "",
        "unit": "kg", "price": Decimal("40.00"), "stock_qty": 40,
    },
    {
        "name": "Snake Gourd", "slug": "snake-gourd", "category": "Fresh picks",
        "description": "Mild snake gourd for everyday curries.",
        "image_url": "",
        "unit": "kg", "price": Decimal("35.00"), "stock_qty": 35,
    },
    {
        "name": "Cluster Beans", "slug": "cluster-beans", "category": "Fresh picks",
        "description": "Cluster beans for Karnataka-style palya.",
        "image_url": "",
        "unit": "kg", "price": Decimal("50.00"), "stock_qty": 35,
    },
    {
        "name": "Ivy Gourd", "slug": "ivy-gourd", "category": "Fresh picks",
        "description": "Tender tindora for quick stir-fries.",
        "image_url": "",
        "unit": "kg", "price": Decimal("45.00"), "stock_qty": 35,
    },
    {
        "name": "Raw Banana", "slug": "raw-banana", "category": "Fresh picks",
        "description": "Raw banana for palya and shallow-fried sides.",
        "image_url": "",
        "unit": "kg", "price": Decimal("38.00"), "stock_qty": 35,
    },
    {
        "name": "Curry Leaves", "slug": "curry-leaves", "category": "Leafy greens",
        "description": "Aromatic curry leaves for everyday tempering.",
        "image_url": "",
        "unit": "bunch", "price": Decimal("10.00"), "stock_qty": 70,
    },
    {
        "name": "Dill Leaves", "slug": "dill-leaves", "category": "Leafy greens",
        "description": "Fresh sabsige soppu for palya and akki rotti.",
        "image_url": "",
        "unit": "bunch", "price": Decimal("20.00"), "stock_qty": 40,
    },
    {
        "name": "Fenugreek Leaves", "slug": "fenugreek-leaves", "category": "Leafy greens",
        "description": "Fresh menthya soppu for palya and parathas.",
        "image_url": "",
        "unit": "bunch", "price": Decimal("20.00"), "stock_qty": 40,
    },
    {
        "name": "Drumstick Leaves", "slug": "drumstick-leaves", "category": "Leafy greens",
        "description": "Fresh nugge soppu for saaru and palya.",
        "image_url": "",
        "unit": "bunch", "price": Decimal("20.00"), "stock_qty": 35,
    },
    {
        "name": "Coconut", "slug": "coconut", "category": "Daily essentials",
        "description": "Fresh coconut for chutney, palya and cooking.",
        "image_url": "",
        "unit": "pc", "price": Decimal("35.00"), "stock_qty": 50,
    },
    {
        "name": "Lemon", "slug": "lemon", "category": "Daily essentials",
        "description": "Juicy lemons for chitranna, drinks and seasoning.",
        "image_url": "",
        "unit": "kg", "price": Decimal("70.00"), "stock_qty": 40,
    },
    {
        "name": "Ragi Flour", "slug": "ragi-flour", "category": "Grocery",
        "description": "Finger millet flour for ragi mudde and ragi rotti.",
        "image_url": "",
        "unit": "kg", "price": Decimal("65.00"), "stock_qty": 60,
    },
    {
        "name": "Jowar Flour", "slug": "jowar-flour", "category": "Grocery",
        "description": "Jowar flour for traditional jolada rotti.",
        "image_url": "",
        "unit": "kg", "price": Decimal("70.00"), "stock_qty": 50,
    },
    {
        "name": "Rice Flour", "slug": "rice-flour", "category": "Grocery",
        "description": "Rice flour for akki rotti and everyday recipes.",
        "image_url": "",
        "unit": "kg", "price": Decimal("55.00"), "stock_qty": 50,
    },
    {
        "name": "Rava", "slug": "rava", "category": "Grocery",
        "description": "Semolina for upma, kesari bath and breakfast.",
        "image_url": "",
        "unit": "kg", "price": Decimal("55.00"), "stock_qty": 60,
    },
    {
        "name": "Urad Dal", "slug": "urad-dal", "category": "Grocery",
        "description": "Urad dal for idli, dosa batter and vada.",
        "image_url": "",
        "unit": "kg", "price": Decimal("125.00"), "stock_qty": 50,
    },
    {
        "name": "Masoor Dal", "slug": "masoor-dal", "category": "Grocery",
        "description": "Masoor dal for quick everyday dal.",
        "image_url": "",
        "unit": "kg", "price": Decimal("105.00"), "stock_qty": 50,
    },
    {
        "name": "Tamarind", "slug": "tamarind", "category": "Grocery",
        "description": "Tamarind for saaru, gojju and puliyogare.",
        "image_url": "",
        "unit": "250 g", "price": Decimal("45.00"), "stock_qty": 50,
    },
    {
        "name": "Dry Coconut", "slug": "dry-coconut", "category": "Grocery",
        "description": "Dry coconut for chutney pudi and traditional masala.",
        "image_url": "",
        "unit": "pc", "price": Decimal("45.00"), "stock_qty": 35,
    },
    {
        "name": "Groundnut Oil", "slug": "groundnut-oil", "category": "Grocery",
        "description": "Groundnut oil for everyday cooking.",
        "image_url": "",
        "unit": "L", "price": Decimal("185.00"), "stock_qty": 50,
    },
    {
        "name": "Coconut Oil", "slug": "coconut-oil", "category": "Grocery",
        "description": "Coconut oil for cooking and coastal recipes.",
        "image_url": "",
        "unit": "L", "price": Decimal("210.00"), "stock_qty": 35,
    },
    {
        "name": "Sambar Powder", "slug": "sambar-powder", "category": "Spices",
        "description": "Sambar powder for everyday saaru and sambar.",
        "image_url": "",
        "unit": "200 g", "price": Decimal("75.00"), "stock_qty": 40,
    },
    {
        "name": "Rasam Powder", "slug": "rasam-powder", "category": "Spices",
        "description": "Rasam powder for a quick home-style saaru.",
        "image_url": "",
        "unit": "100 g", "price": Decimal("45.00"), "stock_qty": 40,
    },
    {
        "name": "Chutney Pudi", "slug": "chutney-pudi", "category": "Spices",
        "description": "Karnataka-style chutney pudi for rotti and idli.",
        "image_url": "",
        "unit": "200 g", "price": Decimal("85.00"), "stock_qty": 40,
    },
    {
        "name": "Byadgi Chilli", "slug": "byadgi-chilli", "category": "Spices",
        "description": "Byadgi chillies for colour and flavour in masala.",
        "image_url": "",
        "unit": "100 g", "price": Decimal("55.00"), "stock_qty": 35,
    },
    {
        "name": "Papad", "slug": "papad", "category": "Grocery",
        "description": "Crispy papad for everyday meals.",
        "image_url": "",
        "unit": "200 g", "price": Decimal("55.00"), "stock_qty": 40,
    },
    {
        "name": "Vermicelli", "slug": "vermicelli", "category": "Grocery",
        "description": "Vermicelli for upma, payasa and quick snacks.",
        "image_url": "",
        "unit": "400 g", "price": Decimal("45.00"), "stock_qty": 45,
    },
    {
        "name": "Green Gram Whole", "slug": "green-gram-whole", "category": "Grocery",
        "description": "Whole green gram for usal, sprouts and palya.",
        "image_url": "",
        "unit": "kg", "price": Decimal("125.00"), "stock_qty": 40,
    },
    {
        "name": "Horse Gram", "slug": "horse-gram", "category": "Grocery",
        "description": "Huruli kaalu for saaru and traditional recipes.",
        "image_url": "",
        "unit": "kg", "price": Decimal("100.00"), "stock_qty": 40,
    },
]

Base.metadata.create_all(bind=engine)
with engine.begin() as connection:
    migrations = {
        "products": {"shop_id": "INTEGER NULL", "shop_name": "VARCHAR(120) NOT NULL DEFAULT ''", "shop_address": "VARCHAR(400) NOT NULL DEFAULT ''", "remote_product_id": "INTEGER NULL", "image_urls": "TEXT NOT NULL DEFAULT '[]'"},
        "order_items": {"shop_id": "INTEGER NULL", "shop_name": "VARCHAR(120) NOT NULL DEFAULT ''"},
    }
    for table, columns_to_add in migrations.items():
        existing_columns = {column["name"] for column in inspect(engine).get_columns(table)}
        for column_name, column_sql in columns_to_add.items():
            if column_name not in existing_columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column_name} {column_sql}"))


def seed_products() -> None:
    from .database import SessionLocal

    db = SessionLocal()
    try:
        existing_products = {product.slug: product for product in db.scalars(select(Product)).all()}
        missing = []
        for item in SEED_PRODUCTS:
            existing = existing_products.get(item["slug"])
            if existing is None:
                missing.append(Product(**item))
            elif item.get("image_url") == "":
                # Use the product-specific icon fallback for images known to be broken or mismatched.
                existing.image_url = ""
        if missing or any(item.get("image_url") == "" and item["slug"] in existing_products for item in SEED_PRODUCTS):
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


def _product_payload(product: Product) -> dict:
    try:
        images = json.loads(product.image_urls or "[]")
    except (TypeError, ValueError):
        images = []
    if not images and product.image_url:
        images = [product.image_url]
    return {
        "id": product.id, "name": product.name, "slug": product.slug,
        "category": product.category, "description": product.description,
        "image_url": product.image_url, "image_urls": images[:3],
        "unit": product.unit, "price": float(product.price), "stock_qty": product.stock_qty,
        "shop_id": product.shop_id, "shop_name": product.shop_name, "shop_address": product.shop_address,
    }


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
                "line_total": float(item.line_total), "shop_id": item.shop_id, "shop_name": item.shop_name,
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


@app.get("/api/products")
def list_products(category: str | None = Query(default=None, max_length=60), city: str | None = Query(default=None, max_length=100), db: Session = Depends(get_db)):
    if SHOP_SERVICE_URL:
        try:
            marketplace_url = SHOP_SERVICE_URL + "/api/marketplace"
            params = {"city": " ".join(city.split()).title()} if city and city.strip() else {}
            response = httpx.get(marketplace_url, params=params, timeout=12.0)
            response.raise_for_status()
            marketplace = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Could not load the live shop catalog. Check SHOP_SERVICE_URL.") from exc
        db.query(Product).filter(Product.shop_id.is_not(None)).update({Product.is_active: False}, synchronize_session=False)
        for shop in marketplace:
            shop_id = int(shop["shop_id"])
            for remote in shop.get("products", []):
                remote_id = int(remote["id"])
                product = db.scalar(select(Product).where(Product.shop_id == shop_id, Product.remote_product_id == remote_id))
                images = remote.get("image_urls") or ([remote["image_url"]] if remote.get("image_url") else [])
                images = [image if str(image).startswith(("http://", "https://")) else SHOP_PUBLIC_URL + str(image) for image in images]
                values = {
                    "name": remote["name"], "slug": f"shop-{shop_id}-product-{remote_id}",
                    "category": ((remote.get("category", "Grocery") if remote.get("category") in {"Grocery", "Spices"} else "Grocery") if shop.get("shop_type", "vegetable") == "grocery" else (remote.get("category", "Vegetables") if remote.get("category", "Vegetables") not in {"Grocery", "Spices"} else "Vegetables")), "description": remote.get("description", ""),
                    "image_url": images[0] if images else "", "image_urls": json.dumps(images[:3]),
                    "unit": remote.get("unit", "kg"), "price": Decimal(str(remote["price"])),
                    "stock_qty": int(remote.get("stock_qty", 0)), "is_active": bool(remote.get("customer_can_order", True)),
                    "shop_id": shop_id, "shop_name": shop.get("shop_name", "Vegz Shop"),
                    "shop_address": shop.get("shop_address", ""), "remote_product_id": remote_id,
                }
                if product is None:
                    db.add(Product(**values))
                else:
                    for key, value in values.items():
                        setattr(product, key, value)
        db.commit()
        query = select(Product).where(Product.shop_id.is_not(None), Product.is_active.is_(True), Product.stock_qty > 0).order_by(Product.shop_name, Product.category, Product.name)
        if category and category.lower() != "all":
            query = query.where(Product.category == category)
    else:
        query = select(Product).where(Product.is_active.is_(True), Product.stock_qty > 0).order_by(Product.category, Product.name)
        if category and category.lower() != "all":
            query = query.where(Product.category == category)
    return [_product_payload(product) for product in db.scalars(query).all()]


@app.post("/api/auth/request-otp")
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)):
    sms_enabled = os.getenv("OTP_PROVIDER", "demo" if APP_ENV == "development" else "none").strip().lower() == "sns"
    if APP_ENV != "development" and not sms_enabled:
        raise HTTPException(
            status_code=503,
            detail="SMS OTP is not configured. Set OTP_PROVIDER=sns and configure AWS SNS access before enabling checkout.",
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

    # AWS SNS sends codes to verified test numbers in the SNS SMS sandbox.
    # Credentials must come from environment configuration or an attached IAM role.
    if sms_enabled:
        try:
            message = OTP_MESSAGE_TEMPLATE.format(otp=otp, minutes=OTP_TTL_MINUTES)
            sns = boto3.client("sns", region_name=AWS_REGION)
            sns.publish(
                PhoneNumber=payload.phone,
                Message=message,
                MessageAttributes={
                    "AWS.SNS.SMS.SMSType": {
                        "DataType": "String",
                        "StringValue": os.getenv("SNS_SMS_TYPE", "Transactional"),
                    }
                },
            )
        except (BotoCoreError, ClientError, ValueError) as exc:
            db.delete(session)
            db.commit()
            logger.warning("SNS OTP delivery failed (%s).", type(exc).__name__)
            raise HTTPException(
                status_code=502,
                detail="Could not send the verification SMS. Check AWS SNS region, permissions, sandbox registration, and SMS spending limits.",
            ) from exc

    response = {
        "message": "Verification code sent." if sms_enabled else "Demo verification code created.",
        "expires_in_seconds": OTP_TTL_MINUTES * 60,
    }
    if APP_ENV == "development" and not sms_enabled:
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
    if APP_ENV == "production" and not SHOP_SERVICE_URL:
        raise HTTPException(status_code=503, detail="Live shop routing is not configured. Set SHOP_SERVICE_URL before accepting production orders.")

    # Merge duplicate product rows and validate quantities before changing stock.
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

    tracking_code = "VGZ-" + secrets.token_hex(4).upper()
    remote_products = [product for product in products.values() if product.shop_id is not None]
    shop_orders = []
    pickup_stops = []
    if remote_products:
        if len(remote_products) != len(products):
            raise HTTPException(status_code=400, detail="Refresh your basket before checkout; one or more items are from an outdated catalog.")
        # Never dispatch a basket to shops outside the saved delivery address city.
        try:
            city_response = httpx.get(SHOP_SERVICE_URL + "/api/marketplace", params={"city": " ".join(address.city.split()).title()}, timeout=8.0)
            city_response.raise_for_status()
            city_shop_ids = {int(item["shop_id"]) for item in city_response.json()}
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(status_code=502, detail="Could not verify shop coverage for this delivery city. Please try again.") from exc
        if any(product.shop_id not in city_shop_ids for product in remote_products):
            raise HTTPException(status_code=409, detail=f"Your basket contains items outside {address.city}. Change your delivery address or refresh the catalog for {address.city}.")
        if not SHOP_SERVICE_URL or len(SHOP_INTERNAL_TOKEN) < 32 or not AGENT_SERVICE_URL or len(DISPATCH_SHARED_SECRET) < 32:
            raise HTTPException(status_code=503, detail="Multi-shop checkout is not configured. Set SHOP_SERVICE_URL, SHOP_INTERNAL_TOKEN, AGENT_SERVICE_URL and DISPATCH_SHARED_SECRET.")
        grouped: dict[int, list[dict]] = {}
        for line in lines:
            product = line["product"]
            grouped.setdefault(int(product.shop_id), []).append({
                "product_id": int(product.remote_product_id),
                "quantity": int(line["quantity"]),
                "product_name": product.name,
            })
        address_text = ", ".join(part for part in [
            address.line1, address.line2, address.landmark, address.city,
            address.state, address.postal_code,
        ] if part)
        try:
            availability = httpx.get(AGENT_SERVICE_URL + "/api/internal/availability",
                params={"city": " ".join(address.city.split()).title()},
                headers={"Authorization": "Bearer " + DISPATCH_SHARED_SECRET}, timeout=8.0)
            availability.raise_for_status()
            if not availability.json().get("available"):
                raise HTTPException(status_code=409, detail="No delivery agent is online right now. Please try again shortly.")
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Could not check delivery availability. Please try again.") from exc
        for shop_id, shop_lines in grouped.items():
            body = {
                "shop_id": shop_id, "customer_name": address.recipient_name,
                "customer_phone": address.phone, "delivery_address": address_text,
                "order_reference": tracking_code,
                "items": [{"product_id": line["product_id"], "quantity": line["quantity"]} for line in shop_lines],
            }
            try:
                response = httpx.post(SHOP_SERVICE_URL + "/api/internal/orders", json=body,
                    headers={"Authorization": "Bearer " + SHOP_INTERNAL_TOKEN}, timeout=15.0)
                response.raise_for_status()
                shop_order = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise HTTPException(status_code=502, detail="A shop could not accept the order. Refresh stock and try again.") from exc
            shop_orders.append(shop_order)
            pickup_stops.append({
                "shop_name": shop_order.get("shop_name", "Vegz Shop"),
                "shop_phone": shop_order.get("shop_phone", ""),
                "pickup_address": shop_order.get("shop_address") or "Shop pickup address not configured",
                "item_summary": ", ".join(line["product_name"] + " x" + str(line["quantity"]) for line in shop_lines),
                "shop_order_id": str(shop_order.get("id", "")),
            })
        try:
            dispatch = httpx.post(AGENT_SERVICE_URL + "/api/internal/dispatch", json={
                "public_code": tracking_code, "customer_name": address.recipient_name,
                "customer_phone": address.phone, "delivery_address": address_text,
                "delivery_city": " ".join(address.city.split()).title(),
                "delivery_instructions": "", "pickup_stops": pickup_stops,
                "total_amount": float(total), "delivery_fee": float(delivery_fee),
                "payment_method": payload.payment_method, "payment_status": "pending",
            }, headers={"Authorization": "Bearer " + DISPATCH_SHARED_SECRET}, timeout=15.0)
            dispatch.raise_for_status()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Shop orders were created but delivery assignment failed. Contact Vegz support before retrying.") from exc

    order = Order(
        tracking_code=tracking_code, user_id=user.id, address_id=address.id,
        subtotal=subtotal, delivery_fee=delivery_fee, total_amount=total,
        payment_method=payload.payment_method, payment_status="pending", status="placed",
    )
    db.add(order)
    for line in lines:
        product = line["product"]
        product.stock_qty -= line["quantity"]
        order.items.append(OrderItem(
            product_id=product.id, product_name=product.name, unit=product.unit,
            unit_price=line["unit_price"], quantity=line["quantity"], line_total=line["line_total"],
            shop_id=product.shop_id, shop_name=product.shop_name,
        ))
    db.commit()
    db.refresh(order)
    result = _order_payload(order)
    if remote_products:
        result["shop_orders"] = shop_orders
        result["pickup_stops"] = pickup_stops
    if remote_products:
        result["message"] = (
            "Order placed and routed to each shop. Online payment is still pending until a payment gateway is configured."
            if payload.payment_method == "online"
            else "Order placed. The delivery agent will collect items from each shop and bring them to you."
        )
    else:
        result["message"] = "Development order saved in the local catalog. Configure shop and agent service URLs to enable real multi-shop routing."
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
